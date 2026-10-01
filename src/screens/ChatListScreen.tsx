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

function ChatRow({ chat, onPress }: { chat: Chat; onPress: () => void }) {
  const last = chat.messages[chat.messages.length - 1];
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.avatar, { backgroundColor: chat.avatarColor }]}>
        <Text style={styles.avatarText}>{chat.name[0]}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.name}>{chat.name}</Text>
        <Text style={styles.preview} numberOfLines={1}>
          {last ? last.text : 'No messages yet'}
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
      <FlatList
        data={chats}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <ChatRow
            chat={item}
            onPress={() =>
              navigation.navigate('ChatRoom', {
                chatId: item.id,
                title: item.name,
              })
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />
      {/* Banner ad at the bottom of the chat list — earns on every view. */}
      <AdBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
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
});
