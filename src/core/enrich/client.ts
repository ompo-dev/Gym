import Constants from 'expo-constants';

import { useAppStore } from '@/store/useAppStore';

import type { EnrichKeys, EnrichRequest, EnrichResponse } from './types';

const TIMEOUT_MS = 20_000;

/** Thrown for connection failures / timeouts — the command retries these. */
export class NetworkError extends Error {}

/**
 * Resolve the proxy base URL. In production set EXPO_PUBLIC_API_URL to the
 * deployed EAS Hosting origin. In dev (Expo Go) fall back to the Metro dev
 * server, which also serves the `+api.ts` route.
 */
function apiBase(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) return `http://${hostUri.split('/')[0]}`;
  return 'http://localhost:8081';
}

/**
 * Attached here, at the single choke point every caller already goes through,
 * rather than at each call site — there are four of those and forgetting one
 * would silently bill the wrong key.
 */
function activeKeys(): EnrichKeys | undefined {
  const keys = useAppStore.getState().apiKeys;
  if (keys.mode !== 'own') return undefined;
  const chat = keys.chat.trim();
  if (!chat) return undefined;
  const image = keys.image.trim();
  return image ? { chat, image } : { chat };
}

export async function enrich(req: EnrichRequest): Promise<EnrichResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBase()}/api/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...req, keys: activeKeys() }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, error: `Server error ${res.status}` };
    return (await res.json()) as EnrichResponse;
  } catch (e) {
    throw new NetworkError(e instanceof Error ? e.message : 'network failure');
  } finally {
    clearTimeout(timer);
  }
}
