import { useLinkingURL } from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { openAgentConnection } from '@/core/connect/openConnection';
import { isAgentConnectionLink } from '@/core/connect/setupPrompt';
import { useAgentConnectionStore } from '@/store/useAgentConnectionStore';
import { useAppModalStore } from '@/store/useAppModalStore';

function showConnection() {
  const modals = useAppModalStore.getState();
  if (modals.stack.at(-1)?.id === 'settings.connect') return;
  const domain = modals.stack.find((modal) => modal.id === 'settings.root')?.domain ?? 'food';
  modals.closeAllAppModals();
  modals.openAppModal({ id: 'settings.root', domain });
  modals.openAppModal({ id: 'settings.connect', domain });
}

export function useAgentConnectionLink(ready: boolean) {
  const url = useLinkingURL();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !url || !isAgentConnectionLink(url) || handled.current === url) return;
    handled.current = url;
    let active = true;
    void openAgentConnection(url).catch((error) => {
      if (active) useAgentConnectionStore.getState().setStatus('error',
        error instanceof Error && error.message === 'connect.missingInvite' ? 'missingInvite' :
          error instanceof Error && error.message === 'connect.wrongInvite' ? 'wrongInvite' : 'invalidCode');
    }).finally(() => {
      if (active) { router.replace('/'); showConnection(); }
    });
    return () => { active = false; };
  }, [ready, url]);
}
