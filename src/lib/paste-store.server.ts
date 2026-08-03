import { createHash, randomBytes } from "node:crypto";
import type { FileEntry } from "./paste-types";
import { parseSessionSlug } from "./words";
import { getSql, type Sql } from "./db";

export type { FileEntry } from "./paste-types";

export const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
/** Soft budget for total file bytes across all rooms; oldest rooms pruned first. */
export const DISK_BUDGET_BYTES = 800 * 1024 * 1024; // 800 MB

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

type SessionRow = {
  public_id: string;
  word1: string;
  word2: string;
  word3: string;
  created_at: number | string;
  expires_at: number | string;
  last_accessed_at: number | string;
  note_content: string;
  note_bytes: number | string;
};

type FileRow = {
  id: string;
  public_id: string;
  name: string;
  mime: string;
  size: number | string;
  uploaded_at: number | string;
  data?: unknown;
};

function num(v: number | string | null | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  return 0;
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

function rowToMeta(row: SessionRow, filesBytes = 0): SessionMeta {
  return {
    publicId: row.public_id,
    words: [row.word1, row.word2, row.word3],
    storageKey: row.public_id,
    createdAt: num(row.created_at),
    expiresAt: num(row.expires_at),
    lastAccessedAt: num(row.last_accessed_at),
    noteBytes: num(row.note_bytes),
    filesBytes,
  };
}

/** Safety net if migrations/0002_paste.sql was not applied yet (e.g. hot reload). */
let schemaReady: Promise<void> | null = null;
async function ensurePasteSchema(sql: Sql): Promise<void> {
  schemaReady ??= (async () => {
    await sql.query(`
      CREATE TABLE IF NOT EXISTS paste_sessions (
        public_id TEXT PRIMARY KEY,
        word1 TEXT NOT NULL,
        word2 TEXT NOT NULL,
        word3 TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL,
        last_accessed_at BIGINT NOT NULL,
        note_content TEXT NOT NULL DEFAULT '',
        note_bytes INT NOT NULL DEFAULT 0
      )
    `);
    await sql.query(`
      CREATE TABLE IF NOT EXISTS paste_files (
        id TEXT PRIMARY KEY,
        public_id TEXT NOT NULL REFERENCES paste_sessions (public_id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        mime TEXT NOT NULL,
        size INT NOT NULL,
        uploaded_at BIGINT NOT NULL,
        data BYTEA NOT NULL
      )
    `);
    await sql.query(
      `CREATE INDEX IF NOT EXISTS paste_sessions_expires_at_idx ON paste_sessions (expires_at)`,
    );
    await sql.query(
      `CREATE INDEX IF NOT EXISTS paste_sessions_last_accessed_at_idx ON paste_sessions (last_accessed_at)`,
    );
    await sql.query(
      `CREATE INDEX IF NOT EXISTS paste_files_public_id_idx ON paste_files (public_id)`,
    );
  })().catch((err) => {
    schemaReady = null;
    throw err;
  });
  await schemaReady;
}

async function filesBytesFor(publicId: string): Promise<number> {
  const sql = await getSql();
  await ensurePasteSchema(sql);
  const rows = await sql.query<{ total: number | string | null }>(
    `SELECT COALESCE(SUM(size), 0)::bigint AS total FROM paste_files WHERE public_id = $1`,
    [publicId],
  );
  return num(rows[0]?.total);
}

export async function purgeExpiredAndOverBudget(): Promise<void> {
  const sql = await getSql();
  await ensurePasteSchema(sql);
  const now = Date.now();
  await sql.query(`DELETE FROM paste_sessions WHERE expires_at <= $1`, [now]);

  const totals = await sql.query<{ total: number | string | null }>(
    `SELECT COALESCE(SUM(size), 0)::bigint AS total FROM paste_files`,
  );
  let total = num(totals[0]?.total);
  if (total <= DISK_BUDGET_BYTES) return;

  const oldest = await sql.query<{ public_id: string }>(
    `SELECT public_id FROM paste_sessions ORDER BY last_accessed_at ASC`,
  );
  for (const room of oldest) {
    if (total <= DISK_BUDGET_BYTES) break;
    const roomBytes = await filesBytesFor(room.public_id);
    await sql.query(`DELETE FROM paste_sessions WHERE public_id = $1`, [room.public_id]);
    total -= roomBytes;
  }
}

export async function openOrCreateSession(publicId: string): Promise<SessionMeta> {
  await purgeExpiredAndOverBudget();
  const words = assertSafePublicId(publicId);
  const id = words.join("-");
  const sql = await getSql();
  await ensurePasteSchema(sql);
  const now = Date.now();

  const existing = await sql.query<SessionRow>(
    `SELECT * FROM paste_sessions WHERE public_id = $1 LIMIT 1`,
    [id],
  );
  const row = existing[0];

  if (row && num(row.expires_at) <= now) {
    await sql.query(`DELETE FROM paste_sessions WHERE public_id = $1`, [id]);
  } else if (row) {
    await sql.query(
      `UPDATE paste_sessions SET last_accessed_at = $2 WHERE public_id = $1`,
      [id, now],
    );
    const filesBytes = await filesBytesFor(id);
    return rowToMeta({ ...row, last_accessed_at: now }, filesBytes);
  }

  const expiresAt = now + SESSION_TTL_MS;
  await sql.query(
    `INSERT INTO paste_sessions
      (public_id, word1, word2, word3, created_at, expires_at, last_accessed_at, note_content, note_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, '', 0)
     ON CONFLICT (public_id) DO NOTHING`,
    [id, words[0], words[1], words[2], now, expiresAt, now],
  );

  const created = await sql.query<SessionRow>(
    `SELECT * FROM paste_sessions WHERE public_id = $1 LIMIT 1`,
    [id],
  );
  if (!created[0]) {
    throw new PasteError(500, "Could not create room. Try again.");
  }
  return rowToMeta(created[0], 0);
}

export async function getSession(publicId: string): Promise<SessionMeta | null> {
  await purgeExpiredAndOverBudget();
  assertSafePublicId(publicId);
  const id = publicId.toLowerCase().trim();
  const sql = await getSql();
  await ensurePasteSchema(sql);
  const rows = await sql.query<SessionRow>(
    `SELECT * FROM paste_sessions WHERE public_id = $1 LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  if (num(row.expires_at) <= Date.now()) {
    await sql.query(`DELETE FROM paste_sessions WHERE public_id = $1`, [id]);
    return null;
  }
  const now = Date.now();
  await sql.query(`UPDATE paste_sessions SET last_accessed_at = $2 WHERE public_id = $1`, [
    id,
    now,
  ]);
  return rowToMeta({ ...row, last_accessed_at: now }, await filesBytesFor(id));
}

export async function readNote(
  publicId: string,
): Promise<{ meta: SessionMeta; content: string }> {
  const meta = await openOrCreateSession(publicId);
  const sql = await getSql();
  const rows = await sql.query<SessionRow>(
    `SELECT * FROM paste_sessions WHERE public_id = $1 LIMIT 1`,
    [meta.publicId],
  );
  const content = rows[0]?.note_content ?? "";
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
  const sql = await getSql();
  const now = Date.now();
  await sql.query(
    `UPDATE paste_sessions
     SET note_content = $2, note_bytes = $3, last_accessed_at = $4
     WHERE public_id = $1`,
    [meta.publicId, content, bytes, now],
  );
  await purgeExpiredAndOverBudget();
  return {
    ...meta,
    noteBytes: bytes,
    lastAccessedAt: now,
  };
}

function sanitizeFileName(name: string): string {
  const base = name
    .replace(/^.*[/\\]/, "")
    .replace(/[^\w.\- ()[\]]+/g, "_")
    .slice(0, 180);
  return base || "file";
}

export async function listFiles(publicId: string): Promise<FileEntry[]> {
  const meta = await openOrCreateSession(publicId);
  const sql = await getSql();
  const rows = await sql.query<FileRow>(
    `SELECT id, public_id, name, mime, size, uploaded_at
     FROM paste_files WHERE public_id = $1 ORDER BY uploaded_at ASC`,
    [meta.publicId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    size: num(r.size),
    mime: r.mime,
    uploadedAt: num(r.uploaded_at),
  }));
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

  const sql = await getSql();
  const sumRows = await sql.query<{ total: number | string | null }>(
    `SELECT COALESCE(SUM(size), 0)::bigint AS total FROM paste_files WHERE public_id = $1`,
    [meta.publicId],
  );
  const totalFiles = num(sumRows[0]?.total);
  if (totalFiles + data.byteLength > MAX_FILE_BYTES * 2) {
    throw new PasteError(413, "Session storage full. Delete files or start a new room.");
  }

  const id = createHash("sha256")
    .update(`${Date.now()}-${fileName}-${data.byteLength}-${randomBytes(8).toString("hex")}`)
    .digest("hex")
    .slice(0, 16);
  const safeName = sanitizeFileName(fileName);
  const uploadedAt = Date.now();

  await sql.query(
    `INSERT INTO paste_files (id, public_id, name, mime, size, uploaded_at, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      meta.publicId,
      safeName,
      mime || "application/octet-stream",
      data.byteLength,
      uploadedAt,
      data,
    ],
  );

  await sql.query(`UPDATE paste_sessions SET last_accessed_at = $2 WHERE public_id = $1`, [
    meta.publicId,
    uploadedAt,
  ]);
  await purgeExpiredAndOverBudget();

  return {
    id,
    name: safeName,
    size: data.byteLength,
    mime: mime || "application/octet-stream",
    uploadedAt,
  };
}

export async function getFileBuffer(
  publicId: string,
  fileId: string,
): Promise<{ entry: FileEntry; data: Buffer }> {
  const meta = await openOrCreateSession(publicId);
  const sql = await getSql();
  const rows = await sql.query<FileRow>(
    `SELECT id, public_id, name, mime, size, uploaded_at, data
     FROM paste_files WHERE public_id = $1 AND id = $2 LIMIT 1`,
    [meta.publicId, fileId],
  );
  const row = rows[0];
  if (!row) throw new PasteError(404, "File not found.");

  let buf: Buffer;
  const raw = row.data;
  if (Buffer.isBuffer(raw)) {
    buf = raw;
  } else if (raw instanceof Uint8Array) {
    buf = Buffer.from(raw);
  } else if (typeof raw === "string") {
    buf = Buffer.from(raw, "binary");
  } else if (raw && typeof raw === "object" && "data" in (raw as object)) {
    buf = Buffer.from((raw as { data: number[] }).data);
  } else {
    throw new PasteError(500, "Could not read file data.");
  }

  return {
    entry: {
      id: row.id,
      name: row.name,
      size: num(row.size),
      mime: row.mime,
      uploadedAt: num(row.uploaded_at),
    },
    data: buf,
  };
}

export async function deleteFile(publicId: string, fileId: string): Promise<void> {
  const meta = await openOrCreateSession(publicId);
  const sql = await getSql();
  const result = await sql.query(
    `DELETE FROM paste_files WHERE public_id = $1 AND id = $2 RETURNING id`,
    [meta.publicId, fileId],
  );
  if (!result.length) throw new PasteError(404, "File not found.");
  await sql.query(`UPDATE paste_sessions SET last_accessed_at = $2 WHERE public_id = $1`, [
    meta.publicId,
    Date.now(),
  ]);
}
