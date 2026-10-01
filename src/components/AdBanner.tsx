import React from 'react';
import { View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { AD_UNITS } from '@/monetization/products';
import { useEntitlements } from '@/monetization/entitlements';

/**
 * Banner ad. Renders nothing for ad-free (Pro / "remove ads") users, so the
 * paywall and the ads stay consistent automatically.
 */
export function AdBanner() {
  const hasNoAds = useEntitlements((s) => s.hasFeature('no_ads'));
  // Re-render when temporary grants change too.
  const temporary = useEntitlements((s) => s.temporaryGrants);
  void temporary;

  if (hasNoAds) return null;

  return (
    <View style={{ alignItems: 'center' }}>
      <BannerAd
        unitId={AD_UNITS.banner}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: false }}
      />
    </View>
  );
}
