import { createFileRoute } from "@tanstack/react-router";
import { parseSessionSlug } from "@/lib/words";

export const Route = createFileRoute("/api/paste/$sessionId/files/$fileId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { getFileBuffer, PasteError } = await import("@/lib/paste-store.server");
        const parsed = parseSessionSlug(params.sessionId);
        if (!parsed) {
          return Response.json({ error: "Invalid session code" }, { status: 400 });
        }
        try {
          const { entry, data } = await getFileBuffer(parsed.join("-"), params.fileId);
          return new Response(new Uint8Array(data), {
            status: 200,
            headers: {
              "Content-Type": entry.mime || "application/octet-stream",
              "Content-Length": String(data.byteLength),
              "Content-Disposition": `attachment; filename="${entry.name.replace(/"/g, "")}"`,
              "Cache-Control": "private, no-store",
            },
          });
        } catch (e) {
          if (e instanceof PasteError) {
            return Response.json({ error: e.message }, { status: e.status });
          }
          return Response.json({ error: "Download failed" }, { status: 500 });
        }
      },
      DELETE: async ({ params }) => {
        const { deleteFile, PasteError } = await import("@/lib/paste-store.server");
        const parsed = parseSessionSlug(params.sessionId);
        if (!parsed) {
          return Response.json({ error: "Invalid session code" }, { status: 400 });
        }
        try {
          await deleteFile(parsed.join("-"), params.fileId);
          return Response.json({ ok: true });
        } catch (e) {
          if (e instanceof PasteError) {
            return Response.json({ error: e.message }, { status: e.status });
          }
          return Response.json({ error: "Delete failed" }, { status: 500 });
        }
      },
    },
  },
});
