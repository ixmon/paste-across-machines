/** Shared HTTP helpers for machine-twin paste routes. */

export const ROBOTS_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Cache-Control": "private, no-store",
} as const;

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 128);
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf.slice(0, 128);
  return "unknown";
}

export function corsHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin === "null" ? "*" : origin,
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function jsonError(
  status: number,
  error: string,
  extra?: Record<string, unknown>,
  request?: Request,
): Response {
  return Response.json(
    { error, ...extra },
    {
      status,
      headers: {
        ...ROBOTS_HEADERS,
        ...corsHeaders(request),
      },
    },
  );
}

export function withApiHeaders(init: ResponseInit = {}, request?: Request): ResponseInit {
  return {
    ...init,
    headers: {
      ...ROBOTS_HEADERS,
      ...corsHeaders(request),
      ...(init.headers ?? {}),
    },
  };
}

export async function readBodyText(request: Request): Promise<string> {
  const type = (request.headers.get("content-type") || "").toLowerCase();
  if (type.includes("application/json")) {
    const raw = await request.text();
    if (!raw.trim()) return "";
    try {
      const parsed = JSON.parse(raw) as { content?: unknown; text?: unknown; body?: unknown };
      if (typeof parsed.content === "string") return parsed.content;
      if (typeof parsed.text === "string") return parsed.text;
      if (typeof parsed.body === "string") return parsed.body;
      throw new Error("JSON body must include a string `content` field.");
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error("Invalid JSON.");
      throw e;
    }
  }
  return await request.text();
}
