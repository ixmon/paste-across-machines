import { parseSessionSlug } from "@/lib/words";
import { clientIp, jsonError } from "@/lib/http";
import { limitedResponse, rateLimit, type LimitKind } from "@/lib/rate-limit.server";
import { PasteError } from "@/lib/paste-store.server";
import type { FileEntry } from "@/lib/paste-types";
import type { SessionMeta } from "@/lib/paste-store.server";

export function parsePublicId(sessionId: string): string | null {
  const parsed = parseSessionSlug(sessionId);
  return parsed ? parsed.join("-") : null;
}

export function gate(request: Request, kind: LimitKind = "read"): Response | null {
  const hit = rateLimit(clientIp(request), kind);
  if (!hit.ok) return limitedResponse(hit.retryAfter, request);
  return null;
}

export function pasteCatch(e: unknown, request: Request): Response {
  if (e instanceof PasteError) {
    if (e.status === 400 || e.status === 404) {
      rateLimit(clientIp(request), "miss");
    }
    return jsonError(e.status, e.message, undefined, request);
  }
  const msg = e instanceof Error ? e.message : "Request failed";
  if (/JSON|content field/i.test(msg)) {
    return jsonError(400, msg, undefined, request);
  }
  console.error("[paste] api error", e);
  return jsonError(500, "Request failed", undefined, request);
}

export function sessionPayload(
  meta: SessionMeta,
  content: string,
  files: FileEntry[],
) {
  return {
    publicId: meta.publicId,
    words: meta.words,
    content,
    files,
    createdAt: meta.createdAt,
    expiresAt: meta.expiresAt,
    lastAccessedAt: meta.lastAccessedAt,
  };
}
