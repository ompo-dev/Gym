import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { connectionSchema, type AgentConnection } from '@/core/connect/protocol';
import { log } from '@/core/log';

const KEY = 'gymnotes.agent-connection.v1';
let generation = 0;
let storageWrite = Promise.resolve();
const persist = (write: () => Promise<void>) => {
  storageWrite = storageWrite.catch(() => {}).then(write);
  return storageWrite;
};
type Status = 'offline' | 'waiting' | 'connecting' | 'connected' | 'error';
export type ConnectionIssue = 'network' | 'wrongKey' | 'inUse' | 'invalidCode' | 'wrongInvite' | 'missingInvite' | 'upgradeRequired' | 'localPermission';
interface State {
  connection: AgentConnection | null;
  status: Status;
  issue: ConnectionIssue | null;
  authenticating: boolean;
  setAuthenticating: (value: boolean) => void;
  hydrate: () => Promise<void>;
  configure: (connection: AgentConnection) => Promise<void>;
  disconnect: () => Promise<void>;
  setStatus: (status: Status, issue?: ConnectionIssue) => void;
}

// Browser credentials are session-only, never written into localStorage.
export const useAgentConnectionStore = create<State>((set, get) => ({
  connection: null,
  status: 'offline',
  issue: null,
  authenticating: false,
  setAuthenticating: (authenticating) => set({ authenticating }),
  hydrate: async () => {
    if (Platform.OS === 'web' || get().connection) return;
    const current = generation;
    try {
      await storageWrite.catch(() => {});
      if (current !== generation || get().connection) return;
      const raw = await SecureStore.getItemAsync(KEY);
      if (raw && current === generation && !get().connection) set({ connection: connectionSchema.parse(JSON.parse(raw)) });
    } catch { if (current === generation && !get().connection) set({ status: 'error', issue: 'network' }); }
  },
  configure: async (connection) => {
    const parsed = connectionSchema.parse(connection);
    const current = ++generation;
    if (Platform.OS !== 'web') await persist(() => SecureStore.setItemAsync(KEY, JSON.stringify(parsed)));
    if (current === generation) {
      log.connect('peer.configure', { agent: parsed.agent ?? 'mcp', allowWrites: parsed.allowWrites });
      const before = get().connection;
      const samePeer = get().status === 'connected' && before?.url === parsed.url && before?.token === parsed.token && before?.allowWrites === parsed.allowWrites;
      set({ connection: parsed, ...(samePeer ? {} : { status: 'connecting' as const, issue: null }) });
    }
  },
  disconnect: async () => {
    log.connect('peer.disconnect');
    generation += 1;
    set({ connection: null, status: 'offline', issue: null, authenticating: false });
    if (Platform.OS !== 'web') await persist(() => SecureStore.deleteItemAsync(KEY));
  },
  setStatus: (status, issue) => {
    if (get().status !== status || get().issue !== (issue ?? null)) log.connect('peer.status', { status, issue });
    set({ status, issue: status === 'error' ? issue ?? 'network' : null });
  },
}));
