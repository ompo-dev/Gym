import { useAgentConnectionStore } from '@/store/useAgentConnectionStore';

import { importAgentConnection } from './setupPrompt';

export async function openAgentConnection(value: string) {
  const store = useAgentConnectionStore;
  if (!store.getState().connection) await store.getState().hydrate();
  const current = store.getState().connection;
  if (!current) throw new Error('connect.missingInvite');
  const next = await importAgentConnection(value, current);
  if (store.getState().connection !== current) throw new Error('connect.invalidCode');
  await store.getState().configure(next);
}
