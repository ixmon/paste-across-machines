# Paste — cut and paste across machines

Temporary rooms for moving text and files between computers.

- Three-word room codes (share the words or a link)
- Normal or Vim editor
- Save notes as files; upload/download under 100 MB
- Autosave, light/dark/system themes
- Everything expires after 24 hours (or sooner if disk is full)

## Quick start

```bash
npm install
npm run dev
```

App serves at `http://localhost:8080`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server on `0.0.0.0:8080` |
| `npm run build` | Production build (Vercel / Nitro) |
| `npm run typecheck` | TypeScript check |
| `npm run preview` | Serve production build |

## Notes

Room data is stored under `data/pastes/` on the server filesystem. On serverless hosts the disk is ephemeral — fine for demos, not for durable multi-region storage. For production at scale, swap the store for object storage (S3/R2/Blob) or a database.

## License

MIT
