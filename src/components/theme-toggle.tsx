import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { themeLabel } from "@/lib/theme";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  className?: string;
  /** Compact icon-only control for the editor chrome */
  compact?: boolean;
};

export function ThemeToggle({ className, compact = true }: ThemeToggleProps) {
  const { preference, cycle, ready } = useTheme();

  const Icon = preference === "light" ? Sun : preference === "dark" ? Moon : Monitor;
  const label = `Theme: ${themeLabel(preference)}. Click to change.`;

  return (
    <button
      type="button"
      onClick={cycle}
      title={label}
      aria-label={label}
      disabled={!ready}
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-[var(--radius-xs)] text-[var(--color-fg-muted)] transition-[background-color,color,opacity] duration-[var(--motion-quick)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50",
        compact ? "w-8 px-0" : "px-2 text-xs font-medium",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {!compact && <span>{themeLabel(preference)}</span>}
    </button>
  );
}
