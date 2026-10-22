import type { ConnectionIssue } from '@/store/useAgentConnectionStore';

// Browsers connect to their local companion; native builds use DNS-SD on the LAN.
export function startPeerDiscovery(_token: string, _onPeer: (urls: string[]) => void, _onError: (issue: ConnectionIssue) => void): () => void {
  return () => {};
}
