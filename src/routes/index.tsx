import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Link2, Lock, Scissors } from "lucide-react";
import { toast } from "sonner";
import { TransferGraphic } from "@/components/transfer-graphic";
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

  const openVault = useCallback(
    (target?: string) => {
      const id = normalizeSessionInput(target ?? slug);
      if (!id) {
        toast.error("Enter exactly three valid dictionary words.");
        return;
      }
      void navigate({ to: "/s/$sessionId", params: { sessionId: id } });
    },
    [navigate, slug],
  );

  const copyLink = async () => {
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
      <div aria-hidden className="paste-grid pointer-events-none absolute inset-0 opacity-70" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-14 pt-8 sm:px-6 sm:pt-12">
        <header className="mb-8 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg)]">
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
              Cut and paste across machines
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[var(--color-fg-muted)]">
              Drop text or a file into a short-lived room. Open the same three-word code — or the
              link — on the other computer. Gone in 24 hours.
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
              <Button size="lg" className="w-full" onClick={() => openVault()}>
                Open room
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
                openVault(manual);
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
