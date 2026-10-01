# Encrypted 🔒

An end-to-end encrypted messenger (WhatsApp / Telegram style) built with
**React Native + Expo** and a **Node/PostgreSQL backend**, with a complete
**monetization layer** so the app owner earns money while people use the app —
ready for the **Google Play Store** and **Apple App Store**.

This is a full stack: a mobile app (`/`) and a server (`/server`) that real
users register against and exchange encrypted messages through.

## What's inside

**Messenger (real, networked)**
- End-to-end encryption with NaCl box (X25519 + XSalsa20-Poly1305) —
  `src/crypto/e2ee.ts`. Device keys are stored in the OS keychain/keystore and
  the server only ever relays ciphertext.
- Accounts (register / login), a public-key directory, start a chat by username.
- Live delivery over WebSocket + offline store-and-forward mailbox.
- Push notifications for new messages (Expo push).
- Chat list, chat rooms, settings with a key fingerprint, logout.
- Dark, WhatsApp-inspired theme.

**Backend** (`server/`) — Node + Express + PostgreSQL + WebSocket
- Auth (JWT + bcrypt), key directory, message relay, push, and **server-side
  purchase verification** (Google Play + Apple). Dockerized. See
  [`server/README.md`](server/README.md).

**Monetization (4 revenue streams for the admin)**
1. **In-app ads** (Google AdMob): banner, interstitial, and rewarded ads —
   `src/monetization/ads.ts`, `src/components/AdBanner.tsx`.
2. **Subscriptions** (Pro monthly/yearly).
3. **One-time purchases** (theme pack, remove ads forever).
4. **Paid feature unlocks** (broadcast channels, large groups, large uploads).

   2–4 share one billing layer via `react-native-iap` — `src/monetization/iap.ts`,
   with a single product catalog in `src/monetization/products.ts` and a central
   entitlements store in `src/monetization/entitlements.ts`.

👉 **Bring the whole thing live (backend + app):** [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
👉 **How you actually get paid:** [`docs/MONETIZATION.md`](docs/MONETIZATION.md)
👉 **How to ship to the stores:** [`docs/PUBLISHING.md`](docs/PUBLISHING.md)
👉 **Backend run + API reference:** [`server/README.md`](server/README.md)

## Project layout
```
App.tsx                      app entry — auth, chat, entitlements, ads, IAP, push
app.config.ts                Expo config (AdMob App IDs, bundle ids, plugins)
eas.json                     EAS build & submit profiles
src/
  api/                       REST client + server URL config
  crypto/e2ee.ts             end-to-end encryption primitives
  push/notifications.ts      Expo push registration
  monetization/
    products.ts              product catalog + AdMob unit IDs (single source of truth)
    entitlements.ts          what the user has paid for (gates the UI)
    ads.ts                   AdMob init, interstitial, rewarded
    iap.ts                   purchases + restore + server verification/sync
  store/
    useAuthStore.ts          register / login / session
    useChatStore.ts          chats, live socket, send/receive, persistence
  components/AdBanner.tsx     banner ad (hidden for ad-free users)
  navigation/                auth-gated stack + tabs (Chats / Store / Settings)
  screens/                   Auth, ChatList, ChatRoom, NewChat, Store, Settings
  theme/                     colors & spacing

server/                      backend (Node + Express + PostgreSQL + WebSocket)
  src/                       auth, routes, realtime, push, purchase verification
  db/schema.sql              database schema (auto-applied)
  Dockerfile, docker-compose.yml
```

## Run it

### 1. Start the backend
```bash
cd server
cp .env.example .env         # set JWT_SECRET
docker compose up --build    # Postgres + API at http://localhost:8080
```

### 2. Run the app (needs a **dev build**, not Expo Go — native ads + IAP)
```bash
npm install
npm run typecheck            # verify TypeScript
# point the app at your server (LAN IP for a physical device, 10.0.2.2 for Android emulator):
EXPO_PUBLIC_API_URL=http://10.0.2.2:8080 npx expo prebuild
EXPO_PUBLIC_API_URL=http://10.0.2.2:8080 npm run android   # or npm run ios
```

Register two accounts (two devices/emulators), start a chat by username, and
messages flow end-to-end encrypted. Ads use Google's **test IDs** out of the box
— swap in your real IDs before release (see `docs/MONETIZATION.md`).

## Important notes
- Replace all placeholder IDs (`com.yourcompany.encrypted`, AdMob test IDs,
  `YOUR_APPLE_*` in `eas.json`) with your own before shipping.
- For production, validate purchases **server-side** — see the "Verify on your
  server" section in `docs/MONETIZATION.md`. The hook is `verifyPurchase()` in
  `src/monetization/iap.ts`.
- Never commit store credentials (`service-account.json`, keystores, `.p8`
  keys) — they're already in `.gitignore`.
