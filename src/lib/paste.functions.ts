import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const sessionSchema = z.object({
  publicId: z.string().min(5).max(120),
});

export const loadPaste = createServerFn({ method: "GET" })
  .validator(sessionSchema)
  .handler(async ({ data }) => {
    const { readNote, listFiles, PasteError } = await import("./paste-store.server");
    try {
      const { meta, content } = await readNote(data.publicId);
      const files = await listFiles(data.publicId);
      return {
        publicId: meta.publicId,
        words: meta.words,
        content,
        expiresAt: meta.expiresAt,
        createdAt: meta.createdAt,
        files,
      };
    } catch (e) {
      if (e instanceof PasteError) {
        const err = new Error(e.message);
        (err as Error & { status?: number }).status = e.status;
        throw err;
      }
      throw e;
    }
  });

export const savePaste = createServerFn({ method: "POST" })
  .validator(
    z.object({
      publicId: z.string().min(5).max(120),
      content: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const { writeNote, PasteError } = await import("./paste-store.server");
    try {
      const meta = await writeNote(data.publicId, data.content);
      return { expiresAt: meta.expiresAt, savedAt: Date.now() };
    } catch (e) {
      if (e instanceof PasteError) throw new Error(e.message);
      throw e;
    }
  });

export const listPasteFiles = createServerFn({ method: "GET" })
  .validator(sessionSchema)
  .handler(async ({ data }) => {
    const { listFiles, PasteError } = await import("./paste-store.server");
    try {
      return await listFiles(data.publicId);
    } catch (e) {
      if (e instanceof PasteError) throw new Error(e.message);
      throw e;
    }
  });

export const removePasteFile = createServerFn({ method: "POST" })
  .validator(
    z.object({
      publicId: z.string().min(5).max(120),
      fileId: z.string().min(1).max(64),
    }),
  )
  .handler(async ({ data }) => {
    const { deleteFile, PasteError } = await import("./paste-store.server");
    try {
      await deleteFile(data.publicId, data.fileId);
      return { ok: true as const };
    } catch (e) {
      if (e instanceof PasteError) throw new Error(e.message);
      throw e;
    }
  });
