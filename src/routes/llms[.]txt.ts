import { createFileRoute } from "@tanstack/react-router";

const BODY = `# Paste — cut and paste across machines

Temporary rooms identified by three dictionary words.
Human UI: /s/{w1}-{w2}-{w3}
Do not put secrets or long-lived credentials in a room. TTL is 24 hours.

## Machine twin (preferred for agents)

Read note:
  GET /s/{id}.txt                 text/plain
  GET /api/paste/{id}             application/json
      { publicId, words, content, files, createdAt, expiresAt }

Create room (no overwrite if it exists):
  POST /api/paste/{id}

Replace whole note (creates if missing):
  PUT /api/paste/{id}
      Content-Type: text/plain
      or JSON { "content": "..." }

Append (default for agents — do not PUT unless replacing on purpose):
  POST /api/paste/{id}/append
      Content-Type: text/plain
      --data-binary $'## From <name> <ISO-8601>\\n...\\n'

Files:
  GET  /api/paste/{id}/files
  POST /api/paste/{id}/files          multipart field "file"  (max 100 MB)
  GET  /api/paste/{id}/files/{fileId}

GET never creates a room. Unknown id → 404.
Invalid three-word codes → 400.
Aggressive polling → 429.

MCP (opt-in, bearer required for read and write):
  POST /mcp     JSON-RPC  Streamable HTTP
  OAuth PKCE: /.well-known/oauth-protected-resource
              /oauth/authorize  /oauth/token  client_id=paste
  Tools: room_info, note_get, note_append, note_put, files_list
  Pairing: Allow page + three-word code mints a tagged bearer.

## Convention

If the note starts with "# AGENT", follow it.
Append under a new heading: ## From <your name> <ISO-8601>
Do not delete existing sections.
`;

export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: async () =>
        new Response(BODY, {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=300",
          },
        }),
    },
  },
});
