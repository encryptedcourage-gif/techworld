# How the app earns money for you (the admin)

This app has **four** revenue streams built in. Money is collected by Google and
Apple and paid into **your** accounts — you never handle users' card details.

| Stream | Technology | Who pays you | Where to configure |
| --- | --- | --- | --- |
| In-app ads | Google AdMob | Google (per impression/click) | AdMob console |
| Subscriptions (Pro) | Play Billing / StoreKit | Google / Apple (recurring) | Play Console / App Store Connect |
| One-time purchases | Play Billing / StoreKit | Google / Apple (once) | Play Console / App Store Connect |
| Feature unlocks | Play Billing / StoreKit | Google / Apple (once) | Play Console / App Store Connect |

> **Store cut:** Apple and Google take ~15–30% of in-app purchase revenue
> (15% for most small developers / the first \$1M, and for subscriptions after
> year one). AdMob pays you ~68% of ad revenue. The rest is the platform fee.

---

## 1. In-app ads (AdMob) — passive income

Ads run automatically while people use the app. No user action needed.

**Where they appear in this codebase:**
- **Banner** — bottom of the chat list (`src/components/AdBanner.tsx`, shown in
  `ChatListScreen`). Earns on every view.
- **Interstitial** — full-screen, shown when leaving a chat
  (`src/screens/ChatRoomScreen.tsx` → `showInterstitial()`).
- **Rewarded** — user watches an ad to unlock premium themes for 24h
  (`StoreScreen` → `showRewardedForFeature()`). You earn; they get value free.

**Setup:**
1. Create a free account at <https://admob.google.com>.
2. Add two apps (one Android, one iOS). Copy each **App ID**
   (`ca-app-pub-XXXX~YYYY`).
3. Create ad **units** (banner, interstitial, rewarded) for each app and copy
   their **unit IDs** (`ca-app-pub-XXXX/ZZZZ`).
4. Put them in your environment / build secrets (see `app.config.ts` and
   `src/monetization/products.ts` — the `AD_UNITS` and App ID env vars).
5. Add a **payment profile** in AdMob (bank + tax info). You get paid monthly
   once you pass the payout threshold (\$100).

> ⚠️ The repo ships with Google's **official test IDs** so you can develop
> safely. **Never click your own live ads** — that gets your AdMob account
> banned. Switch to real IDs only in your production build.

---

## 2, 3, 4. In-app purchases (subscriptions, one-time, feature unlocks)

All three are the same billing plumbing — only the product *type* differs. The
catalog lives in **one file**: `src/monetization/products.ts`. Whatever you put
there must match the products you create in the stores **by exact SKU**.

Current SKUs:

- **Subscriptions:** `pro_monthly`, `pro_yearly`
- **One-time:** `theme_pack_premium`, `remove_ads_forever`
- **Feature unlocks:** `unlock_broadcast`, `unlock_large_groups`,
  `unlock_large_uploads`

### Google Play setup
1. Play Console → your app → **Monetize**.
2. **Subscriptions** → create `pro_monthly`, `pro_yearly` with base plans/prices.
3. **In-app products** → create each one-time / unlock SKU with a price.
4. **Setup → Payments profile**: add bank + tax details. This is who gets paid.
5. Add testers under **License testing** to buy without being charged.

### Apple App Store setup
1. App Store Connect → your app → **In-App Purchases** and **Subscriptions**.
2. Create matching products using the **same SKUs** as above.
3. **Agreements, Tax, and Banking** → sign the Paid Apps agreement and add bank
   details. Purchases won't work until this is "Active".
4. Create a **Sandbox tester** to test purchases for free.

### How a purchase flows through the code
1. `StoreScreen` shows the catalog with localized prices from the store.
2. User taps buy → `buyProduct()` / `buySubscription()` (`src/monetization/iap.ts`).
3. Store shows its native payment sheet and charges the user.
4. `purchaseUpdatedListener` fires → we grant the entitlement
   (`src/monetization/entitlements.ts`) and `finishTransaction()`.
5. Gated UI (ads, features) reacts instantly via `hasFeature(...)`.
6. **Restore purchases** re-syncs owned items on a new device (required by both
   stores).

---

## Verify on your server (do this before you scale)

The on-device entitlement cache is for **fast UI only**. A tampered client
could fake it. Before honoring anything that costs *you* money to serve (large
uploads, server features), validate the receipt server-side:

- **Apple:** App Store Server API / `verifyReceipt` →
  <https://developer.apple.com/documentation/appstoreserverapi>
- **Google:** Play Developer API `purchases.subscriptions`/`products.get` →
  <https://developers.google.com/android-publisher>

Wire this into `verifyPurchase()` in `src/monetization/iap.ts` (it's a single
function, intentionally isolated). Also use **Real-time Developer
Notifications** (Google) and **App Store Server Notifications** (Apple) to track
renewals, refunds, and cancellations.

---

## Pricing tips to maximize revenue
- Make **Yearly** ~2 months cheaper than 12× monthly — most Pro revenue comes
  from annual plans.
- Offer a **free trial** on `pro_monthly` to lift conversion.
- Keep core messaging free (that's your growth engine); charge for *power-user*
  features and *removing ads*.
- Let heavy ad-avoiders buy **Remove Ads Forever** — you capture users who would
  never subscribe.
