import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';
import { useEntitlements } from '@/monetization/entitlements';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
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
  const resetChats = useChatStore((s) => s.reset);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isPro = useEntitlements((s) => s.isPro());

  const onLogout = () => {
    Alert.alert('Log out?', 'You can log back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await resetChats();
          await logout();
        },
      },
    ]);
  };
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
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.value}>{user?.username ?? '—'}</Text>
      </View>

      <View style={[styles.block, { marginTop: theme.spacing(1) }]}>
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

      <Pressable style={styles.logout} onPress={onLogout}>
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
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
  logout: {
    marginTop: theme.spacing(3),
    borderWidth: 1,
    borderColor: theme.colors.danger,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(1.75),
    alignItems: 'center',
  },
  logoutText: { color: theme.colors.danger, fontWeight: '700', fontSize: 16 },
});
