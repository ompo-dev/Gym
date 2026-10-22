import * as Network from 'expo-network';
import { NativeModules } from 'react-native';
import Zeroconf from 'react-native-zeroconf';

import type { ConnectionIssue } from '@/store/useAgentConnectionStore';
import { peerSocketURLs } from './discovery';
import { pairingIdFor } from './setupPrompt';

export function startPeerDiscovery(token: string, onPeer: (urls: string[]) => void, onError: (issue: ConnectionIssue) => void) {
  let active = true;
  let browser: Zeroconf | undefined;
  if (!NativeModules.RNZeroconf) { onError('upgradeRequired'); return () => {}; }
  void Promise.all([pairingIdFor(token), Network.getIpAddressAsync().catch(() => '')]).then(async ([id, localAddress]) => {
    if (!active) return;
    browser = new Zeroconf();
    browser.on('error', (error) => { if (active) onError(error.code === -65570 ? 'localPermission' : 'network'); });
    const access = await browser.checkLocalNetworkAccess({ type: 'gymnotes', protocol: 'tcp' });
    if (!active) return;
    if (access === 'denied') { onError('localPermission'); return; }
    browser.on('resolved', (service) => {
      if (!active) return;
      const urls = peerSocketURLs(service, id, localAddress);
      if (urls.length) onPeer(urls);
    });
    browser.scan({ type: 'gymnotes', protocol: 'tcp', domain: 'local.' });
  }).catch(() => { if (active) onError('network'); });
  return () => {
    active = false;
    browser?.stop();
    browser?.removeDeviceListeners();
    browser?.removeAllListeners();
  };
}
