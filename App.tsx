import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { theme } from '@/theme';
import { RootNavigator } from '@/navigation/RootNavigator';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useEntitlements } from '@/monetization/entitlements';
import { initAds, preloadInterstitial } from '@/monetization/ads';
import {
  initIAP,
  restorePurchases,
  syncEntitlementsFromServer,
  teardownIAP,
} from '@/monetization/iap';
import { registerForPush } from '@/push/notifications';

/**
 * App entry point. Boots the subsystems in order:
 *   1. local entitlements + auth session (so gating + routing are correct)
 *   2. monetization (ads + in-app purchases)
 *   3. once authenticated: chat (encryption keys, live socket), push,
 *      and server-side entitlement sync.
 */
export default function App() {
  const authLoading = useAuthStore((s) => s.loading);
  const restoreAuth = useAuthStore((s) => s.restore);
  const token = useAuthStore((s) => s.token);

  const hydrateEntitlements = useEntitlements((s) => s.hydrate);
  const entitlementsHydrated = useEntitlements((s) => s.hydrated);
  const initChat = useChatStore((s) => s.init);
  const chatReady = useChatStore((s) => s.ready);

  const sessionStarted = useRef(false);

  // One-time startup: local state + monetization.
  useEffect(() => {
    void hydrateEntitlements();
    void restoreAuth();

    (async () => {
      try {
        await initAds();
        preloadInterstitial();
      } catch (err) {
        console.warn('[app] ad init failed', err);
      }
      try {
        await initIAP();
      } catch (err) {
        console.warn('[app] iap init failed', err);
      }
    })();

    return () => {
      void teardownIAP();
    };
  }, [hydrateEntitlements, restoreAuth]);

  // When the user becomes authenticated, start the per-session subsystems once.
  useEffect(() => {
    if (!token || sessionStarted.current) return;
    sessionStarted.current = true;

    (async () => {
      await initChat();
      await registerForPush(true);
      await syncEntitlementsFromServer();
      await restorePurchases().catch(() => undefined);
    })();
  }, [token, initChat]);

  // Reset the session guard on logout so a re-login re-initializes.
  useEffect(() => {
    if (!token) sessionStarted.current = false;
  }, [token]);

  const booted = !authLoading && entitlementsHydrated && (!token || chatReady);

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
