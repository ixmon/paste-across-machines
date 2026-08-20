export type EditorMode = "normal" | "vim";

export const EDITOR_MODE_KEY = "paste-editor-mode";

export function isEditorMode(value: unknown): value is EditorMode {
  return value === "normal" || value === "vim";
}

export function readEditorMode(): EditorMode {
  if (typeof window === "undefined") return "normal";
  try {
    const raw = localStorage.getItem(EDITOR_MODE_KEY);
    if (isEditorMode(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "normal";
}

export function writeEditorMode(mode: EditorMode): void {
  try {
    localStorage.setItem(EDITOR_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}
