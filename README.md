# Paste — cut and paste across machines

Temporary rooms for moving text and files between computers.

- Three-word room codes (share the words or a link)
- Normal or Vim editor
- Save notes as files; upload/download under 100 MB
- Autosave, light/dark/system themes
- Everything expires after 24 hours (or sooner if storage is full)

## Quick start

```bash
npm install
npm run dev
```

App serves at `http://localhost:8080`.

## Storage

Rooms are stored in **Postgres** via `@/lib/db`:

- **Local preview** — embedded PGLite (automatic)
- **Deployed** — set `DATABASE_URL` to a Neon (or any Postgres) connection string

Schema lives in `migrations/0002_paste.sql` and is applied on build (`npm run build` → `db:migrate`) and on PGLite startup.

Filesystem under `data/` is no longer used.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server on `0.0.0.0:8080` |
| `npm run build` | Production build + migrations |
| `npm run typecheck` | TypeScript check |
| `npm run preview` | Serve production build |

## License

MIT
