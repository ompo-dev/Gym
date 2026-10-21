import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { connectionSchema, type AgentConnection } from '@/core/connect/protocol';

const KEY = 'gymnotes.agent-connection.v1';
let generation = 0;
let storageWrite = Promise.resolve();
const persist = (write: () => Promise<void>) => {
  storageWrite = storageWrite.catch(() => {}).then(write);
  return storageWrite;
};
type Status = 'offline' | 'connecting' | 'connected' | 'error';
interface State {
  connection: AgentConnection | null;
  status: Status;
  authenticating: boolean;
  setAuthenticating: (value: boolean) => void;
  hydrate: () => Promise<void>;
  configure: (connection: AgentConnection) => Promise<void>;
  disconnect: () => Promise<void>;
  setStatus: (status: Status) => void;
}

// Browser credentials are session-only, never written into localStorage.
export const useAgentConnectionStore = create<State>((set) => ({
  connection: null,
  status: 'offline',
  authenticating: false,
  setAuthenticating: (authenticating) => set({ authenticating }),
  hydrate: async () => {
    if (Platform.OS === 'web') return;
    const current = generation;
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      if (raw && current === generation) set({ connection: connectionSchema.parse(JSON.parse(raw)) });
    } catch { if (current === generation) set({ connection: null, status: 'error' }); }
  },
  configure: async (connection) => {
    const parsed = connectionSchema.parse(connection);
    const current = ++generation;
    if (Platform.OS !== 'web') await persist(() => SecureStore.setItemAsync(KEY, JSON.stringify(parsed)));
    if (current === generation) set({ connection: parsed, status: 'connecting' });
  },
  disconnect: async () => {
    generation += 1;
    set({ connection: null, status: 'offline', authenticating: false });
    if (Platform.OS !== 'web') await persist(() => SecureStore.deleteItemAsync(KEY));
  },
  setStatus: (status) => set({ status }),
}));
