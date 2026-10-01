# Publishing to the Play Store and Apple App Store

This app uses native modules (AdMob, in-app purchases), so it **cannot run in
Expo Go**. You build it with **EAS Build** (cloud) and submit with **EAS
Submit**. You do not need a Mac for the iOS build — EAS builds in the cloud.

## 0. Prerequisites
- Node 18+ and the Expo CLI: `npm install -g eas-cli`
- A **Google Play Developer** account (one-time \$25) — <https://play.google.com/console>
- An **Apple Developer** account (\$99/year) — <https://developer.apple.com>
- Run `npm install` in this repo.

## 1. One-time project setup
```bash
eas login
eas init            # creates the EAS project; copy the projectId into app.config.ts (extra.eas.projectId)
```
Set your real identifiers in `app.config.ts`:
- `ios.bundleIdentifier` and `android.package` (e.g. `com.yourcompany.encrypted`)
- Your AdMob **App IDs** (`ANDROID_ADMOB_APP_ID`, `IOS_ADMOB_APP_ID` envs)

Store the AdMob **unit IDs** and bundle ids as EAS secrets:
```bash
eas secret:create --name ANDROID_ADMOB_APP_ID --value ca-app-pub-xxx~yyy
eas secret:create --name IOS_ADMOB_APP_ID     --value ca-app-pub-xxx~yyy
# ...and the per-unit AD UNIT envs referenced in src/monetization/products.ts
```

## 2. Create the apps in each store
- **Play Console:** create the app, then set up the products in *Monetize*
  (see `docs/MONETIZATION.md`). Create a Service Account JSON for `eas submit`
  and save it as `service-account.json` (git-ignored).
- **App Store Connect:** create the app, fill `eas.json` → `submit.production.ios`
  with your `appleId`, `ascAppId`, `appleTeamId`. Create your IAPs there too.

## 3. Build
```bash
npm run build:android     # eas build -p android --profile production  → .aab
npm run build:ios         # eas build -p ios --profile production      → .ipa
```
EAS handles signing (keystore / provisioning) for you.

## 4. Submit
```bash
npm run submit:android    # uploads the .aab to Play (internal track)
npm run submit:ios        # uploads the build to App Store Connect / TestFlight
```

## 5. Before you hit "Release"
- **Privacy policy URL** — required by both stores (mandatory because you use
  ads + collect an advertising identifier). Fill the **Data Safety** form
  (Google) and **App Privacy** labels (Apple): declare AdMob data collection.
- **App Tracking Transparency (iOS):** the `NSUserTrackingUsageDescription`
  string is already set in `app.config.ts`; AdMob shows the ATT prompt.
- **Content rating** questionnaire (both stores).
- **Test IAPs** with a sandbox/license tester before release.
- **Screenshots + listing** for each platform.
- Roll out to an **internal/closed test track first**, then production.

## Updating later
- JS-only changes can ship instantly via EAS Update (OTA); native/config changes
  need a new build + store review.
