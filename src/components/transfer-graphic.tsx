import { cn } from "@/lib/utils";

/** Calm product illustration: paste text between two machines. */
export function TransferGraphic({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-md select-none",
        className,
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 400 180"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-auto w-full"
      >
        {/* Soft ground wash */}
        <ellipse cx="200" cy="158" rx="150" ry="12" fill="var(--color-surface-2)" opacity="0.9" />

        {/* Left laptop */}
        <g transform="translate(28, 36)">
          <rect
            x="8"
            y="8"
            width="110"
            height="72"
            rx="8"
            fill="var(--color-surface)"
            stroke="var(--color-border-strong)"
            strokeWidth="1.5"
          />
          <rect x="16" y="16" width="94" height="52" rx="3" fill="var(--color-bg)" />
          {/* Text lines on left screen */}
          <rect x="24" y="26" width="52" height="3" rx="1.5" fill="var(--color-fg-muted)" opacity="0.55" />
          <rect x="24" y="34" width="70" height="3" rx="1.5" fill="var(--color-fg-subtle)" opacity="0.45" />
          <rect x="24" y="42" width="44" height="3" rx="1.5" fill="var(--color-fg-subtle)" opacity="0.35" />
          <rect x="24" y="50" width="60" height="3" rx="1.5" fill="var(--color-fg-subtle)" opacity="0.3" />
          {/* Selection highlight */}
          <rect x="24" y="26" width="52" height="11" rx="2" fill="var(--color-primary)" opacity="0.12" />
          {/* Base */}
          <path
            d="M0 86h126c2 0 4 2 4 4v4H-4v-4c0-2 2-4 4-4z"
            fill="var(--color-surface-2)"
            stroke="var(--color-border)"
            strokeWidth="1"
          />
          <rect x="48" y="88" width="30" height="3" rx="1.5" fill="var(--color-border-strong)" />
        </g>

        {/* Right laptop */}
        <g transform="translate(262, 36)">
          <rect
            x="8"
            y="8"
            width="110"
            height="72"
            rx="8"
            fill="var(--color-surface)"
            stroke="var(--color-border-strong)"
            strokeWidth="1.5"
          />
          <rect x="16" y="16" width="94" height="52" rx="3" fill="var(--color-bg)" />
          {/* Same text arriving */}
          <rect x="24" y="26" width="52" height="3" rx="1.5" fill="var(--color-fg-muted)" opacity="0.55" />
          <rect x="24" y="34" width="70" height="3" rx="1.5" fill="var(--color-fg-subtle)" opacity="0.45" />
          <rect x="24" y="42" width="44" height="3" rx="1.5" fill="var(--color-fg-subtle)" opacity="0.35" />
          <rect x="24" y="50" width="60" height="3" rx="1.5" fill="var(--color-fg-subtle)" opacity="0.3" />
          <path
            d="M0 86h126c2 0 4 2 4 4v4H-4v-4c0-2 2-4 4-4z"
            fill="var(--color-surface-2)"
            stroke="var(--color-border)"
            strokeWidth="1"
          />
          <rect x="48" y="88" width="30" height="3" rx="1.5" fill="var(--color-border-strong)" />
        </g>

        {/* Transfer arc + clipboard chip */}
        <path
          d="M148 72 C175 42, 225 42, 252 72"
          stroke="var(--color-border-strong)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          fill="none"
        />
        <path
          d="M244 66 l8 6 -8 6"
          stroke="var(--color-fg-muted)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Center clipboard card */}
        <g transform="translate(176, 28)">
          <rect
            x="0"
            y="8"
            width="48"
            height="56"
            rx="6"
            fill="var(--color-surface-2)"
            stroke="var(--color-border-strong)"
            strokeWidth="1.5"
          />
          <rect x="14" y="2" width="20" height="12" rx="3" fill="var(--color-primary)" />
          <rect x="18" y="5" width="12" height="6" rx="2" fill="var(--color-primary-fg)" opacity="0.9" />
          <rect x="10" y="22" width="28" height="2.5" rx="1" fill="var(--color-fg-muted)" opacity="0.5" />
          <rect x="10" y="30" width="22" height="2.5" rx="1" fill="var(--color-fg-subtle)" opacity="0.45" />
          <rect x="10" y="38" width="26" height="2.5" rx="1" fill="var(--color-fg-subtle)" opacity="0.4" />
          <rect x="10" y="46" width="18" height="2.5" rx="1" fill="var(--color-fg-subtle)" opacity="0.35" />
        </g>
      </svg>
    </div>
  );
}
