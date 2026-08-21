import { createHash, randomBytes } from "node:crypto";
import { getSql } from "./db";
import { ensureSession } from "./paste-store.server";
import { createMcpToken } from "./mcp-tokens.server";
import { isValidWord, parseSessionSlug } from "./words";
import {
  authorizeQueryError,
  PUBLIC_CLIENT_ID,
  type AuthorizeParams,
} from "./oauth";

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function s256(verifier: string): string {
  return b64url(createHash("sha256").update(verifier).digest());
}

function normalizeRoomInput(raw: string): string | null {
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/[·.,_/]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const parsed = parseSessionSlug(cleaned);
  if (parsed) return parsed.join("-");
  const spaced = raw
    .toLowerCase()
    .trim()
    .split(/[\s·.,_/\-]+/)
    .filter(Boolean);
  if (spaced.length === 3 && spaced.every(isValidWord)) return spaced.join("-");
  return null;
}

const CODE_TTL_MS = 5 * 60 * 1000;

export async function issueAuthorizationCode(opts: {
  publicIdRaw: string;
  label: string;
  params: AuthorizeParams;
}): Promise<{ redirect: string }> {
  const err = authorizeQueryError(opts.params);
  if (err) throw new Error(err);
  const publicId = normalizeRoomInput(opts.publicIdRaw);
  if (!publicId) throw new Error("Enter three dictionary words for the room.");
  await ensureSession(publicId);
  const code = `pac_${b64url(randomBytes(24))}`;
  const sql = await getSql();
  await sql.query(`DELETE FROM paste_oauth_codes WHERE expires_at < $1`, [Date.now()]);
  await sql.query(
    `INSERT INTO paste_oauth_codes
      (code_hash, client_id, public_id, label, redirect_uri, code_challenge, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      sha256Hex(code),
      opts.params.client_id || PUBLIC_CLIENT_ID,
      publicId,
      (opts.label.trim() || "Grok").slice(0, 40),
      opts.params.redirect_uri,
      opts.params.code_challenge,
      Date.now() + CODE_TTL_MS,
    ],
  );
  const target = new URL(opts.params.redirect_uri);
  target.searchParams.set("code", code);
  if (opts.params.state) target.searchParams.set("state", opts.params.state);
  return { redirect: target.toString() };
}

export async function issueAuthorizationCodeWithIss(
  opts: Parameters<typeof issueAuthorizationCode>[0] & { origin: string },
): Promise<{ redirect: string }> {
  const { redirect } = await issueAuthorizationCode(opts);
  const target = new URL(redirect);
  target.searchParams.set("iss", opts.origin);
  return { redirect: target.toString() };
}

export async function exchangeToken(opts: {
  grant_type: string;
  code: string;
  code_verifier: string;
  client_id: string;
  redirect_uri: string;
}): Promise<{ access_token: string; token_type: string; expires_in: number; scope: string }> {
  if (opts.grant_type !== "authorization_code") {
    throw new Error("unsupported_grant_type");
  }
  if (!opts.code || !opts.code_verifier) {
    throw new Error("invalid_request");
  }
  const sql = await getSql();
  const hash = sha256Hex(opts.code);
  const rows = await sql.query<{
    client_id: string;
    public_id: string;
    label: string;
    redirect_uri: string;
    code_challenge: string;
    expires_at: number | string;
    consumed_at: number | string | null;
  }>(`SELECT * FROM paste_oauth_codes WHERE code_hash = $1 LIMIT 1`, [hash]);
  const row = rows[0];
  if (!row) throw new Error("invalid_grant");
  if (row.consumed_at) throw new Error("invalid_grant");
  if (Number(row.expires_at) <= Date.now()) throw new Error("invalid_grant");
  if (opts.redirect_uri && opts.redirect_uri !== row.redirect_uri) throw new Error("invalid_grant");
  if (opts.client_id && opts.client_id !== row.client_id) throw new Error("invalid_client");
  if (s256(opts.code_verifier) !== row.code_challenge) throw new Error("invalid_grant");

  await sql.query(`UPDATE paste_oauth_codes SET consumed_at = $2 WHERE code_hash = $1`, [
    hash,
    Date.now(),
  ]);

  const minted = await createMcpToken(row.public_id, row.label);
  return {
    access_token: minted.token,
    token_type: "Bearer",
    expires_in: 24 * 60 * 60,
    scope: "paste",
  };
}

export async function registerClient(): Promise<{
  client_id: string;
  client_id_issued_at: number;
  token_endpoint_auth_method: string;
  grant_types: string[];
  response_types: string[];
}> {
  return {
    client_id: `paste_${b64url(randomBytes(12))}`,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code"],
    response_types: ["code"],
  };
}
