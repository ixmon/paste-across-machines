import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

/**
 * Finish PGLite bootstrap during dev-server setup (before traffic). Vite awaits
 * async `configureServer` hooks. Production: `src/lib/db` kicks `ensureDbReady`
 * on import.
 */
function pgliteBootstrapPlugin(): Plugin {
  return {
    name: "app-builder:pglite-bootstrap",
    apply: "serve",
    async configureServer(server) {
      try {
        const mod = (await server.ssrLoadModule("/src/lib/db.ts")) as {
          ensureDbReady?: () => Promise<void>;
        };
        if (typeof mod.ensureDbReady === "function") {
          await mod.ensureDbReady();
        }
      } catch (err) {
        console.error("[app-builder] DB bootstrap failed:", err);
        throw err;
      }
    },
  };
}

/**
 * Live-preview OAuth popup — handled HERE so the agent never has to create a
 * `/auth/popup` route (and cannot break it by scaffolding a React page that
 * paints the full app shell in the popup).
 *
 * `signIn` (client.ts) opens `/auth/popup?providerId=…` in a top-level window.
 * This middleware runs before TanStack Start, calls `handleAuthPopupRequest`,
 * and returns the 302 / completion HTML. Deployed apps do not use the popup
 * (full-page OAuth redirect), so `apply: "serve"` is enough.
 */
function authPopupPlugin(): Plugin {
  return {
    name: "app-builder:auth-popup",
    apply: "serve",
    configureServer(server) {
      // Register immediately (not in a returned post-hook) so we run BEFORE
      // TanStack Start / the SPA HTML fallback. A model-authored
      // `src/routes/auth/popup.tsx` React page must never win this path.
      server.middlewares.use(async (req, res, next) => {
        try {
          const rawUrl = req.url ?? "";
          const pathOnly = rawUrl.split("?", 1)[0] ?? "";
          if (pathOnly !== "/auth/popup") {
            next();
            return;
          }
          if ((req.method ?? "GET").toUpperCase() !== "GET") {
            res.statusCode = 405;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end("Method Not Allowed");
            return;
          }

          const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost:8080");
          const proto = String(
            req.headers["x-forwarded-proto"] ??
              ((req.socket as { encrypted?: boolean } | undefined)?.encrypted ? "https" : "http"),
          );
          const requestHeaders = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value === undefined) continue;
            if (Array.isArray(value)) {
              for (const v of value) requestHeaders.append(key, v);
            } else {
              requestHeaders.set(key, value);
            }
          }
          // Ensure Host is the public preview host so Better Auth's dynamic
          // baseURL / redirect_uri match the popup origin.
          if (!requestHeaders.has("host")) requestHeaders.set("host", host);

          const request = new Request(`${proto}://${host}${rawUrl}`, {
            method: "GET",
            headers: requestHeaders,
          });

          const mod = (await server.ssrLoadModule("/src/lib/auth/popup.server.ts")) as {
            handleAuthPopupRequest: (req: Request) => Promise<Response>;
          };
          const response = await mod.handleAuthPopupRequest(request);

          res.statusCode = response.status;
          // Preserve multiple Set-Cookie headers (OAuth state + session).
          const setCookies =
            typeof response.headers.getSetCookie === "function"
              ? response.headers.getSetCookie()
              : [];
          response.headers.forEach((value, key) => {
            if (key.toLowerCase() === "set-cookie") return;
            res.setHeader(key, value);
          });
          for (const cookie of setCookies) {
            res.appendHeader("set-cookie", cookie);
          }
          const body = Buffer.from(await response.arrayBuffer());
          res.end(body);
        } catch (err) {
          console.error("[app-builder] /auth/popup handler failed:", err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end("auth popup failed");
          }
        }
      });
    },
  };
}

/**
 * Serve GET /s/{w1}-{w2}-{w3}.txt as text/plain before the SPA can swallow the
 * `.txt` suffix as part of `$sessionId`.
 */
