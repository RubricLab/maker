# Maker

NxN pixel drawer with a shared board.

## Moderation

Anyone can publish. Each icon is rendered to a PNG and checked by OpenAI's `gpt-6-sol` before it reaches the public board; the prompt in `src/lib/moderation.ts` says what gets hidden. A hidden icon still shows for its author and keeps its share link, it just never appears on the board. The check fails closed, a near-copy of a hidden icon is hidden without another look, duplicate grids reuse the first verdict, and `bun run moderate` hides any visible icon the check now flags. `tests/moderation-eval.ts` scores a held-out set against the real API.

Server-only environment:

```
OPENAI_API_KEY=...
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_PATH=/data/board-final.sqlite  # legacy import only
```

Use a local Postgres database for development. `DATABASE_URL` is required at runtime. Keep database credentials private.

## Production

The `maker` project in Railway's Rubric Labs workspace deploys `RubricLab/maker` main as one service from the Dockerfile, with Railway Postgres for board icons and the global Snake high score. Next.js listens on Railway's `PORT`. The old SQLite volume remains mounted for rollback. `src/migrate.ts` imports it idempotently at startup, preserving IDs, timestamps, hidden flags, and the high score; rerun it after the first cutover to catch writes made by the old instance while Railway switched traffic. `maker.rubric.sh` points directly to Railway. The old devbox services, app, and Caddy route have been removed; historical database snapshots remain in `/root/maker-migration` and `/var/lib/maker`. The auth database, the Resend variables, and `TYPESAFE_API_KEY` are no longer used. To rescore icons after an outage, run `railway ssh -- bun run moderate`. Keep `/data/board-pre-postgres.sqlite` as a rollback snapshot.

For local development, set `DATABASE_URL` and run `bun run dev`, or `bun --bun run build` then `PORT=8840 bun --bun run start`.

## Checks

`bun test` covers Postgres, the SQLite import, the API, and moderation with a stubbed API. Use a local `maker_test` database on port 55432. `bun x tsc --noEmit` and `bun --bun run build` check the app. After building, `bun tests/verify-board.ts` checks publishing in a browser with an isolated database and a stub moderation API.
