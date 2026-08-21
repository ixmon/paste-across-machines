import { useMemo, useState } from "react";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createMcpTokenFn, revokeMcpTokenFn } from "@/lib/paste.functions";
import type { McpTokenMeta } from "@/lib/paste-types";

type Revealed = { id: string; token: string };

type McpPanelProps = {
  publicId: string;
  initial: McpTokenMeta[];
};

function formatWhen(ts: number | null): string {
  if (!ts) return "never used";
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return `${hours}h ago`;
}

export function McpPanel({ publicId, initial }: McpPanelProps) {
  const [tokens, setTokens] = useState(initial);
  const [label, setLabel] = useState("voice grok");
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const mcpUrl = `${origin}/mcp`;

  const copy = async (text: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(ok);
    } catch {
      toast.message(text);
    }
  };

  const mint = async () => {
    setBusy(true);
    try {
      const res = await createMcpTokenFn({ data: { publicId, label } });
      setTokens((list) => [res.meta, ...list]);
      setRevealed({ id: res.meta.id, token: res.token });
      toast.success("Bearer shown once — paste it into Grok now");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create token");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    try {
      await revokeMcpTokenFn({ data: { publicId, tokenId: id } });
      setTokens((list) => list.filter((t) => t.id !== id));
      setRevealed((cur) => (cur?.id === id ? null : cur));
      toast.success("Access revoked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  };

  const grokBlurb = useMemo(
    () =>
      `Grok → Connectors → Custom → ${mcpUrl || "/mcp"}
Grok will ask for OAuth. If it does not fill itself:
  Client ID: paste
  Secret: (empty)
  Authorization: ${origin}/oauth/authorize
  Token: ${origin}/oauth/token
  Token auth: none (PKCE)
Then Allow with this room’s three words.`,
    [mcpUrl, origin],
  );

  return (
    <div className="border-t border-[var(--color-border)] p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-fg)]">
        <KeyRound className="size-3.5" aria-hidden />
        MCP access
      </p>
      <p className="mt-1 text-[0.6875rem] leading-relaxed text-[var(--color-fg-muted)]">
        Off until a bearer exists. Add the MCP URL in Grok; it should open our Allow page
        (three words + tag). Manual bearers still work for CLI. Same key reads and writes.
        Revoke anytime.
      </p>

      <p className="mt-2 font-mono text-[0.6875rem] break-all text-[var(--color-fg-subtle)]">
        {mcpUrl || "/mcp"}
        <button
          type="button"
          className="ml-2 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
          onClick={() => void copy(mcpUrl, "MCP URL copied")}
        >
          Copy URL
        </button>
      </p>

      {revealed && (
        <div className="mt-2 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-bg)] p-2">
          <p className="text-[0.6875rem] font-medium text-[var(--color-fg)]">
            Bearer — shown once
          </p>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[0.625rem] text-[var(--color-fg-muted)]">
            {revealed.token}
          </pre>
          <div className="mt-1.5 flex gap-2">
            <Button
              size="sm"
              className="h-7 text-[0.6875rem]"
              onClick={() => void copy(revealed.token, "Bearer copied")}
            >
              <Copy className="size-3" />
              Copy bearer
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[0.6875rem]"
              onClick={() => void copy(`${mcpUrl}\n${revealed.token}`, "URL + bearer copied")}
            >
              Copy both
            </Button>
          </div>
          <p className="mt-1.5 whitespace-pre-line text-[0.625rem] leading-relaxed text-[var(--color-fg-subtle)]">
            {grokBlurb}
          </p>
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="tag — voice grok"
          className="h-8 font-mono text-xs"
          aria-label="Token tag"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void mint();
            }
          }}
        />
        <Button size="sm" className="h-8 shrink-0" disabled={busy} onClick={() => void mint()}>
          <Plus className="size-3.5" />
          {tokens.length === 0 ? "Enable" : "Add"}
        </Button>
      </div>

      {tokens.length === 0 ? (
        <p className="mt-2 text-[0.6875rem] text-[var(--color-fg-subtle)]">No tokens. MCP is off.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {tokens.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.6875rem] font-medium text-[var(--color-fg)]">
                  {t.label}
                </p>
                <p className="text-[0.625rem] text-[var(--color-fg-subtle)]">
                  {formatWhen(t.lastUsedAt)}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 px-0 text-[var(--color-fg-muted)] hover:bg-[var(--color-danger)] hover:text-[var(--color-danger-fg)]"
                title="Revoke"
                disabled={busy}
                onClick={() => void revoke(t.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
