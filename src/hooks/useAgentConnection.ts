import { useEffect, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { AppState, Platform } from 'react-native';

import { createAgentSession } from '@/core/connect/session';
import { appToolDeps } from '@/core/tools/appTools';
import { bindAgentRPC } from '@/core/connect/agentRPC';
import { peerProof, verifyPeer } from '@/core/connect/peerAuth';
import { startPeerDiscovery } from '@/core/connect/peerDiscovery';
import { useAgentConnectionStore } from '@/store/useAgentConnectionStore';
import { bus } from '@/core/command/bus';

export function useAgentConnection(ready: boolean) {
  const connection = useAgentConnectionStore((s) => s.connection);
  const [active, setActive] = useState(AppState.currentState !== 'background');
  const canRun = Platform.OS === 'web' || active;
  useEffect(() => {
    void useAgentConnectionStore.getState().hydrate();
    const sub = AppState.addEventListener('change', (state) => setActive(state !== 'background'));
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
    const waiting = Platform.OS !== 'web' && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(connection.url).hostname);
    if (waiting) setStatus('waiting');
    let savingPeer = false;
    const stopDiscovery = Platform.OS === 'web' ? () => {} : startPeerDiscovery(connection.token, (urls) => {
      const state = useAgentConnectionStore.getState();
      if (disposed || savingPeer || state.connection !== connection || state.status === 'connected' || urls[0] === connection.url) return;
      savingPeer = true;
      void state.configure({ ...connection, url: urls[0] }).catch(() => {
        if (!disposed) setStatus('error', 'network');
      }).finally(() => { savingPeer = false; });
    }, (issue) => { if (!disposed && waiting) setStatus('error', issue); });
    if (waiting) return () => { disposed = true; stopDiscovery(); };
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
      let helloSent = false;
      let clientNonce: string | null = null;
      const timeout = setTimeout(() => ws.close(), 10_000);
      ws.onopen = () => {
        void Crypto.getRandomBytesAsync(32).then((bytes) => {
          if (!isConnected() || ws.readyState !== WebSocket.OPEN) return;
          clientNonce = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
          ws.send(JSON.stringify({ type: 'init', nonce: clientNonce }));
        }).catch(() => { if (isConnected()) ws.close(); });
      };
      ws.onmessage = async (event) => {
        if (!isConnected() || typeof event.data !== 'string' || event.data.length > 1_100_000) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'challenge' && !authenticated && !helloSent) {
            if (!clientNonce || !verifyPeer(connection.token, clientNonce, message.nonce, message.proof)) { ws.close(1008, 'wrong-key'); return; }
            helloSent = true;
            ws.send(JSON.stringify({ type: 'hello', nonce: message.nonce,
              proof: peerProof(connection.token, message.nonce, 'app', clientNonce), tools: session.catalog(),
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
          } else if (message.type === 'ready' && !authenticated) {
            if (!helloSent) { ws.close(1008, 'wrong-key'); return; }
            authenticated = true;
            clearTimeout(timeout);
            agentRPC = bindAgentRPC((message) => ws.send(JSON.stringify(message)));
            setStatus('connected');
            void bus.resumePending().catch(() => {});
          } else if (agentRPC?.receive(message)) {
            return;
          } else if (message.type === 'ping' && authenticated && typeof message.id === 'string' && message.id.length <= 100) {
            ws.send(JSON.stringify({ type: 'result', id: message.id, result: { ok: true, data: { connected: true } } }));
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
        setStatus('error', event.code === 1008 ? event.reason === 'app-in-use' ? 'inUse' : 'wrongKey' : 'network');
        // Wrong credentials require user action, not an infinite retry loop.
        if (event.code !== 1008) retry = setTimeout(open, 5_000);
      };
    };
    open();
    return () => {
      disposed = true;
      stopDiscovery();
      clearTimeout(retry);
      stopSession?.();
      agentRPC?.close();
      socket?.close();
      setStatus('offline');
    };
  }, [ready, canRun, connection]);
}
