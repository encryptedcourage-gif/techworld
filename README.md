# Encrypted 🔒

An end-to-end encrypted messenger (WhatsApp / Telegram style) built with
**React Native + Expo**, with a complete **monetization layer** so the app
owner earns money while people use the app — ready for the **Google Play Store**
and **Apple App Store**.

## What's inside

**Messenger**
- End-to-end encryption with NaCl box (X25519 + XSalsa20-Poly1305) —
  `src/crypto/e2ee.ts`. Device keys are stored in the OS keychain/keystore.
- Chat list, chat rooms, message bubbles, settings with a key fingerprint.
- Dark, WhatsApp-inspired theme.

**Monetization (4 revenue streams for the admin)**
1. **In-app ads** (Google AdMob): banner, interstitial, and rewarded ads —
   `src/monetization/ads.ts`, `src/components/AdBanner.tsx`.
2. **Subscriptions** (Pro monthly/yearly).
3. **One-time purchases** (theme pack, remove ads forever).
4. **Paid feature unlocks** (broadcast channels, large groups, large uploads).

   2–4 share one billing layer via `react-native-iap` — `src/monetization/iap.ts`,
   with a single product catalog in `src/monetization/products.ts` and a central
   entitlements store in `src/monetization/entitlements.ts`.

👉 **How you actually get paid:** [`docs/MONETIZATION.md`](docs/MONETIZATION.md)
👉 **How to ship to the stores:** [`docs/PUBLISHING.md`](docs/PUBLISHING.md)

## Project layout
```
App.tsx                      app entry — boots encryption, entitlements, ads, IAP
app.config.ts                Expo config (AdMob App IDs, bundle ids, plugins)
eas.json                     EAS build & submit profiles
src/
  crypto/e2ee.ts             end-to-end encryption primitives
  monetization/
    products.ts              product catalog + AdMob unit IDs (single source of truth)
    entitlements.ts          what the user has paid for (gates the UI)
    ads.ts                   AdMob init, interstitial, rewarded
    iap.ts                   Play Billing / StoreKit purchases + restore
  store/useChatStore.ts      chat state (demo-seeded, encryption-shaped)
  components/AdBanner.tsx     banner ad (hidden for ad-free users)
  navigation/                stack + tabs (Chats / Store / Settings)
  screens/                   ChatList, ChatRoom, Store (paywall), Settings
  theme/                     colors & spacing
```

## Run it

> Native modules (ads + IAP) mean this needs a **dev build**, not Expo Go.

```bash
npm install
npm run typecheck            # verify TypeScript
npx expo prebuild            # generate native projects
npm run android              # or: npm run ios   (needs a device/emulator)
```

The chat list is seeded with demo contacts so you can explore immediately.
Ads use Google's **test IDs** out of the box — swap in your real IDs before
release (see `docs/MONETIZATION.md`).

## Important notes
- Replace all placeholder IDs (`com.yourcompany.encrypted`, AdMob test IDs,
  `YOUR_APPLE_*` in `eas.json`) with your own before shipping.
- For production, validate purchases **server-side** — see the "Verify on your
  server" section in `docs/MONETIZATION.md`. The hook is `verifyPurchase()` in
  `src/monetization/iap.ts`.
- Never commit store credentials (`service-account.json`, keystores, `.p8`
  keys) — they're already in `.gitignore`.
