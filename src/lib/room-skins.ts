export const ROOM_SKINS = [
  { id: "plain", label: "Plain", swatch: "#a1a1aa" },
  { id: "tangerine", label: "Tangerine", swatch: "#ff7a3d" },
  { id: "puce", label: "Puce", swatch: "#6e2d3a" },
  { id: "midnight-purple", label: "Midnight purple", swatch: "#5b21b6" },
  { id: "glossy-black", label: "Glossy black", swatch: "#111111" },
  { id: "plaid", label: "Plaid", swatch: "#9b1b30" },
  { id: "diagonal-stripe", label: "Diagonal stripe", swatch: "#f59e0b" },
  { id: "dragon-scales", label: "Dragon scales", swatch: "#166534" },
] as const;

export type RoomSkinId = (typeof ROOM_SKINS)[number]["id"];

const IDS = new Set<string>(ROOM_SKINS.map((s) => s.id));

export function isRoomSkin(value: unknown): value is RoomSkinId {
  return typeof value === "string" && IDS.has(value);
}

const WILD = ROOM_SKINS.filter((s) => s.id !== "plain");

/** Stable default so two people opening the same room see the same look. */
export function defaultSkinFor(publicId: string): RoomSkinId {
  let h = 2166136261;
  for (let i = 0; i < publicId.length; i += 1) {
    h ^= publicId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = Math.abs(h) % WILD.length;
  return WILD[idx]!.id;
}

export function resolveSkin(publicId: string, stored?: string | null): RoomSkinId {
  if (isRoomSkin(stored)) return stored;
  return defaultSkinFor(publicId);
}

export function skinLabel(id: RoomSkinId): string {
  return ROOM_SKINS.find((s) => s.id === id)?.label ?? id;
}
