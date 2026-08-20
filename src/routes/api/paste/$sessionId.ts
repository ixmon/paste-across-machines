import { createFileRoute } from "@tanstack/react-router";
import { corsHeaders, jsonError, readBodyText, ROBOTS_HEADERS, withApiHeaders } from "@/lib/http";
import { gate, parsePublicId, pasteCatch, sessionPayload } from "@/lib/paste-api.server";

export const Route = createFileRoute("/api/paste/$sessionId")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request) }),

      GET: async ({ request, params }) => {
        const blocked = gate(request, "read");
        if (blocked) return blocked;
        const id = parsePublicId(params.sessionId);
        if (!id) {
          gate(request, "miss");
          return jsonError(400, "Invalid session code", undefined, request);
        }
        try {
          const url = new URL(request.url);
          const watch = url.searchParams.get("watch") === "1";
          const { readNote, listFiles } = await import("@/lib/paste-store.server");
          const { meta, content } = await readNote(
            id,
            watch ? { touch: false, purge: false } : {},
          );
          const wantText =
            url.searchParams.get("format") === "txt" ||
            (request.headers.get("accept") || "").includes("text/plain");
          if (wantText) {
            return new Response(content, {
              status: 200,
              headers: {
                "Content-Type": "text/plain; charset=utf-8",
                ...ROBOTS_HEADERS,
                ...corsHeaders(request),
              },
            });
          }
          const files = await listFiles(id, watch ? { touch: false, purge: false } : {});
          return Response.json(sessionPayload(meta, content, files), withApiHeaders({}, request));
        } catch (e) {
          return pasteCatch(e, request);
        }
      },

      /** Create empty room if missing; do not overwrite existing content. */
      POST: async ({ request, params }) => {
        const blocked = gate(request, "write");
        if (blocked) return blocked;
        const id = parsePublicId(params.sessionId);
        if (!id) {
          gate(request, "miss");
          return jsonError(400, "Invalid session code", undefined, request);
        }
        try {
          const { ensureSession, readNote, listFiles } = await import("@/lib/paste-store.server");
          await ensureSession(id);
          const { meta, content } = await readNote(id);
          const files = await listFiles(id);
          return Response.json(sessionPayload(meta, content, files), withApiHeaders({ status: 200 }, request));
        } catch (e) {
          return pasteCatch(e, request);
        }
      },

      /** Replace the full note (creates the room if needed). */
      PUT: async ({ request, params }) => {
        const blocked = gate(request, "write");
        if (blocked) return blocked;
        const id = parsePublicId(params.sessionId);
        if (!id) {
          gate(request, "miss");
          return jsonError(400, "Invalid session code", undefined, request);
        }
        try {
          const body = await readBodyText(request);
          const { writeNote, listFiles } = await import("@/lib/paste-store.server");
          const meta = await writeNote(id, body);
          const files = await listFiles(id);
          return Response.json(sessionPayload(meta, body, files), withApiHeaders({}, request));
        } catch (e) {
          return pasteCatch(e, request);
        }
      },
    },
  },
});
