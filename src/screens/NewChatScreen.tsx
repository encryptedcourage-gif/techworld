import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '@/theme';
import { useChatStore } from '@/store/useChatStore';
import { ApiError } from '@/api/client';
import type { RootStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function NewChatScreen() {
  const navigation = useNavigation<Nav>();
  const startChat = useChatStore((s) => s.startChat);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onStart = async () => {
    const name = username.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const peerId = await startChat(name);
      navigation.replace('ChatRoom', { chatId: peerId, title: name });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? 'No user with that username.'
          : 'Could not start chat. Check your connection.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Start a new encrypted chat</Text>
      <Text style={styles.hint}>Enter the username of the person to message.</Text>
      <TextInput
        style={styles.input}
        placeholder="username"
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
        onSubmitEditing={onStart}
        returnKeyType="go"
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.btn} disabled={busy} onPress={onStart}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Start chat</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing(2.5) },
  label: { color: theme.colors.text, fontSize: 18, fontWeight: '700' },
  hint: { color: theme.colors.textMuted, marginTop: 6, marginBottom: 20 },
  input: {
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing(2),
    paddingVertical: theme.spacing(1.5),
    fontSize: 16,
  },
  error: { color: theme.colors.danger, marginTop: 12 },
  btn: {
    marginTop: 20,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing(1.75),
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
