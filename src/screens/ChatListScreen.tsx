import React from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '@/theme';
import { useChatStore, type Chat } from '@/store/useChatStore';
import { AdBanner } from '@/components/AdBanner';
import type { RootStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const PALETTE = ['#00A884', '#6A5ACD', '#E0794B', '#4FA8E0', '#C0617D'];

function colorFor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

function ChatRow({ chat, onPress }: { chat: Chat; onPress: () => void }) {
  const last = chat.messages[chat.messages.length - 1];
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.avatar, { backgroundColor: colorFor(chat.peerUsername) }]}>
        <Text style={styles.avatarText}>
          {chat.peerUsername[0]?.toUpperCase() ?? '?'}
        </Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.name}>{chat.peerUsername}</Text>
        <Text style={styles.preview} numberOfLines={1}>
          {last ? last.text : 'Say hi 👋'}
        </Text>
      </View>
    </Pressable>
  );
}

export function ChatListScreen() {
  const navigation = useNavigation<Nav>();
  const chats = useChatStore((s) => s.chats);

  return (
    <View style={styles.container}>
      {chats.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No chats yet</Text>
          <Text style={styles.emptyText}>
            Tap the button below to start an encrypted chat.
          </Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(c) => c.peerId}
          renderItem={({ item }) => (
            <ChatRow
              chat={item}
              onPress={() =>
                navigation.navigate('ChatRoom', {
                  chatId: item.peerId,
                  title: item.peerUsername,
                })
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}

      <Pressable
        style={styles.fab}
        onPress={() => navigation.navigate('NewChat')}
      >
        <Text style={styles.fabText}>＋</Text>
      </Pressable>

      {/* Banner ad at the bottom of the chat list — earns on every view. */}
      <AdBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '700' },
  emptyText: {
    color: theme.colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing(2),
    paddingVertical: theme.spacing(1.5),
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  rowBody: { flex: 1, marginLeft: theme.spacing(1.5) },
  name: { color: theme.colors.text, fontSize: 16, fontWeight: '600' },
  preview: { color: theme.colors.textMuted, fontSize: 14, marginTop: 2 },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginLeft: 80,
  },
  fab: {
    position: 'absolute',
    right: theme.spacing(2.5),
    bottom: theme.spacing(8),
    width: 60,
    height: 60,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 30, lineHeight: 34, fontWeight: '600' },
});
