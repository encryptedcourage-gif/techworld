import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Product, Subscription } from 'react-native-iap';
import { theme } from '@/theme';
import {
  FEATURE_UNLOCKS,
  ONE_TIME,
  SUBSCRIPTIONS,
  type ProductDef,
} from '@/monetization/products';
import {
  buyProduct,
  buySubscription,
  loadCatalog,
  restorePurchases,
} from '@/monetization/iap';
import { showRewardedForFeature } from '@/monetization/ads';
import { useEntitlements } from '@/monetization/entitlements';

/** Look up a localized store price, falling back to a placeholder. */
function priceFor(
  def: ProductDef,
  catalog: { subscriptions: Subscription[]; products: Product[] }
): string {
  if (def.type === 'subs') {
    const sub = catalog.subscriptions.find((s) => s.productId === def.sku);
    // @ts-expect-error localizedPrice exists on both platform shapes at runtime
    return sub?.localizedPrice ?? '—';
  }
  const p = catalog.products.find((x) => x.productId === def.sku);
  return p?.localizedPrice ?? '—';
}

export function StoreScreen() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<{
    subscriptions: Subscription[];
    products: Product[];
  }>({ subscriptions: [], products: [] });

  const ownedSkus = useEntitlements((s) => s.ownedSkus);
  const isPro = useEntitlements((s) => s.isPro());

  useEffect(() => {
    let active = true;
    loadCatalog()
      .then((c) => active && setCatalog(c))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const owned = useMemo(() => new Set(ownedSkus), [ownedSkus]);

  const handleBuy = async (def: ProductDef) => {
    try {
      setBusy(def.sku);
      if (def.type === 'subs') {
        const sub = catalog.subscriptions.find((s) => s.productId === def.sku);
        await buySubscription(def.sku, sub);
      } else {
        await buyProduct(def.sku);
      }
    } catch (err) {
      Alert.alert('Purchase failed', String((err as Error)?.message ?? err));
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    try {
      setBusy('restore');
      const restored = await restorePurchases();
      Alert.alert(
        'Restore complete',
        restored.length
          ? `Restored ${restored.length} purchase(s).`
          : 'No previous purchases found.'
      );
    } finally {
      setBusy(null);
    }
  };

  const handleWatchAd = async () => {
    setBusy('reward');
    const earned = await showRewardedForFeature('premium_themes');
    setBusy(null);
    Alert.alert(
      earned ? 'Unlocked!' : 'Not unlocked',
      earned
        ? 'Premium themes unlocked for 24 hours. Thanks for watching!'
        : 'Reward not granted. Please try again.'
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  const renderProduct = (def: ProductDef) => {
    const isOwned = owned.has(def.sku) || (def.type === 'subs' && isPro);
    return (
      <View key={def.sku} style={styles.card}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{def.title}</Text>
          <Text style={styles.cardDesc}>{def.description}</Text>
        </View>
        {isOwned ? (
          <View style={[styles.buyBtn, styles.owned]}>
            <Text style={styles.ownedText}>Owned</Text>
          </View>
        ) : (
          <Pressable
            style={styles.buyBtn}
            disabled={busy === def.sku}
            onPress={() => handleBuy(def)}
          >
            <Text style={styles.buyText}>
              {busy === def.sku ? '…' : priceFor(def, catalog)}
            </Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Go Pro 🔒</Text>
        <Text style={styles.heroSub}>
          Support the app, remove ads, and unlock everything.
        </Text>
      </View>

      <Text style={styles.section}>Subscriptions</Text>
      {SUBSCRIPTIONS.map(renderProduct)}

      <Text style={styles.section}>One-time purchases</Text>
      {ONE_TIME.map(renderProduct)}

      <Text style={styles.section}>Unlock features</Text>
      {FEATURE_UNLOCKS.map(renderProduct)}

      <Text style={styles.section}>Free unlock</Text>
      <Pressable
        style={styles.rewardBtn}
        disabled={busy === 'reward'}
        onPress={handleWatchAd}
      >
        <Text style={styles.rewardText}>
          {busy === 'reward' ? 'Loading ad…' : '▶  Watch an ad — themes for 24h'}
        </Text>
      </Pressable>

      <Pressable
        style={styles.restoreBtn}
        disabled={busy === 'restore'}
        onPress={handleRestore}
      >
        <Text style={styles.restoreText}>
          {busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(2), paddingBottom: theme.spacing(6) },
  center: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.lg,
    padding: theme.spacing(2.5),
    marginBottom: theme.spacing(2),
  },
  heroTitle: { color: theme.colors.gold, fontSize: 24, fontWeight: '800' },
  heroSub: { color: theme.colors.textMuted, marginTop: 6, fontSize: 14 },
  section: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing(1.75),
    marginBottom: theme.spacing(1),
  },
  cardTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '600' },
  cardDesc: { color: theme.colors.textMuted, fontSize: 13, marginTop: 3 },
  buyBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing(2),
    paddingVertical: theme.spacing(1),
    marginLeft: theme.spacing(1),
    minWidth: 72,
    alignItems: 'center',
  },
  buyText: { color: '#fff', fontWeight: '700' },
  owned: { backgroundColor: theme.colors.surfaceAlt },
  ownedText: { color: theme.colors.primary, fontWeight: '700' },
  rewardBtn: {
    borderWidth: 1,
    borderColor: theme.colors.gold,
    borderRadius: theme.radius.md,
    padding: theme.spacing(1.75),
    alignItems: 'center',
  },
  rewardText: { color: theme.colors.gold, fontWeight: '700' },
  restoreBtn: { padding: theme.spacing(2), alignItems: 'center' },
  restoreText: { color: theme.colors.textMuted, fontWeight: '600' },
});
