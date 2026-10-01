import React, { useLayoutEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { theme } from '@/theme';
import { useChatStore, type Message } from '@/store/useChatStore';
import { showInterstitial } from '@/monetization/ads';
import { useEntitlements } from '@/monetization/entitlements';
import type { RootStackParamList } from '@/navigation/types';

type Route = RouteProp<RootStackParamList, 'ChatRoom'>;

function Bubble({ message }: { message: Message }) {
  return (
    <View
      style={[
        styles.bubble,
        message.mine ? styles.bubbleOut : styles.bubbleIn,
      ]}
    >
      <Text style={styles.bubbleText}>{message.text}</Text>
    </View>
  );
}

export function ChatRoomScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation();
  const { chatId, title } = route.params;
  const chat = useChatStore((s) => s.getChat(chatId));
  const sendMessage = useChatStore((s) => s.sendMessage);
  const hasNoAds = useEntitlements((s) => s.hasFeature('no_ads'));
  const [draft, setDraft] = useState('');

  useLayoutEffect(() => {
    navigation.setOptions({ title });
    // Show a full-screen interstitial when the user leaves the chat — a
    // natural break that doesn't interrupt the conversation.
    return () => {
      if (!hasNoAds) showInterstitial();
    };
  }, [navigation, title, hasNoAds]);

  const onSend = () => {
    sendMessage(chatId, draft);
    setDraft('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        data={chat?.messages ?? []}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <Bubble message={item} />}
        contentContainerStyle={styles.list}
      />
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Encrypted message"
          placeholderTextColor={theme.colors.textMuted}
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        <Pressable style={styles.sendBtn} onPress={onSend}>
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  list: { padding: theme.spacing(1.5) },
  bubble: {
    maxWidth: '80%',
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing(1.5),
    paddingVertical: theme.spacing(1),
    marginVertical: 3,
  },
  bubbleOut: { alignSelf: 'flex-end', backgroundColor: theme.colors.bubbleOut },
  bubbleIn: { alignSelf: 'flex-start', backgroundColor: theme.colors.bubbleIn },
  bubbleText: { color: theme.colors.text, fontSize: 15 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: theme.spacing(1),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  input: {
    flex: 1,
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing(1.5),
    paddingVertical: theme.spacing(1),
    maxHeight: 120,
  },
  sendBtn: {
    marginLeft: theme.spacing(1),
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing(2),
    paddingVertical: theme.spacing(1.25),
  },
  sendText: { color: '#fff', fontWeight: '700' },
});
