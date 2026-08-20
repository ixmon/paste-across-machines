import { createFileRoute } from "@tanstack/react-router";
import { corsHeaders, jsonError, readBodyText, withApiHeaders } from "@/lib/http";
import { gate, parsePublicId, pasteCatch, sessionPayload } from "@/lib/paste-api.server";

export const Route = createFileRoute("/api/paste/$sessionId/append")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request) }),

      POST: async ({ request, params }) => {
        const blocked = gate(request, "write");
        if (blocked) return blocked;
        const id = parsePublicId(params.sessionId);
        if (!id) {
          gate(request, "miss");
          return jsonError(400, "Invalid session code", undefined, request);
        }
        try {
          const chunk = await readBodyText(request);
          const { appendNote, listFiles } = await import("@/lib/paste-store.server");
          const { meta, content } = await appendNote(id, chunk);
          const files = await listFiles(id);
          return Response.json(sessionPayload(meta, content, files), withApiHeaders({}, request));
        } catch (e) {
          return pasteCatch(e, request);
        }
      },
    },
  },
});
