/**
 * Deterministic session identity from three bandit words.
 * Public id is the human-readable slug; storage key is a hash of the slug.
 */

export function wordsToPublicId(words: [string, string, string]): string {
  return words.map((w) => w.toLowerCase().trim()).join("-");
}

/** FNV-1a 32-bit → hex (fast, deterministic, no crypto API needed on client). */
export function hashSessionSlug(slug: string): string {
  let h = 0x811c9dc5;
  const s = slug.toLowerCase().trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // unsigned 32-bit hex, 8 chars
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function publicIdToStorageKey(publicId: string): string {
  return hashSessionSlug(publicId);
}

export async function sha256Hex(input: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle !== "undefined") {
    const data = new TextEncoder().encode(input);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback for rare environments without subtle
  return hashSessionSlug(input).repeat(8).slice(0, 64);
}
