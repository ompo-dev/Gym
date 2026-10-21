import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { createAgentSession } from '@/core/connect/session';
import { appToolDeps } from '@/core/tools/appTools';
import { bindAgentRPC } from '@/core/connect/agentRPC';
import { useAgentConnectionStore } from '@/store/useAgentConnectionStore';

export function useAgentConnection(ready: boolean) {
  const connection = useAgentConnectionStore((s) => s.connection);
  const authenticating = useAgentConnectionStore((s) => s.authenticating);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const canRun = active || (Platform.OS === 'web' && authenticating);
  useEffect(() => {
    void useAgentConnectionStore.getState().hydrate();
    const sub = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!ready || !canRun || !connection) return;
    let disposed = false;
    let socket: WebSocket | null = null;
    let stopSession: (() => void) | undefined;
    let agentRPC: ReturnType<typeof bindAgentRPC> | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const setStatus = useAgentConnectionStore.getState().setStatus;
    const open = () => {
      if (disposed) return;
      setStatus('connecting');
      const isConnected = () => !disposed && useAgentConnectionStore.getState().connection === connection;
      const session = createAgentSession(appToolDeps, connection.allowWrites, isConnected);
      stopSession = session.close;
      try { socket = new WebSocket(connection.url); }
      catch { setStatus('error'); return; }
      const ws = socket;
      let authenticated = false;
      const timeout = setTimeout(() => ws.close(), 10_000);
      ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', token: connection.token, tools: session.catalog() }));
      ws.onmessage = async (event) => {
        if (!isConnected() || typeof event.data !== 'string' || event.data.length > 1_100_000) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'ready' && !authenticated) {
            authenticated = true;
            clearTimeout(timeout);
            setStatus('connected');
            agentRPC = bindAgentRPC((message) => ws.send(JSON.stringify(message)));
          } else if (agentRPC?.receive(message)) {
            return;
          } else if (message.type === 'call' && authenticated) {
            const result = await session.call(message);
            if (isConnected() && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'result', id: message.id, result }));
          }
        } catch { ws.close(); }
      };
      ws.onerror = () => { if (!disposed) setStatus('error'); };
      ws.onclose = (event) => {
        session.close();
        agentRPC?.close();
        clearTimeout(timeout);
        if (disposed) return;
        setStatus('error');
        // Wrong credentials require user action, not an infinite retry loop.
        if (event.code !== 1008) retry = setTimeout(open, 5_000);
      };
    };
    open();
    return () => {
      disposed = true;
      clearTimeout(retry);
      stopSession?.();
      agentRPC?.close();
      socket?.close();
      setStatus('offline');
    };
  }, [ready, canRun, connection]);
}
