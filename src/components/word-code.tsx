import { RefreshCw } from "lucide-react";
import { pickRandomWord } from "@/lib/words";
import { cn } from "@/lib/utils";

type WordCodeProps = {
  words: [string, string, string];
  onChange: (words: [string, string, string]) => void;
  className?: string;
};

/** Quiet three-word session code — not a game reel. */
export function WordCode({ words, onChange, className }: WordCodeProps) {
  const refreshOne = (index: 0 | 1 | 2) => {
    const next = [...words] as [string, string, string];
    next[index] = pickRandomWord(words[index]);
    onChange(next);
  };

  const refreshAll = () => {
    onChange([pickRandomWord(words[0]), pickRandomWord(words[1]), pickRandomWord(words[2])]);
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        {([0, 1, 2] as const).map((i) => (
          <div key={i} className="flex items-center gap-2">
            {i > 0 && (
              <span className="hidden text-[var(--color-fg-subtle)] sm:inline" aria-hidden>
                ·
              </span>
            )}
            <button
              type="button"
              onClick={() => refreshOne(i)}
              title={`Change word ${i + 1}`}
              aria-label={`Word ${i + 1}: ${words[i]}. Click to change.`}
              className={cn(
                "word-chip group inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-2.5 transition-[border-color,background-color,box-shadow] duration-[var(--motion-quick)]",
                "hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]",
              )}
              data-accent={i}
            >
              <span className="font-mono text-sm font-medium tracking-tight text-[var(--color-fg)] sm:text-base">
                {words[i]}
              </span>
              <RefreshCw
                className="size-3.5 text-[var(--color-fg-subtle)] transition-transform duration-[var(--motion-fast)] group-hover:rotate-45 group-hover:text-[var(--color-fg-muted)]"
                aria-hidden
              />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-center">
        <button
          type="button"
          onClick={refreshAll}
          className="text-xs font-medium text-[var(--color-fg-muted)] underline-offset-4 transition-colors hover:text-[var(--color-fg)] hover:underline"
        >
          New code
        </button>
      </div>
    </div>
  );
}
