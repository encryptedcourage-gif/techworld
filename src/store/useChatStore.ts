import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import {
  loadOrCreateIdentity,
  open,
  seal,
  type KeyPair,
} from '@/crypto/e2ee';
import { api, getAuthToken } from '@/api/client';
import { WS_URL } from '@/api/config';

/**
 * Chat state backed by the real server.
 *
 * - Identity keys come from the device keychain (src/crypto/e2ee.ts).
 * - Outgoing messages are sealed for the peer and POSTed; we keep the plaintext
 *   locally because NaCl box cannot decrypt our own outgoing ciphertext.
 * - Incoming messages arrive live over a WebSocket, or are fetched from the
 *   server mailbox on startup, then decrypted locally.
 * - History is cached in AsyncStorage so it survives restarts.
 */

export interface Message {
  id: string;
  chatId: string; // peer user id
  mine: boolean;
  text: string;
  sentAt: number;
}

export interface Chat {
  peerId: string;
  peerUsername: string;
  peerPublicKey: string;
  messages: Message[];
}

interface WireMessage {
  id: string;
  senderId: string;
  senderUsername: string;
  senderPublicKey: string;
  ciphertext: string;
  nonce: string;
  sentAt: string;
}

interface ChatState {
  ready: boolean;
  identity: KeyPair | null;
  chats: Chat[];
  socket: WebSocket | null;
  init: () => Promise<void>;
  startChat: (username: string) => Promise<string>;
  sendMessage: (peerId: string, text: string) => Promise<void>;
  getChat: (peerId: string) => Chat | undefined;
  reset: () => Promise<void>;
}

const STORAGE_KEY = 'chats.v1';

async function persist(chats: Chat[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    // Non-fatal: history re-syncs from the server mailbox.
  }
}

export const useChatStore = create<ChatState>((set, get) => {
  /** Upsert an incoming (decrypted) message into the right chat. */
  function ingest(wire: WireMessage): void {
    const { identity, chats } = get();
    if (!identity) return;

    const plaintext = open(
      { ciphertext: wire.ciphertext, nonce: wire.nonce },
      wire.senderPublicKey,
      identity.secretKey
    );
    if (plaintext === null) return; // couldn't decrypt — drop silently

    const message: Message = {
      id: wire.id,
      chatId: wire.senderId,
      mine: false,
      text: plaintext,
      sentAt: new Date(wire.sentAt).getTime(),
    };

    const existing = chats.find((c) => c.peerId === wire.senderId);
    let next: Chat[];
    if (existing) {
      if (existing.messages.some((m) => m.id === message.id)) return; // dedupe
      next = chats.map((c) =>
        c.peerId === wire.senderId
          ? {
              ...c,
              peerPublicKey: wire.senderPublicKey,
              messages: [...c.messages, message],
            }
          : c
      );
    } else {
      next = [
        {
          peerId: wire.senderId,
          peerUsername: wire.senderUsername,
          peerPublicKey: wire.senderPublicKey,
          messages: [message],
        },
        ...chats,
      ];
    }
    set({ chats: next });
    void persist(next);
  }

  function connectSocket(): void {
    const token = getAuthToken();
    if (!token) return;
    if (get().socket) return;

    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data));
        if (payload.type === 'message' && payload.message) {
          ingest(payload.message as WireMessage);
        }
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      set({ socket: null });
      // Reconnect if still authenticated.
      if (getAuthToken()) setTimeout(connectSocket, 3000);
    };
    ws.onerror = () => ws.close();
    set({ socket: ws });
  }

  return {
    ready: false,
    identity: null,
    chats: [],
    socket: null,

    init: async () => {
      const identity = await loadOrCreateIdentity();

      let chats: Chat[] = [];
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) chats = JSON.parse(raw) as Chat[];
      } catch {
        chats = [];
      }

      set({ identity, chats, ready: true });

      // Live socket + catch up on anything missed while offline.
      connectSocket();
      try {
        const { messages } = await api.get<{ messages: WireMessage[] }>(
          '/messages/pending'
        );
        messages.forEach(ingest);
      } catch {
        // Offline — we'll sync when the socket reconnects.
      }
    },

    startChat: async (username) => {
      const existing = get().chats.find(
        (c) => c.peerUsername.toLowerCase() === username.toLowerCase()
      );
      if (existing) return existing.peerId;

      const peer = await api.get<{
        id: string;
        username: string;
        publicKey: string;
      }>(`/users/${encodeURIComponent(username)}`);

      const chat: Chat = {
        peerId: peer.id,
        peerUsername: peer.username,
        peerPublicKey: peer.publicKey,
        messages: [],
      };
      const next = [chat, ...get().chats];
      set({ chats: next });
      void persist(next);
      return peer.id;
    },

    sendMessage: async (peerId, text) => {
      const { identity, chats } = get();
      const body = text.trim();
      if (!identity || !body) return;
      const chat = chats.find((c) => c.peerId === peerId);
      if (!chat) return;

      const sealed = seal(body, chat.peerPublicKey, identity.secretKey);

      // Optimistically add to the UI with a temporary id.
      const tempId = `local_${Date.now()}`;
      const optimistic: Message = {
        id: tempId,
        chatId: peerId,
        mine: true,
        text: body,
        sentAt: Date.now(),
      };
      const withOptimistic = chats.map((c) =>
        c.peerId === peerId ? { ...c, messages: [...c.messages, optimistic] } : c
      );
      set({ chats: withOptimistic });

      try {
        const res = await api.post<{ id: string; sentAt: string }>('/messages', {
          recipientId: peerId,
          ciphertext: sealed.ciphertext,
          nonce: sealed.nonce,
        });
        // Replace temp id with the server id.
        const confirmed = get().chats.map((c) =>
          c.peerId === peerId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === tempId ? { ...m, id: res.id } : m
                ),
              }
            : c
        );
        set({ chats: confirmed });
        void persist(confirmed);
      } catch {
        // Keep the optimistic message; a resend/queue could be added later.
        void persist(get().chats);
      }
    },

    getChat: (peerId) => get().chats.find((c) => c.peerId === peerId),

    reset: async () => {
      get().socket?.close();
      set({ chats: [], socket: null, ready: false });
      await AsyncStorage.removeItem(STORAGE_KEY);
    },
  };
});
