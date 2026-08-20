/**
 * In-memory sliding-window limiter.
 * Per-instance on serverless, but still stops a single IP from sweeping rooms.
 */

type Bucket = { hits: number[]; };

const ipHits = new Map<string, Bucket>();
let globalHits: number[] = [];

const WINDOW_MS = 60_000;
const PER_IP_MAX = 40;
const GLOBAL_MAX = 400;
const MISS_MAX = 8; // invalid slugs / 404s per IP per minute

function prune(ts: number[], now: number): number[] {
  const cut = now - WINDOW_MS;
  let i = 0;
  while (i < ts.length && ts[i]! < cut) i += 1;
  return i === 0 ? ts : ts.slice(i);
}

function sweepMaps(now: number) {
  if (ipHits.size < 2000) return;
  for (const [k, b] of ipHits) {
    b.hits = prune(b.hits, now);
    if (b.hits.length === 0) ipHits.delete(k);
  }
}

export type LimitKind = "read" | "write" | "miss";

export function rateLimit(ip: string, kind: LimitKind = "read"): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  sweepMaps(now);
  globalHits = prune(globalHits, now);

  const key = `${kind === "miss" ? "m:" : ""}${ip}`;
  let bucket = ipHits.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    ipHits.set(key, bucket);
  }
  bucket.hits = prune(bucket.hits, now);

  const ipMax = kind === "miss" ? MISS_MAX : PER_IP_MAX;
  if (bucket.hits.length >= ipMax || globalHits.length >= GLOBAL_MAX) {
    const oldest = bucket.hits[0] ?? now;
    const retryAfter = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    return { ok: false, retryAfter };
  }

  bucket.hits.push(now);
  if (kind !== "miss") globalHits.push(now);
  return { ok: true };
}

export function limitedResponse(retryAfter: number, request?: Request): Response {
  return Response.json(
    {
      error: "Too many requests. Slow down.",
      retryAfter,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "Access-Control-Allow-Origin": request?.headers.get("origin") || "*",
      },
    },
  );
}
