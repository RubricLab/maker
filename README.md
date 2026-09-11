# Maker

NxN pixel drawer with a shared board.

## Auth

Email verification and passkey registration redirect straight to Maker. Users can register passkeys at `/auth/passkeys`, also linked from the board's Account link. Email remains available for recovery. No password or email allowlist.

Uses `@simplewebauthn/server`, following rubrot's options/verify flow. Passkeys belong to individual users. Sessions last 30 days; email links last 15 minutes; WebAuthn challenges last 5 minutes. Links and challenges are single-use. Email links require a confirmation POST so inbox scanners cannot consume them.

The Bun auth proxy protects Next.js, including assets and API routes. Bind both servers to loopback and route public traffic through the auth proxy. Caddy must overwrite `X-Real-IP`. The auth proxy overwrites `X-Maker-User-Email` with the verified email; Next.js uses that header for publishing credit. Never expose Next.js directly.

The board stays shared across users. New icons show their publisher's email on the thumbnail and above the canvas when selected. Duplicate grids keep the first publisher's credit. Older icons remain unattributed. The board database adds a nullable `creator_email` column on startup.

Server-only environment:

```
RESEND_API_KEY=...
RESEND_SENDER_EMAIL=maker@rubric.email
PUBLIC_ORIGIN=https://maker.rubric.sh
AUTH_DATABASE_PATH=/var/lib/maker/auth/auth.sqlite
AUTH_PORT=8841
UPSTREAM_ORIGIN=http://127.0.0.1:8840
```

Start Next.js with `PORT=8840 bun --bun run start`, then `bun run auth`. For local development, set `PUBLIC_ORIGIN=http://localhost:8841`. Access via localhost, which browsers allow for WebAuthn. Preserve the auth SQLite database (including its WAL when backing up a running process), separate from the board database. Database files and the env file must stay private.

Production: `/srv/demos/maker`; services `demo-maker` and `demo-maker-auth`; env `/etc/maker-auth.env`. Passkeys are scoped to `maker.rubric.sh` and cannot be used on other domains.

## Checks

`bun test` covers email signup, expiration/replay, CSRF, access control, rate limits, user isolation, and a browser round trip using Chromium's virtual WebAuthn authenticator. Install the browser with `bun --bun x playwright install chromium` if needed.

`bun x tsc --noEmit` and `bun --bun run build` check the app. After building, `bun tests/verify-board.ts` checks publishing, attribution, redirects, and mobile layout against Next.js with isolated databases, and saves screenshots in the system temp directory.