function pasteTxtPlugin(): Plugin {
  return {
    name: "paste-txt-route",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const rawUrl = req.url ?? "";
          const pathOnly = rawUrl.split("?", 1)[0] ?? "";
          const match = pathOnly.match(/^\/s\/([a-z]+(?:-[a-z]+){2})\.txt$/i);
          if (!match) {
            next();
            return;
          }
          const method = (req.method ?? "GET").toUpperCase();
          if (method === "OPTIONS") {
            res.statusCode = 204;
            res.setHeader("access-control-allow-origin", "*");
            res.setHeader("access-control-allow-methods", "GET, OPTIONS");
            res.end();
            return;
          }
          if (method !== "GET" && method !== "HEAD") {
            res.statusCode = 405;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end("Method Not Allowed");
            return;
          }

          const publicId = match[1]!.toLowerCase();
          const mod = (await server.ssrLoadModule("/src/lib/paste-store.server.ts")) as {
            readNote: (id: string) => Promise<{ content: string }>;
            PasteError: new (status: number, message: string) => Error & { status: number };
          };
          try {
            const { content } = await mod.readNote(publicId);
            res.statusCode = 200;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.setHeader("cache-control", "private, no-store");
            res.setHeader("x-robots-tag", "noindex, nofollow, noarchive");
            res.setHeader("access-control-allow-origin", "*");
            res.end(method === "HEAD" ? "" : content);
          } catch (e) {
            const status = e instanceof mod.PasteError ? e.status : 500;
            const message = e instanceof Error ? e.message : "Request failed";
            res.statusCode = status === 404 || status === 400 ? status : 500;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.setHeader("x-robots-tag", "noindex, nofollow");
            res.end(JSON.stringify({ error: message }));
          }
        } catch (err) {
          console.error("[paste] .txt handler failed:", err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end("txt handler failed");
          }
        }
      });
    },
  };
}

function wellKnownOAuthPlugin(): Plugin {
  return {
    name: "paste-well-known-oauth",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathOnly = (req.url ?? "").split("?", 1)[0] ?? "";
        const hit =
          pathOnly === "/.well-known/oauth-protected-resource" ||
          pathOnly === "/.well-known/oauth-protected-resource/" ||
          pathOnly === "/.well-known/oauth-protected-resource/mcp";
        if (!hit) {
          next();
          return;
        }
        const method = (req.method ?? "GET").toUpperCase();
        if (method === "OPTIONS") {
          res.statusCode = 204;
          res.setHeader("access-control-allow-origin", "*");
          res.end();
          return;
        }
        const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost:8080")
          .split(",")[0]!
          .trim();
        const hostname = host.split(":")[0]!;
        const origin =
          hostname === "localhost" || hostname === "127.0.0.1"
            ? `http://${host}`
            : "https://paste.grok.me";
        const body = JSON.stringify({
          resource: `${origin}/mcp`,
          authorization_servers: [origin],
          bearer_methods_supported: ["header"],
          scopes_supported: ["paste"],
        });
        res.statusCode = 200;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.setHeader("access-control-allow-origin", "*");
        res.setHeader("cache-control", "public, max-age=60");
        res.end(method === "HEAD" ? "" : body);
      });
    },
  };
}
// Keep `nitro` gated to `build` (the Vercel deploy target): enabled in dev it
// opens a second dev-server port, which breaks the single-port preview.
// The dev server starts once `src/router.tsx` and `src/routes/` exist — see
// AGENTS.md § "First scaffold".
export default defineConfig(({ command }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
    // Paste vault storage lives under data/ — never trigger HMR on note/file writes.
    watch: {
      ignored: ["**/data/**", "**/screenshots/**"],
    },
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    pgliteBootstrapPlugin(),
    pasteTxtPlugin(),
    wellKnownOAuthPlugin(),
    // Before tanstackStart so /auth/popup never falls through to the SPA.
    authPopupPlugin(),
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" ? [nitro({ preset: "vercel" })] : []),
    viteReact(),
  ],
}));
