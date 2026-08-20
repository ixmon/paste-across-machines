import { useEffect, useRef, useState } from "react";
import { Palette } from "lucide-react";
import { ROOM_SKINS, skinLabel, type RoomSkinId } from "@/lib/room-skins";
import { cn } from "@/lib/utils";

type SkinPickerProps = {
  value: RoomSkinId;
  onChange: (id: RoomSkinId) => void;
};

export function SkinPicker({ value, onChange }: SkinPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`Room look: ${skinLabel(value)}`}
        aria-label={`Room look: ${skinLabel(value)}. Click to change.`}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-xs)] text-[var(--color-fg-muted)] transition-[background-color,color] duration-[var(--motion-quick)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
      >
        <Palette className="size-3.5" aria-hidden />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Room look"
          className="absolute right-0 z-40 mt-1 w-52 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-[var(--shadow-sm)]"
        >
          {ROOM_SKINS.map((skin) => (
            <button
              key={skin.id}
              type="button"
              role="option"
              aria-selected={skin.id === value}
              onClick={() => {
                onChange(skin.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-[var(--radius-xs)] px-2 py-1.5 text-left text-xs text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]",
                skin.id === value && "bg-[var(--color-surface-2)]",
              )}
            >
              <span
                className="skin-swatch size-4 shrink-0 rounded-full border border-[var(--color-border-strong)]"
                data-skin-swatch={skin.id}
                aria-hidden
              />
              {skin.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
