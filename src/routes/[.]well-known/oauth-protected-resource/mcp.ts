import { createFileRoute } from "@tanstack/react-router";
import { publicOrigin } from "@/lib/http";
import { protectedResourceMetadata } from "@/lib/oauth";

export const Route = createFileRoute("/.well-known/oauth-protected-resource/mcp")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } }),
      GET: async ({ request }) => {
        const origin = publicOrigin(request);
        return Response.json(protectedResourceMetadata(origin), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
