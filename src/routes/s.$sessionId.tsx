import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClientOnly, createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  ClipboardPaste,
  Copy,
  Download,
  FilePlus2,
  FileUp,
  Link2,
  Loader2,
  Mic,
  MicOff,
  RefreshCw,
  Save,
  Scissors,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { CodeEditor, type EditorMode } from "@/components/code-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadPaste, removePasteFile, savePaste, saveRoomSkin } from "@/lib/paste.functions";
import type { FileEntry } from "@/lib/paste-types";
import { formatBytes, formatTimeLeft, cn } from "@/lib/utils";
import { formatSessionLabel, parseSessionSlug } from "@/lib/words";
import { ThemeToggle } from "@/components/theme-toggle";
import { SkinPicker } from "@/components/skin-picker";
import { useTheme } from "@/hooks/use-theme";
import { useSpeechDictation } from "@/hooks/use-speech-dictation";
import { fileIdsKey, useRoomSync, type RemoteSnapshot } from "@/hooks/use-room-sync";
import { readEditorMode, writeEditorMode } from "@/lib/editor-mode";
import { isRoomSkin, resolveSkin, skinLabel, type RoomSkinId } from "@/lib/room-skins";

type SessionLoaderResult =
  | {
      ok: true;
      publicId: string;
      words: [string, string, string];
      content: string;
      expiresAt: number;
      createdAt: number;
      noteUpdatedAt?: number;
      skin?: RoomSkinId;
      files: FileEntry[];
    }
  | { ok: false; kind: "invalid" | "missing" | "server"; error: string };

