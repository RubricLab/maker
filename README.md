# Maker

NxN pixel drawer with a shared board.

## Moderation

Anyone can publish. Each icon is rendered to a PNG and checked by OpenAI's `gpt-6-sol` before it reaches the public board; the prompt in `src/lib/moderation.ts` says what gets hidden. A hidden icon still shows for its author and keeps its share link, it just never appears on the board. The check fails closed, a near-copy of a hidden icon is hidden without another look, duplicate grids reuse the first verdict, and `bun run moderate` hides any visible icon the check now flags. `tests/moderation-eval.ts` scores a held-out set against the real API.

Server-only environment:

```
OPENAI_API_KEY=...
DATABASE_URL=postgres://maker:...@127.0.0.1:5432/maker
PUBLIC_ORIGIN=https://maker.rubric.sh
```

Use a local Postgres database for development. `DATABASE_URL` is required at runtime. Keep database credentials private.

## Production

`maker.rubric.sh` runs on OVH Beauharnois (`ssh den`, `51.222.6.120`) since 21 Oct 2026. The `maker` systemd service runs as user `maker` from `/srv/demos/maker/app`, using Bun and Next.js on `127.0.0.1:8821`. Caddy serves HTTPS through `/etc/caddy/demos/maker.caddy`.

Postgres runs locally, with database and role `maker` and new credentials in `/etc/maker.env` (`root:maker`, mode `640`). The app needs only its database URL, public origin and OpenAI moderation key. The auth database, Resend and `TYPESAFE_API_KEY` are no longer used.

Deploy `RubricLab/maker` main manually over SSH. Install the frozen Bun lockfile, build with `/usr/local/bin/bun node_modules/next/dist/bin/next build`, then restart `maker`. Set `PATH=/srv/demos/maker/bin:/usr/local/bin:/usr/bin:/bin` for builds: the local `node` shim points to Bun for Next's child processes. Back up Postgres before deploying; never reimport the retired SQLite database over current data.

The migration dump and data hashes are root-only in `/srv/demos/maker/backups`. All 53 creations, flags, undo tokens, the ID sequence and Snake score were verified at cutover. The Railway project was force-deleted on 21 Oct 2026, skipping its recovery window. Do not redeploy there.

For local development, set `DATABASE_URL` and run `bun run dev`, or `bun --bun run build` then `PORT=8840 bun --bun run start`.

## Checks

`bun test` covers Postgres, the SQLite import, the API, and moderation with a stubbed API. Use a local `maker_test` database on port 55432. `bun x tsc --noEmit` and `bun --bun run build` check the app. After building, `bun tests/verify-board.ts` checks publishing in a browser with an isolated database and a stub moderation API.
