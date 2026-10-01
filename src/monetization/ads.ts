import mobileAds, {
  AdEventType,
  InterstitialAd,
  MaxAdContentRating,
  RewardedAd,
  RewardedAdEventType,
} from 'react-native-google-mobile-ads';
import { AD_UNITS } from './products';
import { shouldShowAds, useEntitlements } from './entitlements';
import type { Feature } from './products';

/**
 * Ad manager (AdMob) — this is passive revenue for the app owner.
 *
 * - Banner ads are rendered by the <AdBanner /> component.
 * - Interstitials are full-screen ads shown at natural breaks (e.g. after
 *   leaving a chat). Pre-load them so they appear instantly.
 * - Rewarded ads let a user watch an ad to temporarily unlock a feature —
 *   you earn, the user gets value, nobody has to pay.
 *
 * Revenue lands in the AdMob account whose App ID is configured in
 * app.config.ts. See docs/MONETIZATION.md.
 */

let initialized = false;

/** Call once at app startup. */
export async function initAds(): Promise<void> {
  if (initialized) return;
  await mobileAds().setRequestConfiguration({
    maxAdContentRating: MaxAdContentRating.PG,
    tagForChildDirectedTreatment: false,
    tagForUnderAgeOfConsent: false,
  });
  await mobileAds().initialize();
  initialized = true;
}

// --- Interstitial ------------------------------------------------------------

let interstitial: InterstitialAd | null = null;
let interstitialLoaded = false;

export function preloadInterstitial(): void {
  if (!shouldShowAds()) return;
  interstitial = InterstitialAd.createForAdRequest(AD_UNITS.interstitial, {
    requestNonPersonalizedAdsOnly: false,
  });
  interstitialLoaded = false;

  const unsubLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
    interstitialLoaded = true;
  });
  const unsubClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
    unsubLoaded();
    unsubClosed();
    // Immediately queue the next one.
    preloadInterstitial();
  });

  interstitial.load();
}

/** Show the interstitial if one is ready and the user is not ad-free. */
export function showInterstitial(): void {
  if (!shouldShowAds()) return;
  if (interstitial && interstitialLoaded) {
    interstitial.show();
    interstitialLoaded = false;
  } else {
    // Not ready yet — make sure one is loading for next time.
    preloadInterstitial();
  }
}

// --- Rewarded ----------------------------------------------------------------

/**
 * Show a rewarded ad. Resolves `true` if the user earned the reward (watched
 * to the end), in which case `feature` is granted for `grantMs` milliseconds.
 */
export function showRewardedForFeature(
  feature: Feature,
  grantMs: number = 24 * 60 * 60 * 1000
): Promise<boolean> {
  return new Promise((resolve) => {
    const rewarded = RewardedAd.createForAdRequest(AD_UNITS.rewarded, {
      requestNonPersonalizedAdsOnly: false,
    });
    let earned = false;

    const unsubLoaded = rewarded.addAdEventListener(
      RewardedAdEventType.LOADED,
      () => rewarded.show()
    );
    const unsubEarned = rewarded.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => {
        earned = true;
      }
    );
    const unsubClosed = rewarded.addAdEventListener(AdEventType.CLOSED, () => {
      unsubLoaded();
      unsubEarned();
      unsubClosed();
      unsubError();
      if (earned) {
        void useEntitlements.getState().grantTemporary(feature, grantMs);
      }
      resolve(earned);
    });
    const unsubError = rewarded.addAdEventListener(AdEventType.ERROR, () => {
      unsubLoaded();
      unsubEarned();
      unsubClosed();
      unsubError();
      resolve(false);
    });

    rewarded.load();
  });
}

export { AD_UNITS };
