import Constants from 'expo-constants';

import type { EnrichRequest, EnrichResponse } from './types';

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

export async function enrich(req: EnrichRequest): Promise<EnrichResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBase()}/api/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
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