export const Route = createFileRoute("/s/$sessionId")({
  head: ({ params }) => ({
    meta: [
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
    links: [
      { rel: "alternate", type: "text/plain", href: `/s/${params.sessionId}.txt` },
      { rel: "alternate", type: "application/json", href: `/api/paste/${params.sessionId}` },
    ],
  }),
  loader: async ({ params }): Promise<SessionLoaderResult> => {
    const parsed = parseSessionSlug(params.sessionId);
    if (!parsed) {
      return {
        ok: false,
        kind: "invalid",
        error: "Use three dictionary words from the home page.",
      };
    }
    try {
      const data = await loadPaste({ data: { publicId: parsed.join("-") } });
      return { ok: true, ...data };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to open room";
      const status = (e as { status?: number })?.status;
      const kind: "invalid" | "missing" | "server" =
        status === 404 || /not found/i.test(message)
          ? "missing"
          : /invalid session|dictionary words/i.test(message)
            ? "invalid"
            : "server";
      return { ok: false, kind, error: message };
    }
  },
  component: SessionPage,
});

function SessionPage() {
  const data = Route.useLoaderData() as SessionLoaderResult;
  const params = Route.useParams();

  if (!data || !data.ok) {
    const kind = data && "kind" in data ? data.kind : "server";
    const error = data && "error" in data ? data.error : "Failed to open room";
    const title =
      kind === "invalid"
        ? "Invalid room code"
        : kind === "missing"
          ? "Room not found"
          : "Could not open room";
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-16">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
          {kind === "missing"
            ? "This three-word code has no room yet. Open it from the home page, or create it now."
            : error}
        </p>
        <p className="mt-1 font-mono text-xs text-[var(--color-fg-subtle)]">{params.sessionId}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {kind === "missing" && parseSessionSlug(params.sessionId) && (
            <Button
              onClick={() => {
                const id = parseSessionSlug(params.sessionId)?.join("-");
                if (!id) return;
                void fetch(`/api/paste/${id}`, { method: "POST" }).then((res) => {
                  if (!res.ok) {
                    toast.error("Could not create room");
                    return;
                  }
                  window.location.reload();
                });
              }}
            >
              Create this room
            </Button>
          )}
          <Button asChild variant={kind === "missing" ? "secondary" : "default"}>
            <Link to="/">
              <ArrowLeft className="size-4" />
              Back home
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return <VaultWorkspace initial={data} />;
}

type VaultData = Extract<SessionLoaderResult, { ok: true }>;

function defaultFileName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `note-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.txt`;
}

function sanitizeClientName(name: string): string {
  const base = name.trim().replace(/[/\\?%*:|"<>]/g, "-").slice(0, 180);
  if (!base) return defaultFileName();
  return base.includes(".") ? base : `${base}.txt`;
}

function VaultWorkspace({ initial }: { initial: VaultData }) {
  const { resolved: appearance } = useTheme();
  const [content, setContent] = useState(initial.content);
  const [files, setFiles] = useState(initial.files);
  const [mode, setModeState] = useState<EditorMode>("normal");
  const [skin, setSkin] = useState<RoomSkinId>(() =>
    resolveSkin(initial.publicId, initial.skin),
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [expiresAt, setExpiresAt] = useState(initial.expiresAt);
  const [uploading, setUploading] = useState(false);
  const [savingFile, setSavingFile] = useState(false);
  const [fileName, setFileName] = useState(() => defaultFileName());
  const [timeLabel, setTimeLabel] = useState(() => formatTimeLeft(initial.expiresAt));
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<number | null>(null);
  const lastSaved = useRef(initial.content);
  const contentRef = useRef(initial.content);
  contentRef.current = content;
  const [conflict, setConflict] = useState<RemoteSnapshot | null>(null);
  const [liveAt, setLiveAt] = useState<number | null>(null);
  const dismissedRemote = useRef<string | null>(null);

  useEffect(() => {
    setModeState(readEditorMode());
  }, []);

  const setMode = useCallback((next: EditorMode) => {
    setModeState(next);
    writeEditorMode(next);
  }, []);

  const persistSkin = useCallback(
    async (next: RoomSkinId) => {
      setSkin(next);
      try {
        await saveRoomSkin({ data: { publicId: initial.publicId, skin: next } });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save room look");
      }
    },
    [initial.publicId],
  );

  useEffect(() => {
    const id = window.setInterval(() => setTimeLabel(formatTimeLeft(expiresAt)), 30_000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  const persist = useCallback(
    async (text: string) => {
      if (text === lastSaved.current) return;
      setSaveState("saving");
      try {
        const res = await savePaste({
          data: { publicId: initial.publicId, content: text },
        });
        lastSaved.current = text;
        setExpiresAt(res.expiresAt);
        setSaveState("saved");
        setConflict(null);
      } catch (e) {
        setSaveState("error");
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    },
    [initial.publicId],
  );

  const onChange = useCallback(
    (next: string) => {
      setContent(next);
      setSaveState("idle");
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void persist(next);
      }, 700);
    },
    [persist],
  );

  const speech = useSpeechDictation({
    getText: () => contentRef.current,
    onFinal: (next) => onChange(next),
  });

  useEffect(() => {
    if (speech.error) toast.error(speech.error);
  }, [speech.error]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const filesRef = useRef(files);
  filesRef.current = files;

  const applyRemote = useCallback((snap: RemoteSnapshot, kind: "content" | "files") => {
    setExpiresAt(snap.expiresAt);
    if (kind === "content") {
      lastSaved.current = snap.content;
      setContent(snap.content);
      setSaveState("saved");
      setLiveAt(Date.now());
    }
    setFiles(snap.files);
  }, []);

  useRoomSync({
    publicId: initial.publicId,
    getLocal: () => contentRef.current,
    getSynced: () => lastSaved.current,
    getFileIds: () => fileIdsKey(filesRef.current),
    getSkin: () => skin,
    onApply: applyRemote,
    onConflict: (snap) => {
      if (snap.content === dismissedRemote.current) return;
      setConflict(snap);
      setExpiresAt(snap.expiresAt);
    },
    onClearConflict: () => setConflict(null),
    onSkin: (next) => {
      if (isRoomSkin(next)) setSkin(next);
    },
  });

  const acceptRemote = () => {
    if (!conflict) return;
    dismissedRemote.current = null;
    applyRemote(conflict, "content");
    setConflict(null);
  };

  const keepMine = () => {
    if (conflict) dismissedRemote.current = conflict.content;
    setConflict(null);
  };

  useEffect(() => {
    if (!liveAt) return;
    const t = window.setTimeout(() => setLiveAt(null), 8000);
    return () => window.clearTimeout(t);
  }, [liveAt]);

  const label = useMemo(() => formatSessionLabel(initial.words), [initial.words]);

  const copyLink = async () => {
    const url = `${window.location.origin}/s/${initial.publicId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied");
    } catch {
      toast.message(url);
    }
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("Copied note");
    } catch {
      toast.error("Clipboard blocked");
    }
  };

  const cutAll = async () => {
    try {
      await navigator.clipboard.writeText(content);
      onChange("");
      toast.success("Cut note to clipboard");
    } catch {
      toast.error("Clipboard blocked");
    }
  };

  const pasteInto = async () => {
    try {
      const text = await navigator.clipboard.readText();
      onChange(content + (content && !content.endsWith("\n") ? "\n" : "") + text);
      toast.success("Pasted");
    } catch {
      toast.error("Allow clipboard access or use Ctrl/Cmd+V in the editor");
    }
  };

  const uploadBlob = async (file: File | Blob, name: string) => {
    if (file.size > 100 * 1024 * 1024) {
      throw new Error(`${name} exceeds 100 MB`);
    }
    if (file.size === 0) {
      throw new Error("Nothing to save — file is empty");
    }
    const body = new FormData();
    body.append("file", file, name);
    const res = await fetch(`/api/paste/${initial.publicId}/files`, {
      method: "POST",
      body,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(err?.error || `Upload failed (${res.status})`);
    }
    return (await res.json()) as FileEntry;
  };

  const onUpload = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const entry = await uploadBlob(file, file.name);
        setFiles((f) => [...f, entry]);
        toast.success(`Saved ${file.name}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const saveEditorAsFile = async () => {
    const name = sanitizeClientName(fileName);
    setSavingFile(true);
    try {
      if (content !== lastSaved.current) {
        await persist(content);
      }
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const entry = await uploadBlob(blob, name);
      setFiles((f) => [...f, entry]);
      setFileName(defaultFileName());
      toast.success(`Saved ${entry.name} to room files`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save file");
    } finally {
      setSavingFile(false);
    }
  };

  const downloadFile = async (entry: FileEntry) => {
    setDownloadingId(entry.id);
    try {
      const res = await fetch(`/api/paste/${initial.publicId}/files/${entry.id}`);
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = entry.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${entry.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloadingId(null);
    }
  };

  const onDeleteFile = async (fileId: string) => {
    try {
      await removePasteFile({ data: { publicId: initial.publicId, fileId } });
      setFiles((f) => f.filter((x) => x.id !== fileId));
      toast.success("File removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div
      data-skin={skin}
      className="relative flex h-dvh min-h-0 flex-col overflow-hidden bg-[var(--color-bg)]"
    >
      <div aria-hidden className="skin-wash" />
      <header className="relative z-20 flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 sm:px-4">
        <Button asChild variant="ghost" size="sm" className="shrink-0">
          <Link to="/">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Home</span>
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight">{label}</p>
          <p className="truncate font-mono text-[0.6875rem] text-[var(--color-fg-subtle)]">
            {initial.publicId} · {skinLabel(skin)} · {timeLabel}
            {liveAt ? " · live" : ""}
          </p>
        </div>
        <SaveBadge state={saveState} />
        <Button variant="ghost" size="sm" onClick={() => void copyLink()} title="Copy share link">
          <Link2 className="size-4" />
          <span className="hidden md:inline">Share</span>
        </Button>
        <ThemeToggle />
        <SkinPicker value={skin} onChange={(id) => void persistSkin(id)} />
        <div
          className="flex rounded-[var(--radius-sm)] border border-[var(--color-border)] p-0.5"
          role="group"
          aria-label="Editor mode"
        >
          <ModeButton active={mode === "normal"} onClick={() => setMode("normal")}>
            Normal
          </ModeButton>
          <ModeButton active={mode === "vim"} onClick={() => setMode("vim")}>
            Vim
          </ModeButton>
        </div>
      </header>

      {conflict && (
        <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 sm:px-4">
          <p className="min-w-0 flex-1 text-xs text-[var(--color-fg)]">
            Updated on another machine. Reload to take that version — or keep typing; your next save
            wins.
          </p>
          <Button size="sm" onClick={acceptRemote}>
            <RefreshCw className="size-3.5" />
            Reload
          </Button>
          <Button size="sm" variant="ghost" onClick={keepMine}>
            Keep mine
          </Button>
        </div>
      )}

      <div className="relative z-10 flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-[var(--color-border)] lg:border-b-0 lg:border-r">
          <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5">
            <ToolBtn onClick={() => void cutAll()} title="Cut all">
              <Scissors className="size-3.5" />
              Cut
            </ToolBtn>
            <ToolBtn onClick={() => void copyAll()} title="Copy all">
              <Copy className="size-3.5" />
              Copy
            </ToolBtn>
            <ToolBtn onClick={() => void pasteInto()} title="Paste from clipboard">
              <ClipboardPaste className="size-3.5" />
              Paste
            </ToolBtn>
            <ToolBtn
              onClick={() => void saveEditorAsFile()}
              title="Save editor text as a file in this room"
            >
              <FilePlus2 className="size-3.5" />
              Save as file
            </ToolBtn>
            <ToolBtn
              onClick={() => {
                if (!speech.supported) {
                  toast.error(
                    "Voice input isn’t supported in this browser. Try Chrome, Edge, or Safari with mic permission.",
                  );
                  return;
                }
                speech.toggle();
              }}
              title={
                speech.listening
                  ? "Stop voice input"
                  : "Dictate with your microphone (browser speech recognition)"
              }
              active={speech.listening}
            >
              {speech.listening ? (
                <MicOff className="size-3.5" />
              ) : (
                <Mic className="size-3.5" />
              )}
              {speech.listening ? "Stop" : "Voice"}
            </ToolBtn>
            {speech.listening && (
              <span
                className="inline-flex min-w-0 max-w-[min(16rem,45vw)] items-center gap-1.5 truncate text-[0.6875rem] text-[var(--color-fg-muted)]"
                title={
                  speech.preview
                    ? speech.interim
                      ? `Hearing: ${speech.preview}`
                      : `Captured: ${speech.preview}`
                    : "Listening… Safari shows phrases after you pause."
                }
              >
                <span
                  className="inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-[var(--color-fg)]"
                  aria-hidden
                />
                <span className="truncate">
                  {speech.preview
                    ? speech.interim
                      ? speech.preview
                      : `“${speech.preview}”`
                    : "Listening…"}
                </span>
              </span>
            )}
            <span className="ml-auto font-mono text-[0.6875rem] text-[var(--color-fg-subtle)]">
              {content.length.toLocaleString()} chars
              {mode === "vim" ? " · vim" : ""}
              {speech.listening ? " · mic" : ""}
            </span>
          </div>
          <div className="min-h-0 flex-1">
            <ClientOnly
              fallback={
                <div className="flex h-full items-center justify-center text-sm text-[var(--color-fg-muted)]">
                  Loading editor…
                </div>
              }
            >
              <CodeEditor
                value={content}
                onChange={onChange}
                mode={mode}
                appearance={skin === "glossy-black" ? "dark" : appearance}
                className="h-full"
                placeholder="Start typing… notes autosave. Use “Save as file” to put a copy in the Files list."
              />
            </ClientOnly>
          </div>
        </section>

        <aside className="flex max-h-[42vh] w-full shrink-0 flex-col bg-[var(--color-surface)] lg:max-h-none lg:w-80 xl:w-88">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2.5">
            <h2 className="text-sm font-semibold">Files in this room</h2>
            <span className="text-[0.6875rem] text-[var(--color-fg-subtle)]">max 100 MB</span>
          </div>

          <div className="space-y-2 border-b border-[var(--color-border)] p-3">
            <p className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-subtle)]">
              Save editor as file
            </p>
            <div className="flex gap-2">
              <Input
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="note.txt"
                spellCheck={false}
                className="h-9 font-mono text-xs"
                aria-label="File name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void saveEditorAsFile();
                  }
                }}
              />
              <Button
                size="sm"
                className="h-9 shrink-0"
                disabled={savingFile || !content.trim()}
                onClick={() => void saveEditorAsFile()}
              >
                {savingFile ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                Save
              </Button>
            </div>
            <p className="text-[0.6875rem] leading-relaxed text-[var(--color-fg-subtle)]">
              Writes the current text into this room. Anyone with the code can download it from the
              list below.
            </p>
          </div>

          <div className="border-b border-[var(--color-border)] p-3">
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              id="paste-upload"
              multiple
              onChange={(e) => void onUpload(e.target.files)}
            />
            <label
              htmlFor="paste-upload"
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 py-4 text-center transition-[border-color,background-color] duration-[var(--motion-quick)] hover:border-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]",
                uploading && "pointer-events-none opacity-60",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void onUpload(e.dataTransfer.files);
              }}
            >
              {uploading ? (
                <Loader2 className="size-5 animate-spin text-[var(--color-fg-muted)]" />
              ) : (
                <FileUp className="size-5 text-[var(--color-fg-muted)]" />
              )}
              <span className="text-xs font-medium text-[var(--color-fg)]">
                {uploading ? "Uploading…" : "Or drop / choose any file"}
              </span>
            </label>
          </div>

          <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
            {files.length === 0 && (
              <li className="px-2 py-8 text-center text-xs text-[var(--color-fg-subtle)]">
                No files yet — save the editor or upload one.
              </li>
            )}
            {files.map((f) => (
              <li
                key={f.id}
                className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-[var(--color-fg)]">{f.name}</p>
                  <p className="text-[0.6875rem] text-[var(--color-fg-subtle)]">
                    {formatBytes(f.size)}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 flex-1 text-xs"
                    disabled={downloadingId === f.id}
                    onClick={() => void downloadFile(f)}
                  >
                    {downloadingId === f.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                    Download
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 px-0 text-[var(--color-fg-muted)] hover:bg-[var(--color-danger)] hover:text-[var(--color-danger-fg)]"
                    title="Delete"
                    onClick={() => void onDeleteFile(f.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <ForAgentsCard publicId={initial.publicId} />
        </aside>
      </div>
    </div>
  );
}

function ForAgentsCard({ publicId }: { publicId: string }) {
  const [open, setOpen] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.message(text);
    }
  };

  const readCmd = `curl -fsS ${origin}/s/${publicId}.txt`;
  const appendCmd = `curl -fsS -X POST ${origin}/api/paste/${publicId}/append \\\n  -H 'Content-Type: text/plain' \\\n  --data-binary $'## From agent $(date -u +%Y-%m-%dT%H:%M:%SZ)\\n...\\n'`;
  const uploadCmd = `curl -fsS -F file=@out.diff ${origin}/api/paste/${publicId}/files`;

  return (
    <div className="border-t border-[var(--color-border)] p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left text-xs font-semibold text-[var(--color-fg)]"
        aria-expanded={open}
      >
        For agents
        <span className="text-[0.6875rem] font-medium text-[var(--color-fg-subtle)]">
          {open ? "Hide" : "curl"}
        </span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-[0.6875rem] leading-relaxed text-[var(--color-fg-subtle)]">
            Read as plain text. Append — don't replace — unless you mean to.
          </p>
          <AgentCmd label="Read" cmd={readCmd} onCopy={() => void copy(readCmd, "Read command")} />
          <AgentCmd
            label="Append"
            cmd={appendCmd}
            onCopy={() => void copy(appendCmd, "Append command")}
          />
          <AgentCmd
            label="Upload"
            cmd={uploadCmd}
            onCopy={() => void copy(uploadCmd, "Upload command")}
          />
          <a
            href={`/s/${publicId}.txt`}
            className="inline-block text-[0.6875rem] text-[var(--color-fg-muted)] underline-offset-2 hover:text-[var(--color-fg)] hover:underline"
          >
            Open .txt
          </a>
        </div>
      )}
    </div>
  );
}

function AgentCmd({
  label,
  cmd,
  onCopy,
}: {
  label: string;
  cmd: string;
  onCopy: () => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-[var(--color-fg-subtle)]">
          {label}
        </p>
        <button
          type="button"
          onClick={onCopy}
          className="text-[0.6875rem] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        >
          Copy
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2 font-mono text-[0.625rem] leading-relaxed text-[var(--color-fg-muted)]">
        {cmd}
      </pre>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[calc(var(--radius-sm)-2px)] px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)]"
          : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
      )}
    >
      {children}
    </button>
  );
}

function ToolBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-pressed={active ? true : undefined}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-xs)] px-2 text-xs font-medium transition-colors",
        active
          ? "bg-[var(--color-surface-3)] text-[var(--color-fg)]"
          : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]",
      )}
    >
      {children}
    </button>
  );
}

function SaveBadge({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "idle") {
    return (
      <span className="hidden text-[0.6875rem] text-[var(--color-fg-subtle)] sm:inline">
        Autosave
      </span>
    );
  }
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-[0.6875rem] text-[var(--color-fg-muted)]">
        <Loader2 className="size-3 animate-spin" />
        Saving
      </span>
    );
  }
  if (state === "error") {
    return <span className="text-[0.6875rem] text-[var(--color-danger-fg)]">Save failed</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-[0.6875rem] text-[var(--color-fg-muted)]">
      <Check className="size-3" />
      Saved
    </span>
  );
}
