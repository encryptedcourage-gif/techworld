import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { api, setAuthToken } from '@/api/client';
import { loadOrCreateIdentity } from '@/crypto/e2ee';

/**
 * Authentication state. On register/login the device publishes its public key
 * so peers can encrypt to it. The JWT is persisted in the OS keychain.
 */

const TOKEN_KEY = 'auth.token';

export interface AuthUser {
  id: string;
  username: string;
  publicKey: string;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

interface AuthState {
  loading: boolean;
  token: string | null;
  user: AuthUser | null;
  /** Restore a saved session on app start. */
  restore: () => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  loading: true,
  token: null,
  user: null,

  restore: async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (token) {
        setAuthToken(token);
        // Validate the key is still correct for this device.
        const identity = await loadOrCreateIdentity();
        await api.put('/users/me/key', { publicKey: identity.publicKey }).catch(
          () => undefined
        );
        set({ token, user: null });
      }
    } finally {
      set({ loading: false });
    }
  },

  register: async (username, password) => {
    const identity = await loadOrCreateIdentity();
    const res = await api.post<AuthResponse>('/auth/register', {
      username,
      password,
      publicKey: identity.publicKey,
    });
    await SecureStore.setItemAsync(TOKEN_KEY, res.token);
    setAuthToken(res.token);
    set({ token: res.token, user: res.user });
  },

  login: async (username, password) => {
    const identity = await loadOrCreateIdentity();
    const res = await api.post<AuthResponse>('/auth/login', {
      username,
      password,
      publicKey: identity.publicKey,
    });
    await SecureStore.setItemAsync(TOKEN_KEY, res.token);
    setAuthToken(res.token);
    set({ token: res.token, user: res.user });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setAuthToken(null);
    set({ token: null, user: null });
  },
}));
