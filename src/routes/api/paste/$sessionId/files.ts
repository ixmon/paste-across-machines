import { createFileRoute } from "@tanstack/react-router";
import { parseSessionSlug } from "@/lib/words";

export const Route = createFileRoute("/api/paste/$sessionId/files")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { saveUpload, PasteError, MAX_FILE_BYTES } = await import(
          "@/lib/paste-store.server"
        );
        const parsed = parseSessionSlug(params.sessionId);
        if (!parsed) {
          return Response.json({ error: "Invalid session code" }, { status: 400 });
        }
        const publicId = parsed.join("-");

        try {
          const form = await request.formData();
          const file = form.get("file");
          if (!file || !(file instanceof File)) {
            return Response.json({ error: "Missing file field" }, { status: 400 });
          }
          if (file.size > MAX_FILE_BYTES) {
            return Response.json({ error: "File exceeds 100 MB limit" }, { status: 413 });
          }
          const buf = Buffer.from(await file.arrayBuffer());
          const entry = await saveUpload(
            publicId,
            file.name || "upload.bin",
            file.type || "application/octet-stream",
            buf,
          );
          return Response.json(entry);
        } catch (e) {
          if (e instanceof PasteError) {
            return Response.json({ error: e.message }, { status: e.status });
          }
          console.error("[paste] upload failed", e);
          return Response.json({ error: "Upload failed" }, { status: 500 });
        }
      },
      GET: async ({ params, request }) => {
        const { listFiles, PasteError } = await import("@/lib/paste-store.server");
        const { gate, parsePublicId, pasteCatch } = await import("@/lib/paste-api.server");
        const blocked = gate(request, "read");
        if (blocked) return blocked;
        const id = parsePublicId(params.sessionId);
        if (!id) {
          gate(request, "miss");
          return Response.json({ error: "Invalid session code" }, { status: 400 });
        }
        try {
          const files = await listFiles(id);
          return Response.json(files);
        } catch (e) {
          if (e instanceof PasteError) {
            return pasteCatch(e, request);
          }
          return Response.json({ error: "Failed to list files" }, { status: 500 });
        }
      },
    },
  },
});
