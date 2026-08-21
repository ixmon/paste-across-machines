import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { publicOrigin } from "@/lib/http";
import { parseAuthorizeParams, authorizeQueryError } from "@/lib/oauth";
import { isValidWord, parseSessionSlug } from "@/lib/words";

export const Route = createFileRoute("/oauth/authorize")({
  component: AuthorizePage,
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = publicOrigin(request);
        const form = await request.formData();
        const params = {
          client_id: String(form.get("client_id") || "paste"),
          redirect_uri: String(form.get("redirect_uri") || ""),
          state: String(form.get("state") || ""),
          code_challenge: String(form.get("code_challenge") || ""),
          code_challenge_method: String(form.get("code_challenge_method") || "S256"),
          scope: String(form.get("scope") || "paste"),
          resource: String(form.get("resource") || ""),
        };
        const deny = String(form.get("intent") || "") === "deny";
        if (deny && params.redirect_uri) {
          try {
            const u = new URL(params.redirect_uri);
            u.searchParams.set("error", "access_denied");
            if (params.state) u.searchParams.set("state", params.state);
            return Response.redirect(u.toString(), 302);
          } catch {
            /* fall through */
          }
        }
        try {
          const { issueAuthorizationCodeWithIss } = await import("@/lib/oauth.server");
          const { redirect } = await issueAuthorizationCodeWithIss({
            publicIdRaw: String(form.get("words") || ""),
            label: String(form.get("label") || "Grok"),
            params,
            origin,
          });
          return Response.redirect(redirect, 302);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Could not authorize";
          const back = new URL("/oauth/authorize", origin);
          request.url &&
            new URL(request.url).searchParams.forEach((v, k) => back.searchParams.set(k, v));
          back.searchParams.set("error", msg);
          return Response.redirect(back.toString(), 302);
        }
      },
    },
  },
});

function AuthorizePage() {
  const url = typeof window !== "undefined" ? new URL(window.location.href) : null;
  const params = url
    ? parseAuthorizeParams(url)
    : {
        client_id: "paste",
        redirect_uri: "",
        state: "",
        code_challenge: "",
        code_challenge_method: "S256",
        scope: "paste",
        resource: "",
      };
  const setupError = url ? authorizeQueryError(params) : null;
  const queryError = url?.searchParams.get("error") || "";
  const [words, setWords] = useState("");
  const parsed = parseSessionSlug(
    words
      .toLowerCase()
      .trim()
      .replace(/[·.,_/]+/g, "-")
      .replace(/\s+/g, "-"),
  );
  const three =
    parsed ||
    (words.trim().split(/[\s·.,_/\-]+/).filter(Boolean).length === 3 &&
    words
      .trim()
      .split(/[\s·.,_/\-]+/)
      .every(isValidWord)
      ? (words.trim().split(/[\s·.,_/\-]+/) as [string, string, string])
      : null);

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[var(--color-bg)]">
      <div className="mx-auto w-full max-w-md px-4 py-12">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="logo-mark flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border">
            <Scissors className="size-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold">Paste</p>
            <p className="text-xs text-[var(--color-fg-subtle)]">Allow MCP access</p>
          </div>
        </div>

        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]">
          <h1 className="text-lg font-semibold tracking-tight">Grok wants this room</h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-fg-muted)]">
            Enter the three-word code. We mint a tagged bearer for Grok — same privilege as sitting
            in the editor. Revoke it later from the room.
          </p>

          {(setupError || queryError) && (
            <p className="mt-3 text-sm text-[var(--color-danger-fg)]">{setupError || queryError}</p>
          )}

          <form method="post" className="mt-4 flex flex-col gap-3">
            <input type="hidden" name="client_id" value={params.client_id} />
            <input type="hidden" name="redirect_uri" value={params.redirect_uri} />
            <input type="hidden" name="state" value={params.state} />
            <input type="hidden" name="code_challenge" value={params.code_challenge} />
            <input type="hidden" name="code_challenge_method" value={params.code_challenge_method} />
            <input type="hidden" name="scope" value={params.scope} />
            <input type="hidden" name="resource" value={params.resource} />

            <label className="text-xs font-medium text-[var(--color-fg-muted)]">
              Room code
              <Input
                name="words"
                value={words}
                onChange={(e) => setWords(e.target.value)}
                placeholder="harbor nebula omega"
                autoComplete="off"
                spellCheck={false}
                className="mt-1 font-mono"
                required
              />
            </label>
            <label className="text-xs font-medium text-[var(--color-fg-muted)]">
              Tag this client
              <Input name="label" defaultValue="Grok Voice" className="mt-1" maxLength={40} />
            </label>

            <div className="mt-2 flex gap-2">
              <Button type="submit" name="intent" value="allow" disabled={!!setupError} className="flex-1">
                Allow
              </Button>
              <Button type="submit" name="intent" value="deny" variant="secondary">
                Deny
              </Button>
            </div>
            {three && (
              <p className="font-mono text-[0.6875rem] text-[var(--color-fg-subtle)]">
                {three.join("-")}
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
