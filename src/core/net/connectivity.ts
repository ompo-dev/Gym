import * as Network from 'expo-network';

import { log } from '@/core/log';

/**
 * Network as a *trigger*, never as the truth. A captive portal reports
 * connected while nothing is reachable, so the real proof of offline is a failed
 * request (the CommandBus decides the badge from that). This module only answers
 * "is it even worth trying now" and pokes a drain when the radio comes back.
 *
 * Imports only expo-network — never the bus — so there is no cycle: `bus.ts`
 * reads `isDeviceOffline`, `_layout` wires `startConnectivityWatch` to the drain.
 */

/** True when the device has no active connection. Best-effort; unknown → online
 *  (let the request decide). Consumed by `CommandBus.checkOffline`. */
export async function isDeviceOffline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.isConnected === false;
  } catch {
    return false;
  }
}

let watching = false;

/**
 * Run `onReconnect` each time the radio transitions from disconnected to
 * connected. Reentrancy-guarded twice: `watching` stops a second registration,
 * and `draining` stops a flapping wifi from stacking drains. Returns an
 * unsubscribe.
 */
export function startConnectivityWatch(
  onReconnect: () => void | Promise<unknown>,
): () => void {
  if (watching) return () => {};
  watching = true;
  let wasConnected: boolean | undefined;
  let draining = false;

  const subscription = Network.addNetworkStateListener((state) => {
    const connected = state.isConnected !== false;
    if (connected && wasConnected === false && !draining) {
      draining = true;
      log.note('reconnected → draining queue');
      Promise.resolve(onReconnect())
        .catch((error) =>
          log.error('reconnect drain failed', {
            error: error instanceof Error ? error.message : String(error),
          }),
        )
        .finally(() => {
          draining = false;
        });
    }
    wasConnected = connected;
  });

  return () => {
    subscription.remove();
    watching = false;
  };
}
