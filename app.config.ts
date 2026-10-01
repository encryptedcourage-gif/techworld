import type { ExpoConfig } from 'expo/config';

/**
 * App configuration.
 *
 * The AdMob App IDs below are Google's official SAMPLE/TEST IDs. Replace them
 * with your own AdMob App IDs (one per platform) before you ship — that is the
 * account that gets paid. See docs/MONETIZATION.md.
 */
const ANDROID_ADMOB_APP_ID =
  process.env.ANDROID_ADMOB_APP_ID ?? 'ca-app-pub-3940256099942544~3347511713';
const IOS_ADMOB_APP_ID =
  process.env.IOS_ADMOB_APP_ID ?? 'ca-app-pub-3940256099942544~1458002511';

const config: ExpoConfig = {
  name: 'Encrypted',
  slug: 'encrypted',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'encrypted',
  userInterfaceStyle: 'automatic',
  splash: {
    resizeMode: 'contain',
    backgroundColor: '#0B141A',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.yourcompany.encrypted',
    config: {
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      // Required by Apple when using AdMob / tracking.
      NSUserTrackingUsageDescription:
        'This identifier will be used to deliver personalized ads to you.',
    },
  },
  android: {
    package: 'com.yourcompany.encrypted',
    adaptiveIcon: {
      backgroundColor: '#0B141A',
    },
    permissions: ['com.android.vending.BILLING'],
  },
  plugins: [
    [
      'react-native-google-mobile-ads',
      {
        androidAppId: ANDROID_ADMOB_APP_ID,
        iosAppId: IOS_ADMOB_APP_ID,
        userTrackingUsageDescription:
          'This identifier will be used to deliver personalized ads to you.',
      },
    ],
    'expo-secure-store',
  ],
  extra: {
    eas: {
      // Replace with your EAS project id after running `eas init`.
      projectId: process.env.EAS_PROJECT_ID ?? '',
    },
  },
};

export default config;
