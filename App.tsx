import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { theme } from '@/theme';
import { RootNavigator } from '@/navigation/RootNavigator';
import { useChatStore } from '@/store/useChatStore';
import { useEntitlements } from '@/monetization/entitlements';
import { initAds, preloadInterstitial } from '@/monetization/ads';
import { initIAP, restorePurchases, teardownIAP } from '@/monetization/iap';

/**
 * App entry point. Boots the three subsystems the product depends on:
 *   1. identity + chat state (end-to-end encryption keys)
 *   2. entitlements (what the user has paid for)
 *   3. monetization (ads + in-app purchases)
 */
export default function App() {
  const [booted, setBooted] = useState(false);
  const initChat = useChatStore((s) => s.init);
  const hydrateEntitlements = useEntitlements((s) => s.hydrate);

  useEffect(() => {
    let mounted = true;

    (async () => {
      // 1 + 2: local state first so the UI can render correct gating instantly.
      await Promise.all([initChat(), hydrateEntitlements()]);
      if (mounted) setBooted(true);

      // 3: monetization can initialize in the background.
      try {
        await initAds();
        preloadInterstitial();
      } catch (err) {
        console.warn('[app] ad init failed', err);
      }
      try {
        await initIAP();
        // Reconcile owned products with the store (e.g. after reinstall).
        await restorePurchases();
      } catch (err) {
        console.warn('[app] iap init failed', err);
      }
    })();

    return () => {
      mounted = false;
      void teardownIAP();
    };
  }, [initChat, hydrateEntitlements]);

  if (!booted) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}
