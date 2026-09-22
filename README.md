# Maker

NxN pixel drawer with a shared board.

## Moderation

Anyone can publish. Before an icon is saved, the server asks Jev (TypeSafe's classifier) one yes/no question: does the drawing form the same picture as one of the offensive references? Jev cannot see a shape in a text grid on its own, so the request explains how the editor renders the grid, sends the drawing as rows of `#` and `.`, and includes a gallery of 21 reference drawings of what the board refuses, made the same way at several resolutions, plus a heart, a letter, and a tree for contrast. The answer is averaged over the drawing's four rotations, and anything scoring 0.45 or above is hidden.

`tests/moderation-eval.ts` scores the held-out drawings in `tests/drawings.ts` against the real API and is where that threshold comes from. At 0.45 it hides every offensive drawing and 5 of the 55 harmless ones (a cactus, a hashtag, a sword, a candle, and a key). The threshold errs toward hiding because a hidden icon costs its author nothing.

Flagged icons are saved with `hidden = 1`: the publisher still sees the icon in their session and keeps the share link, but it never appears on the public board. Moderation fails closed: a missing key or a failed request hides the icon and logs the reason. Duplicate grids reuse the first verdict.

`bun run moderate` re-checks every icon in the database and updates the flag. Run it once after deploying (icons published earlier default to visible) or after an outage.

Server-only environment:

```
TYPESAFE_API_KEY=...
DATABASE_PATH=/data/board-final.sqlite
```

Locally the database defaults to `data/maker.sqlite`. Keep database files and env values private.

## Production

The `maker` project in Railway's Rubric Labs workspace deploys `RubricLab/maker` main as one service from the Dockerfile, with a persistent volume at `/data` and one replica. Next.js listens on Railway's `PORT`. Until Railway accepts the custom domain, `maker.rubric.sh` points to the old dev box only for Caddy to proxy HTTPS to `maker-production-7cc6.up.railway.app`; the old app services there are stopped, and the old databases and `/root/maker-migration` snapshots remain for rollback. Do not remove the Caddy route or change DNS until Railway's custom domain is working. The auth database and the Resend variables are no longer used. To score icons published before moderation, run `railway ssh -- bun run moderate` once. Preserve the board database (use SQLite `.backup` while running).

For local development, `bun run dev`, or `bun --bun run build` then `PORT=8840 bun --bun run start`.

## Checks

`bun test` covers the board database, the migration, the API, the request Jev receives, and the fail-closed paths, all with a stubbed API. `bun x tsc --noEmit` and `bun --bun run build` check the app. After building, `bun tests/verify-board.ts` publishes a shown and a hidden icon through a real browser against Next.js with an isolated database and a stub Jev, and saves screenshots in the system temp directory. Install the browser with `bun --bun x playwright install chromium` if needed.

