import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Bot, Link2, Lock, Scissors } from "lucide-react";
import { toast } from "sonner";
import { TransferGraphic } from "@/components/transfer-graphic";
import { CutEdge } from "@/components/cut-edge";
import { WordCode } from "@/components/word-code";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_WORDS,
  isValidWord,
  parseSessionSlug,
  pickRandomWord,
  wordsToSlug,
} from "@/lib/words";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function normalizeSessionInput(raw: string): string | null {
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/[·.,_/]+/g, "-")
    .replace(/\s+/g, "-");
  const compact = cleaned.replace(/-+/g, "-").replace(/^-|-$/g, "");
  const parsed = parseSessionSlug(compact);
  if (parsed) return parsed.join("-");
  const spaced = raw
    .toLowerCase()
    .trim()
    .split(/[\s·.,_/\-]+/)
    .filter(Boolean);
  if (spaced.length === 3 && spaced.every(isValidWord)) {
    return spaced.join("-");
  }
  return null;
}

function LandingPage() {
  const navigate = useNavigate();
  const [words, setWords] = useState<[string, string, string]>(() => [
    DEFAULT_WORDS[0],
    DEFAULT_WORDS[1],
    DEFAULT_WORDS[2],
  ]);
  const [ready, setReady] = useState(false);
  const [manual, setManual] = useState("");
  const slug = useMemo(() => wordsToSlug(words), [words]);

  useEffect(() => {
    setWords([pickRandomWord(), pickRandomWord(), pickRandomWord()]);
    setReady(true);
  }, []);

  const [opening, setOpening] = useState(false);

  const ensureRoom = useCallback(async (id: string) => {
    const res = await fetch(`/api/paste/${id}`, { method: "POST" });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(err?.error || `Could not create room (${res.status})`);
    }
  }, []);

  const openVault = useCallback(
    async (target?: string, { create }: { create: boolean } = { create: true }) => {
      const id = normalizeSessionInput(target ?? slug);
      if (!id) {
        toast.error("Enter exactly three valid dictionary words.");
        return;
      }
      if (create) {
        setOpening(true);
        try {
          await ensureRoom(id);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not create room");
          setOpening(false);
          return;
        }
        setOpening(false);
      }
      void navigate({ to: "/s/$sessionId", params: { sessionId: id } });
    },
    [navigate, slug, ensureRoom],
  );

  const copyLink = async () => {
    try {
      await ensureRoom(slug);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create room");
      return;
    }
    const url = `${window.location.origin}/s/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied — open it on the other machine");
    } catch {
      toast.message(url);
    }
  };

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <CutEdge />
      <div aria-hidden className="paste-grid pointer-events-none absolute inset-0 opacity-70" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-14 pt-8 sm:px-6 sm:pt-12">
        <header className="mb-8 flex items-center gap-2.5">
          <span className="logo-mark flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border text-[var(--accent-tangerine)]">
            <Scissors className="size-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight text-[var(--color-fg)]">Paste</p>
            <p className="text-xs text-[var(--color-fg-subtle)]">across machines · 24h</p>
          </div>
        </header>

        <main className="flex flex-1 flex-col">
          <section className="text-center">
            <TransferGraphic className="mb-6" />
            <h1 className="font-display text-[clamp(1.5rem,4.5vw,2rem)] font-semibold leading-[1.2] tracking-[-0.03em] text-[var(--color-fg)]">
              Agentic / human cut and paste
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[var(--color-fg-muted)]">
              Drop text or a file into a short-lived room. Open the same three-word code on the
              other computer — or point an agent at the link. Gone in 24 hours.
            </p>
          </section>

          <section className="mt-8 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)] sm:p-6">
            <div className="mb-4 text-center">
              <h2 className="text-sm font-semibold text-[var(--color-fg)]">Your room code</h2>
              <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
                Three words. Share them, or copy the link below.
              </p>
            </div>

            {ready ? (
              <WordCode words={words} onChange={setWords} />
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {words.map((w) => (
                  <span
                    key={w}
                    className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-2.5 font-mono text-sm"
                  >
                    {w}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-6 flex flex-col gap-2.5">
              <Button size="lg" className="w-full" disabled={opening} onClick={() => void openVault()}>
                {opening ? "Opening…" : "Open room"}
                <ArrowRight className="size-4" />
              </Button>
              <Button size="lg" variant="secondary" className="w-full" onClick={() => void copyLink()}>
                <Link2 className="size-4" />
                Copy link for the other computer
              </Button>
            </div>
          </section>

          <section className="mt-6">
            <p className="mb-2 text-center text-xs text-[var(--color-fg-subtle)]">
              Already have a code?
            </p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                openVault(manual, { create: false });
              }}
            >
              <Input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="apple hydrogen fantastic"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                aria-label="Session words"
              />
              <Button type="submit" variant="outline" className="shrink-0">
                Join
              </Button>
            </form>
          </section>

          <AgentHint slug={slug} />

          <p className="mt-10 flex items-start justify-center gap-2 text-center text-xs leading-relaxed text-[var(--color-fg-subtle)]">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              No accounts. Knowing the three words opens the room. Don't put passwords you
              care about keeping.
            </span>
          </p>
        </main>
      </div>
    </div>
  );
}

function AgentHint({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const roomUrl = `${origin || ""}/s/${slug}`;
  const prompt = `Get additional context from ${roomUrl}\nFollow # AGENT at the top of the note.\nAppend your result — do not replace the whole note.`;
  const readCmd = `curl -fsS ${origin || ""}/s/${slug}.txt`;
  const appendCmd = `curl -fsS -X POST ${origin || ""}/api/paste/${slug}/append \\\n  -H 'Content-Type: text/plain' --data-binary @-`;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.message(text);
    }
  };

  return (
    <section className="mt-8 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg-muted)]">
          <Bot className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[var(--color-fg)]">Hand it to an agent</h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-fg-muted)]">
            Same room, no extra protocol. Give them the link, or mint an MCP bearer on the room
            page and paste it into Grok's Add MCP server dialog. They read the note, follow{" "}
            <span className="font-mono"># AGENT</span>, and append. The other machine sees it live.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-9 flex-1"
          onClick={() => void copy(prompt, "Agent prompt copied")}
        >
          Copy agent prompt
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? "Hide curl" : "Show curl"}
        </Button>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          <p className="font-mono text-[0.6875rem] break-all text-[var(--color-fg-subtle)]">
            {roomUrl || `/s/${slug}`}
          </p>
          <CurlBlock label="Read" cmd={readCmd} onCopy={() => void copy(readCmd, "Read command copied")} />
          <CurlBlock
            label="Append"
            cmd={appendCmd}
            onCopy={() => void copy(appendCmd, "Append command copied")}
          />
          <p className="text-[0.6875rem] leading-relaxed text-[var(--color-fg-subtle)]">
            Contract:{" "}
            <a
              href="/llms.txt"
              className="underline-offset-2 hover:text-[var(--color-fg)] hover:underline"
            >
              /llms.txt
            </a>
            . Append, don't PUT. Three words are a doorbell — not a vault.
          </p>
        </div>
      )}
    </section>
  );
}

function CurlBlock({
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
