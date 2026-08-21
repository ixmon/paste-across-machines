import { createFileRoute } from "@tanstack/react-router";
import { exchangeToken } from "@/lib/oauth.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

async function readGrant(request: Request) {
  const type = (request.headers.get("content-type") || "").toLowerCase();
  if (type.includes("application/json")) {
    const j = (await request.json()) as Record<string, string>;
    return {
      grant_type: String(j.grant_type || ""),
      code: String(j.code || ""),
      code_verifier: String(j.code_verifier || ""),
      client_id: String(j.client_id || ""),
      redirect_uri: String(j.redirect_uri || ""),
    };
  }
  const text = await request.text();
  const q = new URLSearchParams(text);
  return {
    grant_type: q.get("grant_type") || "",
    code: q.get("code") || "",
    code_verifier: q.get("code_verifier") || "",
    client_id: q.get("client_id") || "",
    redirect_uri: q.get("redirect_uri") || "",
  };
}

function oauthError(code: string, status = 400) {
  return Response.json(
    { error: code },
    { status, headers: { ...cors, "Content-Type": "application/json" } },
  );
}

export const Route = createFileRoute("/oauth/token")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        try {
          const grant = await readGrant(request);
          const tokens = await exchangeToken(grant);
          return Response.json(tokens, {
            headers: { ...cors, "Cache-Control": "no-store" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "invalid_request";
          const known = [
            "invalid_grant",
            "invalid_client",
            "invalid_request",
            "unsupported_grant_type",
          ];
          return oauthError(known.includes(msg) ? msg : "invalid_request");
        }
      },
    },
  },
});
