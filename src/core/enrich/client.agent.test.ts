import { bindAgentRPC, type AgentRequest } from '@/core/connect/agentRPC';
import { useAgentConnectionStore } from '@/store/useAgentConnectionStore';
import { useAgentSettingsStore } from '@/store/useAgentSettingsStore';

import { enrich } from './client';
import type { ApiKeys } from './types';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: {} } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'fixture-call' }));
jest.mock('@/data/SettingsRepository', () => ({ SettingsRepository: { get: async () => null, set: async () => {} } }));
let mockApiKeys: ApiKeys;
jest.mock('@/store/useAppStore', () => ({ useAppStore: { getState: () => ({ apiKeys: mockApiKeys }) } }));

const originalFetch = global.fetch;
let rpc: ReturnType<typeof bindAgentRPC> | undefined;
const food = { items: [{ label: 'refeicao de teste', calories: 500, protein: 40, carbs: 50, fat: 10, waterMl: 0 }] };
const descriptions = { descriptions: [{ id: 'photo', description: 'Prato de arroz e frango' }] };
const req = { text: 'arroz e frango', domain: 'food' as const, locale: 'pt-BR', userContext: 'Meta diaria de teste: 2000 kcal' };
const photo = { id: 'photo', kind: 'foodPhoto' as const, base64: 'dGVzdA==', mimeType: 'image/jpeg' };

function connect(reply: (request: AgentRequest) => unknown = () => food) {
  const requests: AgentRequest[] = [];
  rpc = bindAgentRPC((message) => {
    const event = message as { type: string; id: string; request: AgentRequest };
    if (event.type !== 'agent.request') return;
    requests.push(event.request);
    queueMicrotask(() => {
      try { rpc?.receive({ type: 'agent.result', id: event.id, ok: true, data: { json: reply(event.request) } }); }
      catch { rpc?.receive({ type: 'agent.result', id: event.id, ok: false, error: 'agent.failed' }); }
    });
  });
  return requests;
}

beforeEach(() => {
  useAgentSettingsStore.getState().reset();
  useAgentConnectionStore.setState({ connection: null, status: 'offline', issue: null });
  mockApiKeys = { mode: 'own', chat: 'deepseek:test-key', image: 'openai:test-image-key' };
  global.fetch = jest.fn() as typeof fetch;
});
afterEach(() => {
  rpc?.close(); rpc = undefined;
  global.fetch = originalFetch;
  useAgentSettingsStore.getState().reset();
  useAgentConnectionStore.setState({ connection: null, status: 'offline', issue: null });
});

test('the selected connected agent is the default for text and images without extra role setup', async () => {
  useAgentConnectionStore.setState({
    connection: { url: 'ws://127.0.0.1:3847/app', token: 'a'.repeat(64), allowWrites: true, agent: 'codex' },
    status: 'connected',
    issue: null,
  });
  const requests = connect((request) => request.media?.length ? descriptions : food);
  expect(await enrich({ ...req, media: [photo] })).toMatchObject({ ok: true, data: food });
  expect(requests.map((request) => request.provider)).toEqual(['codex', 'codex']);
  expect(global.fetch).not.toHaveBeenCalled();
});

test.each(['own', 'managed', 'agent'] as const)('connected text agent takes priority in %s mode and keeps the full nutrition pipeline', async (mode) => {
  mockApiKeys.mode = mode;
  await useAgentSettingsStore.getState().bind('text', { provider: 'codex', choices: { model: 'account-model', effort: 'high' } });
  const requests = connect();
  expect(await enrich(req)).toMatchObject({ ok: true, data: food });
  expect(global.fetch).not.toHaveBeenCalled();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ provider: 'codex', action: 'generate', choices: { model: 'account-model', effort: 'high' } });
  expect(requests[0].messages?.[1].content).toContain(req.userContext);
  expect(requests[0].messages?.[1].content).toContain(req.text);
});

test.each(['own', 'agent'] as const)('offline peer falls back to saved keys in %s mode before dispatch', async (mode) => {
  mockApiKeys.mode = mode;
  await useAgentSettingsStore.getState().bind('text', { provider: 'codex', choices: {} });
  const fetchMock = jest.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify(food) } }] }));
  global.fetch = fetchMock as typeof fetch;
  expect(await enrich(req)).toMatchObject({ ok: true, data: food });
  expect(fetchMock.mock.calls[0][0]).toBe('https://api.deepseek.com/chat/completions');
});

