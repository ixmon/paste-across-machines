import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getSql } from "./db";
import { getSession, PasteError } from "./paste-store.server";
import type { McpTokenMeta } from "./paste-types";

export const MAX_MCP_TOKENS_PER_ROOM = 8;

export type { McpTokenMeta };

type TokenRow = {
  id: string;
  public_id: string;
  token_hash: string;
  label: string;
  created_at: number | string;
  last_used_at: number | string | null;
  revoked_at: number | string | null;
};

function num(v: number | string | null | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  return 0;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function rowToMeta(row: TokenRow): McpTokenMeta {
  return {
    id: row.id,
    label: row.label,
    createdAt: num(row.created_at),
    lastUsedAt: row.last_used_at == null ? null : num(row.last_used_at),
  };
}

export async function listMcpTokens(publicId: string): Promise<McpTokenMeta[]> {
  const meta = await getSession(publicId, { touch: false, purge: true });
  if (!meta) throw new PasteError(404, "Room not found.");
  const sql = await getSql();
  const rows = await sql.query<TokenRow>(
    `SELECT * FROM paste_mcp_tokens
      WHERE public_id = $1 AND revoked_at IS NULL
      ORDER BY created_at DESC`,
    [meta.publicId],
  );
  return rows.map(rowToMeta);
}

export async function createMcpToken(
  publicId: string,
  labelRaw: string,
): Promise<{ token: string; meta: McpTokenMeta }> {
  const meta = await getSession(publicId);
  if (!meta) throw new PasteError(404, "Room not found.");
  const label = labelRaw.trim().slice(0, 40) || "Grok";
  const sql = await getSql();
  const active = await sql.query<{ n: number | string }>(
    `SELECT COUNT(*)::int AS n FROM paste_mcp_tokens
      WHERE public_id = $1 AND revoked_at IS NULL`,
    [meta.publicId],
  );
  if (num(active[0]?.n) >= MAX_MCP_TOKENS_PER_ROOM) {
    throw new PasteError(400, `At most ${MAX_MCP_TOKENS_PER_ROOM} MCP tokens per room.`);
  }
  const id = randomBytes(8).toString("hex");
  const token = `pst_${randomBytes(24).toString("base64url")}`;
  const now = Date.now();
  await sql.query(
    `INSERT INTO paste_mcp_tokens (id, public_id, token_hash, label, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, meta.publicId, hashToken(token), label, now],
  );
  return { token, meta: { id, label, createdAt: now, lastUsedAt: null } };
}

export async function revokeMcpToken(publicId: string, tokenId: string): Promise<void> {
  const meta = await getSession(publicId);
  if (!meta) throw new PasteError(404, "Room not found.");
  const sql = await getSql();
  const res = await sql.query<{ id: string }>(
    `UPDATE paste_mcp_tokens
        SET revoked_at = $3
      WHERE id = $1 AND public_id = $2 AND revoked_at IS NULL
      RETURNING id`,
    [tokenId, meta.publicId, Date.now()],
  );
  if (!res[0]) throw new PasteError(404, "Token not found.");
}

export type McpAuth = {
  publicId: string;
  tokenId: string;
  label: string;
};

export async function authenticateMcpBearer(header: string | null): Promise<McpAuth | null> {
  if (!header) return null;
  const raw = header.trim();
  const m = raw.match(/^Bearer\s+(\S+)/i);
  const token = m?.[1] ?? (raw.startsWith("pst_") ? raw : null);
  if (!token || !token.startsWith("pst_")) return null;
  const digest = hashToken(token);
  const sql = await getSql();
  const rows = await sql.query<TokenRow>(
    `SELECT * FROM paste_mcp_tokens WHERE revoked_at IS NULL AND token_hash = $1 LIMIT 1`,
    [digest],
  );
  const row = rows[0];
  if (!row || !hashesEqual(row.token_hash, digest)) return null;
  const session = await getSession(row.public_id, { touch: true, purge: true });
  if (!session) return null;
  await sql.query(`UPDATE paste_mcp_tokens SET last_used_at = $2 WHERE id = $1`, [
    row.id,
    Date.now(),
  ]);
  return { publicId: session.publicId, tokenId: row.id, label: row.label };
}
