import { createFileRoute } from "@tanstack/react-router";
import { clientIp, publicOrigin, ROBOTS_HEADERS } from "@/lib/http";
import { limitedResponse, rateLimit } from "@/lib/rate-limit.server";

function mcpCors(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin === "null" ? "*" : origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, Accept, MCP-Protocol-Version, MCP-Session-Id",
    "Access-Control-Expose-Headers": "MCP-Session-Id, WWW-Authenticate",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function unauthorized(request: Request) {
  const origin = publicOrigin(request);
  return new Response(JSON.stringify({ error: "Bearer token required" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer realm="paste-mcp", resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
      ...ROBOTS_HEADERS,
      ...mcpCors(request),
    },
  });
}

function encodePayload(request: Request, status: number, payload: unknown | null): Response {
  if (payload === null) {
    return new Response(null, { status, headers: { ...ROBOTS_HEADERS, ...mcpCors(request) } });
  }
  const accept = request.headers.get("accept") || "";
  const json = JSON.stringify(payload);
  if (accept.includes("text/event-stream")) {
    return new Response(`event: message\ndata: ${json}\n\n`, {
      status,
      headers: {
        "Content-Type": "text/event-stream",
        ...ROBOTS_HEADERS,
        ...mcpCors(request),
      },
    });
  }
  return new Response(json, {
    status,
    headers: {
      "Content-Type": "application/json",
      ...ROBOTS_HEADERS,
      ...mcpCors(request),
    },
  });
}

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: mcpCors(request) }),

      GET: async ({ request }) => {
        const blocked = rateLimit(clientIp(request), "read");
        if (!blocked.ok) return limitedResponse(blocked.retryAfter, request);
        const origin = publicOrigin(request);
        const { authenticateMcpBearer } = await import("@/lib/mcp-tokens.server");
        const auth = await authenticateMcpBearer(request.headers.get("authorization"));
        const accept = request.headers.get("accept") || "";
        if (accept.includes("text/event-stream") && !auth) {
          return unauthorized(request);
        }
        const body = auth
          ? {
              name: "paste.grok.me",
              transport: "streamable-http",
              room: auth.publicId,
              label: auth.label,
              protocol: "2025-03-26",
            }
          : {
              name: "paste.grok.me",
              transport: "streamable-http",
              protocol: "2025-03-26",
              authentication: {
                type: "oauth2",
                resource_metadata: `${origin}/.well-known/oauth-protected-resource`,
                authorization_endpoint: `${origin}/oauth/authorize`,
                token_endpoint: `${origin}/oauth/token`,
                client_id: "paste",
              },
            };
        return Response.json(body, {
          headers: {
            ...ROBOTS_HEADERS,
            ...mcpCors(request),
            "WWW-Authenticate": `Bearer realm="paste-mcp", resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
          },
        });
      },

      POST: async ({ request }) => {
        const blocked = rateLimit(clientIp(request), "write");
        if (!blocked.ok) return limitedResponse(blocked.retryAfter, request);
        const { authenticateMcpBearer } = await import("@/lib/mcp-tokens.server");
        const auth = await authenticateMcpBearer(request.headers.get("authorization"));
        if (!auth) return unauthorized(request);
        let body: unknown = null;
        try {
          body = await request.json();
        } catch {
          return encodePayload(request, 200, {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error" },
          });
        }
        const { handleMcpRpc } = await import("@/lib/mcp-rpc.server");
        const { status, payload } = await handleMcpRpc(auth, body);
        return encodePayload(request, status, payload);
      },
    },
  },
});
