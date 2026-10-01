import { create } from 'zustand';
import { loadOrCreateIdentity, open, seal, type KeyPair } from '@/crypto/e2ee';

/**
 * Chat state.
 *
 * This is a local, demo-grade store that keeps conversations in memory and
 * seeds a couple of sample chats so the UI is explorable without a backend.
 * In production you would:
 *   - publish your public key to a key-directory server,
 *   - relay sealed messages through a transport (WebSocket / push),
 *   - persist history encrypted-at-rest on device.
 * The encryption layer in src/crypto/e2ee.ts is already production-shaped.
 */

export interface Message {
  id: string;
  chatId: string;
  mine: boolean;
  text: string;
  sentAt: number;
}

export interface Chat {
  id: string;
  name: string;
  /** base64 public key of the peer (demo: a generated contact key). */
  peerPublicKey: string;
  avatarColor: string;
  messages: Message[];
}

interface ChatState {
  ready: boolean;
  identity: KeyPair | null;
  chats: Chat[];
  init: () => Promise<void>;
  sendMessage: (chatId: string, text: string) => void;
  getChat: (chatId: string) => Chat | undefined;
}

const PALETTE = ['#00A884', '#6A5ACD', '#E0794B', '#4FA8E0', '#C0617D'];

export const useChatStore = create<ChatState>((set, get) => ({
  ready: false,
  identity: null,
  chats: [],

  init: async () => {
    if (get().ready) return;
    const identity = await loadOrCreateIdentity();

    // Seed demo contacts so the chat list isn't empty on first run.
    const seeded: Chat[] = ['Ada', 'Grace', 'Alan'].map((name, i) => ({
      id: `chat_${i}`,
      name,
      peerPublicKey: identity.publicKey, // demo loopback key
      avatarColor: PALETTE[i % PALETTE.length],
      messages: [
        {
          id: `m_${i}_0`,
          chatId: `chat_${i}`,
          mine: false,
          text: `Hey! This chat is end-to-end encrypted 🔒`,
          sentAt: Date.now() - (i + 1) * 60000,
        },
      ],
    }));

    set({ identity, chats: seeded, ready: true });
  },

  sendMessage: (chatId, text) => {
    const { identity, chats } = get();
    if (!identity || !text.trim()) return;
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return;

    // Demonstrate real sealing/opening round-trip for the sent message.
    const sealed = seal(text.trim(), chat.peerPublicKey, identity.secretKey);
    const roundTripped =
      open(sealed, identity.publicKey, identity.secretKey) ?? text.trim();

    const message: Message = {
      id: `m_${chatId}_${chat.messages.length}`,
      chatId,
      mine: true,
      text: roundTripped,
      sentAt: Date.now(),
    };

    set({
      chats: chats.map((c) =>
        c.id === chatId ? { ...c, messages: [...c.messages, message] } : c
      ),
    });
  },

  getChat: (chatId) => get().chats.find((c) => c.id === chatId),
}));
