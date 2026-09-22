# Maker

NxN pixel drawer with a shared board.

## Auth

Email verification and passkey registration redirect straight to Maker. Users can register passkeys at `/auth/passkeys`. Email remains available for recovery. No password or email allowlist.

Sessions use SameSite=Lax to support return visits from other sites. A same-origin `/auth/session` probe restores older Strict cookies. After a successful passkey registration/sign-in, a local browser hint enables an automatic passkey prompt when the session expires. Browsers without the hint offer conditional passkey autofill in the email field. The hint never grants access; all assertions still require server verification and device approval. Explicit sign-out suppresses automatic prompts on the resulting login page; cancelling a prompt leaves email/manual sign-in available.

Uses `@simplewebauthn/server`, following rubrot's options/verify flow. Passkeys belong to individual users. Sessions last 30 days; email links last 15 minutes; WebAuthn challenges last 5 minutes. Links and challenges are single-use. Email links require a confirmation POST so inbox scanners cannot consume them.

The Bun auth proxy protects Next.js, including assets and API routes. On Railway, `src/railway.ts` starts Next.js on loopback and exposes only the auth proxy on `PORT`. The auth proxy overwrites `X-Maker-User-Email` with the verified email; Next.js uses that header for publishing credit. Never expose Next.js directly.

The board stays shared across users. New icons show a muted one-line publisher credit on the thumbnail and a full credit above the canvas when selected, aligned with Add to board on desktop. Duplicate grids keep the first publisher's credit. Older icons remain unattributed. The board database adds a nullable `creator_email` column on startup.

Server-only environment:

```
RESEND_API_KEY=...
RESEND_SENDER_EMAIL=maker@rubric.email
PUBLIC_ORIGIN=https://maker.rubric.sh
AUTH_DATABASE_PATH=/data/auth-final.sqlite
DATABASE_PATH=/data/board-final.sqlite
PORT=8080
```

Production: the `maker` project in Railway's Rubric Labs workspace deploys `RubricLab/maker` main as one service with a persistent volume at `/data` and one replica. Until Railway accepts the custom domain, `maker.rubric.sh` points to the old dev box only for Caddy to proxy HTTPS to `maker-production-7cc6.up.railway.app`. The old app services are stopped; the old databases and `/root/maker-migration` snapshots remain there for rollback. Do not remove the Caddy route or change DNS until Railway's custom domain is working. For local development, start Next.js with `PORT=8840 bun --bun run start`, then `bun run auth` with `PUBLIC_ORIGIN=http://localhost:8841`. Access via localhost, which browsers allow for WebAuthn. Preserve both SQLite databases (use SQLite `.backup` while running). Database files and env values must stay private. Passkeys are scoped to `maker.rubric.sh` and cannot be used on other domains.

## Checks

`bun test` covers email signup, expiration/replay, CSRF, access control, rate limits, user isolation, and a browser round trip using Chromium's virtual WebAuthn authenticator. Install the browser with `bun --bun x playwright install chromium` if needed.

`bun x tsc --noEmit` and `bun --bun run build` check the app. After building, `bun tests/verify-board.ts` checks publishing, attribution, redirects, and mobile layout against Next.js with isolated databases, and saves screenshots in the system temp directory.
