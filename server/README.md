# Encrypted — Backend

Node + TypeScript + Express + PostgreSQL + WebSocket. Provides auth, a public-key
directory, an end-to-end-encrypted message relay (store-and-forward + live
delivery), push notifications, and server-side purchase verification.

The server **never sees plaintext** — it stores and relays ciphertext only.

## Run locally (Docker — easiest)

```bash
cd server
cp .env.example .env            # edit JWT_SECRET at minimum
docker compose up --build
```
This starts PostgreSQL and the server on <http://localhost:8080>. The schema is
applied automatically on startup.

## Run locally (without Docker)

```bash
cd server
cp .env.example .env            # point DATABASE_URL at your Postgres
npm install
npm run dev                     # hot-reloading dev server
```

## Scripts
- `npm run dev` — dev server (tsx watch)
- `npm run build` — compile to `dist/`
- `npm start` — run the compiled server
- `npm run typecheck` — TypeScript check

## Environment
See `.env.example`. Required: `DATABASE_URL`, `JWT_SECRET`. Purchase
verification (`GOOGLE_SERVICE_ACCOUNT_JSON`, `APPLE_SHARED_SECRET`,
`ANDROID_PACKAGE`) is optional until you take real payments — without it the
server runs in DEV purchase mode (trusts the client, logs a warning).

## API

All authed routes need `Authorization: Bearer <token>`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | – | Liveness check |
| POST | `/auth/register` | – | Create account `{username,password,publicKey}` → `{token,user}` |
| POST | `/auth/login` | – | Log in `{username,password,publicKey?}` → `{token,user}` |
| GET | `/users/:username` | ✓ | Look up a user's id + public key |
| PUT | `/users/me/key` | ✓ | Update your published public key |
| PUT | `/users/me/push-token` | ✓ | Register your Expo push token |
| POST | `/messages` | ✓ | Send `{recipientId,ciphertext,nonce}` |
| GET | `/messages/pending` | ✓ | Fetch + ack undelivered messages |
| POST | `/purchases/verify` | ✓ | Verify `{platform,sku,token}` → entitlements |
| GET | `/purchases/entitlements` | ✓ | Your active entitlements |
| WS | `/ws?token=JWT` | ✓ | Live message delivery (`{type:'message',message}`) |

## Architecture notes
- The WebSocket hub (`src/realtime/hub.ts`) is in-memory. For more than one
  server instance, swap it for Redis pub/sub so every instance can reach every
  socket.
- Messages are deleted-on-delivery only logically (marked `delivered`); add a
  retention/cleanup job if you want to purge old rows.
- Purchase verification is isolated in `src/purchases/` — Google via the Android
  Publisher API, Apple via receipt validation.
