import { NetworkError, enrich } from './client';
import { ENRICH_UNCONFIGURED } from './types';

import type { ApiKeys } from './types';

// The standalone build is the case this file exists for: no Metro dev server,
// so expo-constants carries no hostUri and there is no proxy to reach.
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: {} } }));

let mockApiKeys: ApiKeys = { mode: 'managed', chat: '', image: '' };
jest.mock('@/store/useAppStore', () => ({
  useAppStore: { getState: () => ({ apiKeys: mockApiKeys }) },
}));

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  mockApiKeys = { mode: 'managed', chat: '', image: '' };
  delete process.env.EXPO_PUBLIC_API_URL;
});

const aiReply = (content: unknown) =>
  Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });

const oneFood = {
  items: [
    { label: 'arroz e frango', calories: 500, protein: 40, carbs: 50, fat: 10, waterMl: 0 },
  ],
};

const req = { text: 'arroz e frango', domain: 'food' as const, locale: 'pt-BR' };

test('calls DeepSeek directly with the user key instead of the proxy', async () => {
  mockApiKeys = { mode: 'own', chat: 'user-key', image: '' };
  const fetchMock = jest.fn(async () => aiReply(oneFood));
  global.fetch = fetchMock as unknown as typeof fetch;

  const res = await enrich(req);

  expect(res.ok).toBe(true);
  expect(fetchMock.mock.calls[0][0]).toBe('https://api.deepseek.com/chat/completions');
  const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
  expect(init.headers.Authorization).toBe('Bearer user-key');
});

test('reports unconfigured instead of dialing localhost when no proxy exists', async () => {
  const fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;

  const res = await enrich(req);

  // The old fallback hit http://localhost:8081, which on a phone looked like a
  // flaky network and burned five retries. Nothing must be sent at all.
  expect(fetchMock).not.toHaveBeenCalled();
  expect(res).toEqual({ ok: false, error: ENRICH_UNCONFIGURED });
});

test('still uses the proxy when a base URL is configured', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'https://gym.example.app/';
  const fetchMock = jest.fn(async () => Response.json({ ok: true, data: oneFood }));
  global.fetch = fetchMock as unknown as typeof fetch;

  await enrich(req);

  expect(fetchMock.mock.calls[0][0]).toBe('https://gym.example.app/api/enrich');
});

test('an unreachable upstream throws NetworkError so the bus retries', async () => {
  mockApiKeys = { mode: 'own', chat: 'user-key', image: '' };
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
  }) as unknown as typeof fetch;

  await expect(enrich(req)).rejects.toBeInstanceOf(NetworkError);
});

test('an unreachable proxy also throws NetworkError so the bus retries', async () => {
  // The direct path wraps transport errors in DeepSeekTransportError; the proxy
  // path gets a bare TypeError from fetch. Both must stay retryable — pinning
  // only the first one is how the proxy branch silently lost its retries.
  process.env.EXPO_PUBLIC_API_URL = 'https://gym.example.app';
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
  }) as unknown as typeof fetch;

  await expect(enrich(req)).rejects.toBeInstanceOf(NetworkError);
});

test('a rate-limited upstream is retryable, not terminal', async () => {
  mockApiKeys = { mode: 'own', chat: 'user-key', image: '' };
  global.fetch = jest.fn(async () =>
    Response.json({ error: 'rate limited' }, { status: 429 }),
  ) as unknown as typeof fetch;

  await expect(enrich(req)).rejects.toBeInstanceOf(NetworkError);
});

test('a rejected key is terminal, not retried', async () => {
  mockApiKeys = { mode: 'own', chat: 'bad-key', image: '' };
  global.fetch = jest.fn(async () =>
    Response.json({ error: 'unauthorized' }, { status: 401 }),
  ) as unknown as typeof fetch;

  // Retrying a 401 five times cannot make the key valid.
  const res = await enrich(req);
  expect(res).toMatchObject({ ok: false });
});

// One request, one JSON answer, no negotiation. There was a streaming layer
// here built on ReadableStream/TextEncoder/TextDecoder — none of which React
// Native ships — so building it threw inside the transport and every note
// queued, retried and ended on "try again" without a request ever leaving.
test('the proxy is asked plainly, with no stream to negotiate', async () => {
  process.env.EXPO_PUBLIC_API_URL = 'https://gym.example';
  const fetchMock = jest.fn(async () => Response.json({ ok: true, data: oneFood }));
  global.fetch = fetchMock as unknown as typeof fetch;

  const res = await enrich(req);

  expect(res).toEqual({ ok: true, data: oneFood });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
  expect(init.headers.Accept).toBeUndefined();
});
