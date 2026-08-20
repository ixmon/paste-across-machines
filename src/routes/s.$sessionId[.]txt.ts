import { createFileRoute } from "@tanstack/react-router";
import { corsHeaders, jsonError, ROBOTS_HEADERS } from "@/lib/http";
import { gate, parsePublicId, pasteCatch } from "@/lib/paste-api.server";

export const Route = createFileRoute("/s/$sessionId.txt")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request) }),

      GET: async ({ request, params }) => {
        const blocked = gate(request, "read");
        if (blocked) return blocked;
        const rec = params as Record<string, string>;
        const raw = (rec.sessionId ?? rec["sessionId.txt"] ?? "").replace(/\.txt$/i, "");
        const id = parsePublicId(raw);
        if (!id) {
          gate(request, "miss");
          return jsonError(400, "Invalid session code", undefined, request);
        }
        try {
          const { readNote } = await import("@/lib/paste-store.server");
          const { content } = await readNote(id);
          return new Response(content, {
            status: 200,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              ...ROBOTS_HEADERS,
              ...corsHeaders(request),
            },
          });
        } catch (e) {
          return pasteCatch(e, request);
        }
      },
    },
  },
});
