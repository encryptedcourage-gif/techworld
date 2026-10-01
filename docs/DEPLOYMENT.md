# Bringing the app live — end to end

This is the full path from the code in this repo to a working app on the stores,
with a real backend. Do the phases in order.

```
┌─────────────┐     HTTPS / WSS      ┌──────────────┐
│  Mobile app │ ──────────────────▶ │   Backend    │ ──▶ PostgreSQL
│ (Play/Apple)│ ◀────────────────── │ (your server)│
└─────────────┘   live messages     └──────────────┘
      │                                     │
      │ AdMob (ads)                         ├─▶ Expo push service
      └─ Play Billing / StoreKit            └─▶ Google/Apple purchase verify
```

---

## Phase 1 — Deploy the backend

The backend is a Docker container + a PostgreSQL database. Any host works; the
quickest managed options:

### Option A — Render (simple, free tier to start)
1. Push this repo to GitHub (already done).
2. In Render: **New → Blueprint** or **New → Web Service**, point it at the repo,
   root directory `server`, environment **Docker**.
3. **New → PostgreSQL** to create a database; copy its **Internal Database URL**.
4. Set the web service env vars:
   - `DATABASE_URL` = the Postgres URL from step 3
   - `JWT_SECRET` = a long random string
     (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - (later) `ANDROID_PACKAGE`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `APPLE_SHARED_SECRET`
5. Deploy. Your API is now at `https://your-service.onrender.com`.
6. Verify: open `https://your-service.onrender.com/health` → `{"ok":true}`.

### Option B — Railway / Fly.io / a VPS
- **Railway:** add a PostgreSQL plugin, deploy the `server` folder, set the same
  env vars.
- **VPS (any Linux box):** install Docker, clone the repo, `cd server`, create
  `.env`, run `docker compose up -d --build`. Put Nginx/Caddy in front for HTTPS.

> HTTPS is required — both AdMob and the stores need a secure origin, and the
> WebSocket must be `wss://`.

---

## Phase 2 — Point the app at your backend

Rebuild the app with your server URL baked in:

```bash
# in the repo root
eas secret:create --name EXPO_PUBLIC_API_URL --value https://your-service.onrender.com
```
(The app reads `EXPO_PUBLIC_API_URL`; see `src/api/config.ts`. The WebSocket URL
is derived automatically.)

For local testing before deploying, run the server locally and set the URL to
your machine's LAN IP (e.g. `http://192.168.1.20:8080`) — `localhost` won't work
from a phone.

---

## Phase 3 — Store setup (accounts, products, payouts)

Follow **`docs/MONETIZATION.md`** and **`docs/PUBLISHING.md`**:
- AdMob account + ad unit IDs + payment profile (ads income).
- Play Console + App Store Connect apps, in-app products/subscriptions matching
  the SKUs in `src/monetization/products.ts`, and bank/tax details (purchase
  income).
- Replace all placeholder IDs (`com.yourcompany.encrypted`, AdMob test IDs,
  `YOUR_APPLE_*` in `eas.json`).

---

## Phase 4 — Turn on real purchase verification

Once your products exist:
1. **Google:** create a service account in Google Cloud, grant it access in Play
   Console → *Users and permissions*, download its JSON key, and set it as the
   backend's `GOOGLE_SERVICE_ACCOUNT_JSON` (plus `ANDROID_PACKAGE`).
2. **Apple:** App Store Connect → *App Information → App-Specific Shared Secret*,
   set it as the backend's `APPLE_SHARED_SECRET`.
3. Redeploy the backend. It now validates every purchase against the stores
   before granting paid features. (Until you set these, it runs in DEV mode and
   trusts the client — fine for testing, not for real money.)

---

## Phase 5 — Build, test, submit

```bash
npm run build:android && npm run build:ios      # EAS cloud builds
# test with a Play license tester / Apple sandbox tester
npm run submit:android && npm run submit:ios     # upload to the stores
```
Then in each store console: fill the privacy/data-safety forms (declare AdMob),
add screenshots + listing, roll out to an internal test track, then production.

---

## Phase 6 — Operate
- **Monitor:** watch the backend logs and `/health`. Add uptime monitoring.
- **Scale:** if you run more than one backend instance, switch the WebSocket hub
  (`server/src/realtime/hub.ts`) to Redis pub/sub so sockets fan out across
  instances.
- **Back up:** enable automated PostgreSQL backups on your host.
- **Renewals/refunds:** wire Google Real-time Developer Notifications and Apple
  App Store Server Notifications to keep entitlements in sync over time.

---

## Checklist

- [ ] Backend deployed, `/health` returns ok, HTTPS enabled
- [ ] PostgreSQL provisioned + backups on
- [ ] `JWT_SECRET` set to a strong random value
- [ ] `EXPO_PUBLIC_API_URL` points at the deployed backend
- [ ] Bundle IDs / package names set (and reserved in both stores)
- [ ] AdMob real IDs + payment profile
- [ ] In-app products/subscriptions created with matching SKUs
- [ ] Bank/tax details active in Play Console + App Store Connect
- [ ] Purchase verification creds set, backend redeployed
- [ ] Privacy policy URL + data-safety/privacy forms completed
- [ ] Tested register → chat → purchase on real devices
- [ ] Submitted to internal track, then production