test('an agent failure never silently sends the note to a paid API fallback', async () => {
  await useAgentSettingsStore.getState().bind('text', { provider: 'codex', choices: {} });
  connect(() => { throw new Error('fixture failure'); });
  expect(await enrich(req)).toEqual({ ok: false, error: 'agent.failed' });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('invalid agent nutrition is still rejected by the existing output schema', async () => {
  await useAgentSettingsStore.getState().bind('text', { provider: 'codex', choices: {} });
  connect(() => ({ calories: 'invented' }));
  expect(await enrich(req)).toEqual({ ok: false, error: 'AI response did not match schema' });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('photos use the image agent and then the text agent for contextual nutrition', async () => {
  await useAgentSettingsStore.getState().bind('text', { provider: 'codex', choices: { effort: 'high' } });
  await useAgentSettingsStore.getState().bind('vision', { provider: 'gemini', choices: { model: 'vision-model' } });
  const requests = connect((request) => request.media?.length ? descriptions : food);
  expect(await enrich({ ...req, media: [photo] })).toMatchObject({ ok: true, data: food, mediaDescriptions: descriptions.descriptions });
  expect(requests.map((request) => request.provider)).toEqual(['gemini', 'codex']);
  expect(requests[0].media).toEqual([{ base64: photo.base64, mimeType: photo.mimeType }]);
  expect(requests[1].messages?.[1].content).toContain(descriptions.descriptions[0].description);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('a text-only agent still handles nutrition when the configured API describes the photo', async () => {
  await useAgentSettingsStore.getState().bind('text', { provider: 'codex', choices: {} });
  const requests = connect();
  const fetchMock = jest.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify(descriptions) } }] }));
  global.fetch = fetchMock as typeof fetch;
  expect(await enrich({ ...req, media: [photo] })).toMatchObject({ ok: true, data: food });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses');
  expect(requests).toHaveLength(1);
  expect(requests[0].messages?.[1].content).toContain(descriptions.descriptions[0].description);
});

test('an image-only agent handles the photo before the configured text API', async () => {
  await useAgentSettingsStore.getState().bind('vision', { provider: 'gemini', choices: {} });
  const requests = connect(() => descriptions);
  const fetchMock = jest.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify(food) } }] }));
  global.fetch = fetchMock as typeof fetch;
  expect(await enrich({ ...req, media: [photo] })).toMatchObject({ ok: true, data: food });
  expect(requests).toHaveLength(1);
  expect(requests[0].media).toHaveLength(1);
  expect(fetchMock.mock.calls[0][0]).toBe('https://api.deepseek.com/chat/completions');
});

test('already described cutouts need only the text agent, not another vision request', async () => {
  await useAgentSettingsStore.getState().bind('text', { provider: 'codex', choices: {} });
  const requests = connect();
  expect(await enrich({ ...req, media: [{ ...photo, description: 'Arroz' }] })).toMatchObject({ ok: true });
  expect(requests).toHaveLength(1);
  expect(requests[0].media).toBeUndefined();
  expect(global.fetch).not.toHaveBeenCalled();
});

test('an image key alone can complement the text agent without requiring a text API key', async () => {
  mockApiKeys.chat = '';
  await useAgentSettingsStore.getState().bind('text', { provider: 'codex', choices: {} });
  connect();
  global.fetch = jest.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify(descriptions) } }] })) as typeof fetch;
  expect(await enrich({ ...req, media: [photo] })).toMatchObject({ ok: true, data: food });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('managed mode never bills a stored user key when the peer is offline', async () => {
  mockApiKeys.mode = 'managed';
  await useAgentSettingsStore.getState().bind('text', { provider: 'codex', choices: {} });
  expect(await enrich(req)).toMatchObject({ ok: false, error: 'enrich.unconfigured' });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('planned meals, recipes and purchases keep their shapes through the connected agent', async () => {
  await useAgentSettingsStore.getState().bind('text', { provider: 'codex', choices: {} });
  const result = { notes: [
    { text: 'comprei banana', data: { purchase: [{ label: 'banana', grams: 1000, price: 10 }] } },
    { text: 'Almoco', planned: true, data: { ...food, mealType: 'lunch' } },
    { text: 'Receita de bolo', planned: true, data: { ...food, recipe: { servings: 8, ingredients: [{ label: 'banana', quantity: 3, unit: 'unidade' }], steps: [{ text: 'Misture e asse.' }] } } },
  ] };
  connect(() => result);
  expect(await enrich({ ...req, intent: 'foodAuto' })).toMatchObject({ ok: true, data: result });
  expect(global.fetch).not.toHaveBeenCalled();
});
