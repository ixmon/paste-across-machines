import { createFileRoute } from "@tanstack/react-router";
import { registerClient } from "@/lib/oauth.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/oauth/register")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async () =>
        Response.json(
          { error: "invalid_request", error_description: "POST to register a public client" },
          { status: 405, headers: { ...cors, Allow: "POST, OPTIONS" } },
        ),
      POST: async () => {
        const body = await registerClient();
        return Response.json(body, { status: 201, headers: cors });
      },
    },
  },
});
