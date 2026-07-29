import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FileEntry } from "./paste-types";
import { parseSessionSlug } from "./words";

export type { FileEntry } from "./paste-types";

export const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
/** Soft disk budget for all paste data; oldest sessions pruned first. */
export const DISK_BUDGET_BYTES = 800 * 1024 * 1024; // 800 MB

const DATA_ROOT = path.join(process.cwd(), "data", "pastes");

export type SessionMeta = {
  publicId: string;
  words: [string, string, string];
  storageKey: string;
  createdAt: number;
  expiresAt: number;
  lastAccessedAt: number;
  noteBytes: number;
  filesBytes: number;
};

function storageKeyFromPublicId(publicId: string): string {
  return createHash("sha256").update(publicId.toLowerCase().trim()).digest("hex");
}

function sessionDir(storageKey: string): string {
  return path.join(DATA_ROOT, storageKey);
}

function metaPath(storageKey: string): string {
  return path.join(sessionDir(storageKey), "meta.json");
}

function notePath(storageKey: string): string {
  return path.join(sessionDir(storageKey), "note.txt");
}

function filesDir(storageKey: string): string {
  return path.join(sessionDir(storageKey), "files");
}

function filesIndexPath(storageKey: string): string {
  return path.join(sessionDir(storageKey), "files.json");
}

function assertSafePublicId(publicId: string): [string, string, string] {
  const words = parseSessionSlug(publicId);
  if (!words) {
    throw new PasteError(400, "Invalid session code. Use three dictionary words.");
  }
  return words;
}

export class PasteError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "PasteError";
  }
}

async function ensureRoot(): Promise<void> {
  await mkdir(DATA_ROOT, { recursive: true });
}

async function readMeta(storageKey: string): Promise<SessionMeta | null> {
  try {
    const raw = await readFile(metaPath(storageKey), "utf8");
    return JSON.parse(raw) as SessionMeta;
  } catch {
    return null;
  }
}

async function writeMeta(meta: SessionMeta): Promise<void> {
  const dir = sessionDir(meta.storageKey);
  await mkdir(dir, { recursive: true });
  await writeFile(metaPath(meta.storageKey), JSON.stringify(meta, null, 2), "utf8");
}

async function dirSize(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    let total = 0;
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) total += await dirSize(p);
      else {
        try {
          total += (await stat(p)).size;
        } catch {
          /* ignore */
        }
      }
    }
    return total;
  } catch {
    return 0;
  }
}

