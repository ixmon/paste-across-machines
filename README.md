# Paste — cut and paste across machines

Temporary rooms for moving text and files between computers.

- Three-word room codes (share the words or a link)
- Normal or Vim editor
- Save notes as files; upload/download under 100 MB
- Autosave, light/dark/system themes
- Machine twin for agents: `.txt`, JSON, **append**
- Everything expires after 24 hours (or sooner if storage is full)

Three words are a doorbell, not a vault. Don’t put secrets in a room.

## Quick start

```bash
npm install
npm run dev
```

## Agent / curl API

`{id}` is `word-word-word` (see `/llms.txt`).

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/s/{id}.txt` | Note as `text/plain`. **404 if missing** (does not create). |
| GET | `/api/paste/{id}` | JSON `{ content, files, expiresAt, … }` |
| POST | `/api/paste/{id}` | Create empty room if missing; no overwrite |
| PUT | `/api/paste/{id}` | Replace full note (creates if missing) |
| POST | `/api/paste/{id}/append` | **Append** — default for agents |
| GET/POST | `/api/paste/{id}/files` | List / upload (`multipart file`, max 100 MB) |

```bash
ID=cedar-orbit-mimosa
curl -fsS -X POST "http://localhost:8080/api/paste/${ID}"
curl -fsS -X POST "http://localhost:8080/api/paste/${ID}/append" \
  -H 'Content-Type: text/plain' \
  --data-binary $'## From cli 2026-08-20T08:00:00Z\nhello\n'
curl -fsS "http://localhost:8080/s/${ID}.txt"
```

GET never creates a room. Unknown id → 404. Invalid codes → 400. Abuse → 429.

## Storage

Rooms are stored in **Postgres** via `@/lib/db`:

- **Local preview** — embedded PGLite (automatic)
- **Deployed** — set `DATABASE_URL` to a Neon (or any Postgres) connection string

Schema lives in `migrations/0002_paste.sql`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server on `0.0.0.0:8080` |
| `npm run build` | Production build + migrations |
| `npm run typecheck` | TypeScript check |
| `npm run preview` | Serve production build |

## License

MIT
