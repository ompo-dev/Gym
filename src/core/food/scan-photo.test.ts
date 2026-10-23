import { bindAgentRPC } from '@/core/connect/agentRPC';
import type { ApiKeys } from '@/core/enrich/types';
import { useAgentSettingsStore } from '@/store/useAgentSettingsStore';

import { scanFoodPhoto, type PreparedFoodPhoto } from './scan-photo';

jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'fixture-call' }));
jest.mock('@/data/SettingsRepository', () => ({ SettingsRepository: { get: async () => null, set: async () => {} } }));
let mockApiKeys: ApiKeys;
jest.mock('@/store/useAppStore', () => ({ useAppStore: { getState: () => ({ apiKeys: mockApiKeys }) } }));

const originalFetch = global.fetch;
let rpc: ReturnType<typeof bindAgentRPC> | undefined;
const photo: PreparedFoodPhoto = { kind: 'foodPhoto', uri: 'fixture.jpg', base64: 'dGVzdA==', mimeType: 'image/jpeg', width: 800, height: 1200 };
const items = [{ label: 'Cafe', description: 'Copo de cafe', box_2d: [100, 200, 700, 600], mask: [[500, 0], [1000, 500], [500, 1000], [0, 500]] }];

beforeEach(() => {
  useAgentSettingsStore.getState().reset();
  mockApiKeys = { mode: 'own', chat: 'deepseek:test-key', image: 'openai:test-image-key' };
  global.fetch = jest.fn() as typeof fetch;
});
afterEach(() => { rpc?.close(); rpc = undefined; global.fetch = originalFetch; useAgentSettingsStore.getState().reset(); });

test('segmentation uses the connected vision agent before an image API key and validates its contours', async () => {
  await useAgentSettingsStore.getState().bind('vision', { provider: 'gemini', choices: { model: 'vision-model' } });
  const send = jest.fn((message: unknown) => {
    const event = message as { type: string; id: string; request: { action: string } };
    if (event.type === 'agent.request') queueMicrotask(() => rpc?.receive({ type: 'agent.result', id: event.id, ok: true,
      data: event.request.action === 'inspect' ? { authenticated: true, imageSupported: true } : { json: { items } } }));
  });
  rpc = bindAgentRPC(send);
  expect(await scanFoodPhoto(photo, 'pt-BR', new AbortController().signal)).toMatchObject([{ label: 'Cafe' }]);
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ request: expect.objectContaining({
    provider: 'gemini', action: 'generate', media: [{ base64: photo.base64, mimeType: photo.mimeType }], responseSchema: expect.any(Object),
  }) }));
  expect(global.fetch).not.toHaveBeenCalled();
});

test.each(['own', 'agent'] as const)('an offline vision agent uses the saved image key in %s mode', async (mode) => {
  mockApiKeys.mode = mode;
  await useAgentSettingsStore.getState().bind('vision', { provider: 'gemini', choices: {} });
  const fetchMock = jest.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify({ items }) } }] }));
  global.fetch = fetchMock as typeof fetch;
  expect(await scanFoodPhoto(photo, 'pt-BR', new AbortController().signal)).toHaveLength(1);
  expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses');
});

test('a failed vision request does not silently bill an image API key', async () => {
  await useAgentSettingsStore.getState().bind('vision', { provider: 'gemini', choices: {} });
  rpc = bindAgentRPC((message) => {
    const event = message as { type: string; id: string; request: { action: string } };
    if (event.type === 'agent.request') queueMicrotask(() => rpc?.receive(event.request.action === 'inspect'
      ? { type: 'agent.result', id: event.id, ok: true, data: { authenticated: true, imageSupported: true } }
      : { type: 'agent.result', id: event.id, ok: false, error: 'agent.noVision' }));
  });
  await expect(scanFoodPhoto(photo, 'pt-BR', new AbortController().signal)).rejects.toThrow('agent.noVision');
  expect(global.fetch).not.toHaveBeenCalled();
});