async function listAllSessionKeys(): Promise<string[]> {
  await ensureRoot();
  try {
    const entries = await readdir(DATA_ROOT, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function purgeExpiredAndOverBudget(): Promise<void> {
  await ensureRoot();
  const now = Date.now();
  const keys = await listAllSessionKeys();
  const metas: SessionMeta[] = [];

  for (const key of keys) {
    const meta = await readMeta(key);
    if (!meta) {
      await rm(sessionDir(key), { recursive: true, force: true });
      continue;
    }
    if (meta.expiresAt <= now) {
      await rm(sessionDir(key), { recursive: true, force: true });
      continue;
    }
    metas.push(meta);
  }

  type Sized = { meta: SessionMeta; size: number };
  const sized: Sized[] = [];
  for (const meta of metas) {
    const size = await dirSize(sessionDir(meta.storageKey));
    sized.push({ meta, size });
  }
  let total = sized.reduce((a, b) => a + b.size, 0);
  sized.sort((a, b) => a.meta.lastAccessedAt - b.meta.lastAccessedAt);
  while (total > DISK_BUDGET_BYTES && sized.length > 0) {
    const victim = sized.shift()!;
    await rm(sessionDir(victim.meta.storageKey), { recursive: true, force: true });
    total -= victim.size;
  }
}

export async function openOrCreateSession(publicId: string): Promise<SessionMeta> {
  await purgeExpiredAndOverBudget();
  const words = assertSafePublicId(publicId);
  const storageKey = storageKeyFromPublicId(publicId);
  const now = Date.now();
  let meta = await readMeta(storageKey);

  if (meta && meta.expiresAt <= now) {
    await rm(sessionDir(storageKey), { recursive: true, force: true });
    meta = null;
  }

  if (!meta) {
    meta = {
      publicId: words.join("-"),
      words,
      storageKey,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      lastAccessedAt: now,
      noteBytes: 0,
      filesBytes: 0,
    };
    await writeMeta(meta);
    await writeFile(notePath(storageKey), "", "utf8");
    await mkdir(filesDir(storageKey), { recursive: true });
    await writeFile(filesIndexPath(storageKey), "[]", "utf8");
  } else {
    meta.lastAccessedAt = now;
    await writeMeta(meta);
  }

  return meta;
}

export async function getSession(publicId: string): Promise<SessionMeta | null> {
  await purgeExpiredAndOverBudget();
  assertSafePublicId(publicId);
  const storageKey = storageKeyFromPublicId(publicId);
  const meta = await readMeta(storageKey);
  if (!meta) return null;
  if (meta.expiresAt <= Date.now()) {
    await rm(sessionDir(storageKey), { recursive: true, force: true });
    return null;
  }
  meta.lastAccessedAt = Date.now();
  await writeMeta(meta);
  return meta;
}

export async function readNote(
  publicId: string,
): Promise<{ meta: SessionMeta; content: string }> {
  const meta = await openOrCreateSession(publicId);
  let content = "";
  try {
    content = await readFile(notePath(meta.storageKey), "utf8");
  } catch {
    content = "";
  }
  return { meta, content };
}

export async function writeNote(publicId: string, content: string): Promise<SessionMeta> {
  if (typeof content !== "string") {
    throw new PasteError(400, "Note content must be text.");
  }
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > 5 * 1024 * 1024) {
    throw new PasteError(413, "Note is too large (max 5 MB of text).");
  }
  const meta = await openOrCreateSession(publicId);
  await writeFile(notePath(meta.storageKey), content, "utf8");
  meta.noteBytes = bytes;
  meta.lastAccessedAt = Date.now();
  await writeMeta(meta);
  await purgeExpiredAndOverBudget();
  return meta;
}

async function readFilesIndex(storageKey: string): Promise<FileEntry[]> {
  try {
    const raw = await readFile(filesIndexPath(storageKey), "utf8");
    return JSON.parse(raw) as FileEntry[];
  } catch {
    return [];
  }
}

async function writeFilesIndex(storageKey: string, files: FileEntry[]): Promise<void> {
  await writeFile(filesIndexPath(storageKey), JSON.stringify(files, null, 2), "utf8");
}

function sanitizeFileName(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 180);
  return base || "file";
}

export async function listFiles(publicId: string): Promise<FileEntry[]> {
  const meta = await openOrCreateSession(publicId);
  return readFilesIndex(meta.storageKey);
}

export async function saveUpload(
  publicId: string,
  fileName: string,
  mime: string,
  data: Buffer,
): Promise<FileEntry> {
  if (data.byteLength > MAX_FILE_BYTES) {
    throw new PasteError(413, "File exceeds 100 MB limit.");
  }
  if (data.byteLength === 0) {
    throw new PasteError(400, "Empty file.");
  }

  const meta = await openOrCreateSession(publicId);
  await purgeExpiredAndOverBudget();

  const files = await readFilesIndex(meta.storageKey);
  const totalFiles = files.reduce((a, f) => a + f.size, 0);
  if (totalFiles + data.byteLength > MAX_FILE_BYTES * 2) {
    throw new PasteError(413, "Session storage full. Delete files or start a new vault.");
  }

  const id = createHash("sha256")
    .update(`${Date.now()}-${fileName}-${data.byteLength}-${Math.random()}`)
    .digest("hex")
    .slice(0, 16);
  const safeName = sanitizeFileName(fileName);
  const diskName = `${id}__${safeName}`;
  const dest = path.join(filesDir(meta.storageKey), diskName);
  await mkdir(filesDir(meta.storageKey), { recursive: true });
  await writeFile(dest, data);

  const entry: FileEntry = {
    id,
    name: safeName,
    size: data.byteLength,
    mime: mime || "application/octet-stream",
    uploadedAt: Date.now(),
  };
  files.push(entry);
  await writeFilesIndex(meta.storageKey, files);

  meta.filesBytes = files.reduce((a, f) => a + f.size, 0);
  meta.lastAccessedAt = Date.now();
  await writeMeta(meta);
  await purgeExpiredAndOverBudget();
  return entry;
}

export async function getFileBuffer(
  publicId: string,
  fileId: string,
): Promise<{ entry: FileEntry; data: Buffer }> {
  const meta = await openOrCreateSession(publicId);
  const files = await readFilesIndex(meta.storageKey);
  const entry = files.find((f) => f.id === fileId);
  if (!entry) throw new PasteError(404, "File not found.");

  const dir = filesDir(meta.storageKey);
  const names = await readdir(dir);
  const disk = names.find((n) => n.startsWith(`${fileId}__`));
  if (!disk) throw new PasteError(404, "File missing on disk.");

  const data = await readFile(path.join(dir, disk));
  return { entry, data };
}

export async function deleteFile(publicId: string, fileId: string): Promise<void> {
  const meta = await openOrCreateSession(publicId);
  const files = await readFilesIndex(meta.storageKey);
  const entry = files.find((f) => f.id === fileId);
  if (!entry) throw new PasteError(404, "File not found.");

  const dir = filesDir(meta.storageKey);
  try {
    const names = await readdir(dir);
    const disk = names.find((n) => n.startsWith(`${fileId}__`));
    if (disk) await rm(path.join(dir, disk), { force: true });
  } catch {
    /* ignore */
  }

  const next = files.filter((f) => f.id !== fileId);
  await writeFilesIndex(meta.storageKey, next);
  meta.filesBytes = next.reduce((a, f) => a + f.size, 0);
  meta.lastAccessedAt = Date.now();
  await writeMeta(meta);
}

export async function atomicWrite(file: string, data: string | Buffer): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}
