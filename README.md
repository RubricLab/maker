# Maker

NxN pixel drawer with a shared board.

## Moderation

Anyone can publish. Each icon is rendered to a PNG and checked by OpenAI's `gpt-6-sol` before it reaches the public board; the prompt in `src/lib/moderation.ts` says what gets hidden. A hidden icon still shows for its author and keeps its share link, it just never appears on the board. The check fails closed, duplicate grids reuse the first verdict, and `bun run moderate` re-checks every icon. `tests/moderation-eval.ts` scores a held-out set against the real API.

Server-only environment:

```
OPENAI_API_KEY=...
DATABASE_PATH=/data/board-final.sqlite
```

Locally the database defaults to `data/maker.sqlite`. Keep database files and env values private.

## Production

The `maker` project in Railway's Rubric Labs workspace deploys `RubricLab/maker` main as one service from the Dockerfile, with a persistent volume at `/data` and one replica. Next.js listens on Railway's `PORT`. `maker.rubric.sh` points directly to Railway. The old devbox services, app, and Caddy route have been removed; historical database snapshots remain in `/root/maker-migration` and `/var/lib/maker`. The auth database, the Resend variables, and `TYPESAFE_API_KEY` are no longer used. To score icons published before moderation, run `railway ssh -- bun run moderate` once. Preserve the board database (use SQLite `.backup` while running).

For local development, `bun run dev`, or `bun --bun run build` then `PORT=8840 bun --bun run start`.

## Checks

`bun test` covers the board database, the migration, the API, and moderation with a stubbed API. `bun x tsc --noEmit` and `bun --bun run build` check the app. After building, `bun tests/verify-board.ts` publishes a shown and a hidden icon through a real browser against Next.js with an isolated database and a stub moderation API, and saves screenshots in the system temp directory. Install the browser with `bun --bun x playwright install chromium` if needed.
