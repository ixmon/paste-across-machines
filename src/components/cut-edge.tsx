import { Scissors } from "lucide-react";

/** Torn-paper strip with a scissors cut line — identity bar for the landing page. */
export function CutEdge() {
  return (
    <div className="relative z-10 h-9 overflow-hidden" aria-hidden>
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 28"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="cut-edge-fill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--accent-tangerine)" />
            <stop offset="0.36" stopColor="var(--accent-purple)" />
            <stop offset="0.7" stopColor="var(--accent-scale)" />
            <stop offset="1" stopColor="var(--accent-stripe)" />
          </linearGradient>
        </defs>
        <path
          fill="url(#cut-edge-fill)"
          d="M0 0 H100 V9.2
             L96.5 16.5 93.2 10.4 89.6 17.8 86.1 9.6 82.4 15.9 78.8 8.8
             75.2 18.2 71.6 11.1 67.9 16.8 64.4 9.2 60.7 17.4 57.1 10.6
             53.4 18.6 49.8 9.8 46.2 15.4 42.5 8.6 38.9 17.1 35.3 11.4
             31.6 16.6 28 9.4 24.4 18 20.7 10.8 17.1 15.7 13.5 8.9
             9.8 17.6 6.2 11.2 3.1 16.2 0 10.4 Z"
        />
      </svg>
      <div className="absolute inset-x-0 top-[13px] flex items-center gap-1.5 px-3 sm:px-5">
        <Scissors
          className="size-3.5 shrink-0 -rotate-[18deg] text-[var(--color-bg)]"
          strokeWidth={2.2}
        />
        <span className="h-px flex-1 border-t border-dashed border-[var(--color-bg)] opacity-70" />
      </div>
    </div>
  );
}
