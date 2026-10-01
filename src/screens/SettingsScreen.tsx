import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';
import { useEntitlements } from '@/monetization/entitlements';
import { useChatStore } from '@/store/useChatStore';
import type { Feature } from '@/monetization/products';

const FEATURE_LABELS: Record<Feature, string> = {
  no_ads: 'Ad-free',
  large_uploads: 'Large uploads (2 GB)',
  premium_themes: 'Premium themes',
  broadcast_channels: 'Broadcast channels',
  large_groups: 'Large groups',
};

export function SettingsScreen() {
  const identity = useChatStore((s) => s.identity);
  const isPro = useEntitlements((s) => s.isPro());
  const hasFeature = useEntitlements((s) => s.hasFeature);
  // Subscribe to changes so the list re-renders on new grants.
  useEntitlements((s) => s.ownedSkus);
  useEntitlements((s) => s.temporaryGrants);

  const fingerprint = identity
    ? identity.publicKey.slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
    : '…';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.block}>
        <Text style={styles.label}>Plan</Text>
        <Text style={styles.value}>{isPro ? 'Pro ✨' : 'Free'}</Text>
      </View>

      <Text style={styles.section}>Your unlocks</Text>
      {(Object.keys(FEATURE_LABELS) as Feature[]).map((f) => (
        <View key={f} style={styles.row}>
          <Text style={styles.rowLabel}>{FEATURE_LABELS[f]}</Text>
          <Text
            style={[
              styles.rowStatus,
              { color: hasFeature(f) ? theme.colors.primary : theme.colors.textMuted },
            ]}
          >
            {hasFeature(f) ? 'Unlocked' : 'Locked'}
          </Text>
        </View>
      ))}

      <Text style={styles.section}>Security</Text>
      <View style={styles.block}>
        <Text style={styles.label}>Your encryption key fingerprint</Text>
        <Text style={styles.mono}>{fingerprint}</Text>
        <Text style={styles.hint}>
          Messages are end-to-end encrypted with this device key. It never
          leaves your phone.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(2) },
  section: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: theme.spacing(2.5),
    marginBottom: theme.spacing(1),
  },
  block: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing(2),
  },
  label: { color: theme.colors.textMuted, fontSize: 13 },
  value: { color: theme.colors.text, fontSize: 18, fontWeight: '700', marginTop: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing(2),
    paddingVertical: theme.spacing(1.5),
    marginBottom: 6,
  },
  rowLabel: { color: theme.colors.text, fontSize: 15 },
  rowStatus: { fontWeight: '700' },
  mono: {
    color: theme.colors.text,
    fontFamily: 'monospace',
    fontSize: 16,
    marginTop: 6,
    letterSpacing: 1,
  },
  hint: { color: theme.colors.textMuted, fontSize: 12, marginTop: 8 },
});
