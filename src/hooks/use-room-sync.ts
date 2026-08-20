import { useEffect, useRef } from "react";
import type { FileEntry } from "@/lib/paste-types";

export type RemoteSnapshot = {
  content: string;
  files: FileEntry[];
  noteUpdatedAt: number;
  expiresAt: number;
};

type UseRoomSyncArgs = {
  publicId: string;
  getLocal: () => string;
  getSynced: () => string;
  getFileIds: () => string;
  /** Apply remote content/files. Caller should treat this as already-on-server. */
  onApply: (snap: RemoteSnapshot, kind: "content" | "files") => void;
  onConflict: (snap: RemoteSnapshot) => void;
  onClearConflict?: () => void;
  enabled?: boolean;
};

const POLL_MS = 2500;

export function fileIdsKey(files: FileEntry[]): string {
  return files
    .map((f) => f.id)
    .sort()
    .join(",");
}

export function useRoomSync({
  publicId,
  getLocal,
  getSynced,
  getFileIds,
  onApply,
  onConflict,
  onClearConflict,
  enabled = true,
}: UseRoomSyncArgs) {
  const refs = useRef({ getLocal, getSynced, getFileIds, onApply, onConflict, onClearConflict });
  refs.current = { getLocal, getSynced, getFileIds, onApply, onConflict, onClearConflict };

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let cancelled = false;
    let timer: number | null = null;
    let inFlight = false;

    const tick = async () => {
      if (cancelled || inFlight) return;
      if (document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const res = await fetch(`/api/paste/${publicId}?watch=1`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as RemoteSnapshot;
        const { getLocal, getSynced, getFileIds, onApply, onConflict, onClearConflict } =
          refs.current;
        const synced = getSynced();
        const local = getLocal();
        const contentChanged = data.content !== synced;
        const filesChanged = fileIdsKey(data.files) !== getFileIds();

        if (contentChanged) {
          if (local === synced) {
            onApply(data, "content");
            onClearConflict?.();
          } else {
            onConflict(data);
          }
          return;
        }

        if (filesChanged) {
          onApply(data, "files");
        }
        if (local === synced) onClearConflict?.();
      } catch {
        /* ignore transient errors */
      } finally {
        inFlight = false;
      }
    };

    const loop = () => {
      void tick();
      timer = window.setTimeout(loop, POLL_MS);
    };
    loop();
    const vis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [publicId, enabled]);
}
