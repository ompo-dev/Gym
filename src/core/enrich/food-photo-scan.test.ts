import { POST } from '@/app/api/food-photo-scan+api';
import { runFoodPhotoScan } from './food-photo-scan';
import { runEnrichEngine } from './deepseek';

const originalFetch = global.fetch;
const oldKey = process.env.GEMINI_API_KEY;
afterEach(() => {
  global.fetch = originalFetch;
  if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
});

const input = { base64: 'AAAA', mimeType: 'image/jpeg' as const, locale: 'pt-BR' };
const modelOutput = { items: [{ label: 'Cafe', description: 'Copo com leite', box_2d: [100, 100, 800, 800], mask: [[0, 0], [1000, 0], [800, 1000], [200, 1000]] }] };

test('managed route uses the Gemini image key and returns validated independent contours', async () => {
  process.env.GEMINI_API_KEY = 'test-image-key';
  const fetchMock = jest.fn(async () => Response.json({ steps: [
    { type: 'thought', content: [{ type: 'text', text: 'Never parse this' }] },
    { type: 'model_output', content: [{ type: 'text', text: JSON.stringify(modelOutput) }] },
  ] }));
  global.fetch = fetchMock as typeof fetch;
  const response = await POST(new Request('http://localhost/api/food-photo-scan', { method: 'POST', body: JSON.stringify(input) }));
  expect(response.status).toBe(200);
  expect((await response.json()).items[0]).toMatchObject({ id: 'item-1', label: 'Cafe', polygon: modelOutput.items[0].mask });
  const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toContain('generativelanguage.googleapis.com');
  expect(options.headers).toMatchObject({ 'x-goog-api-key': 'test-image-key' });
  expect(JSON.parse(options.body as string).generation_config.thinking_level).toBe('minimal');
});

test('invalid uploads never reach the provider and unsupported own keys never use managed keys', async () => {
  const fetchMock = jest.fn();
  global.fetch = fetchMock;
  const response = await POST(new Request('http://localhost/api/food-photo-scan', { method: 'POST', body: JSON.stringify({ ...input, base64: '' }) }));
  expect(response.status).toBe(400);
  await expect(runFoodPhotoScan(input, { provider: 'deepseek', key: 'own' })).rejects.toThrow('photoScan.unsupported');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('provider failures do not create fake cutouts', async () => {
  process.env.GEMINI_API_KEY = 'test-image-key';
  global.fetch = jest.fn(async () => new Response('unavailable', { status: 503 })) as typeof fetch;
  const response = await POST(new Request('http://localhost/api/food-photo-scan', { method: 'POST', body: JSON.stringify(input) }));
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: 'photoScan.failed' });
});

test('nutrition reuses scanned descriptions without a second vision request', async () => {
  const fetchMock = jest.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify({ items: [{ label: 'Cafe', mediaId: 'photo:item-1', calories: 100, protein: 4, carbs: 10, fat: 5, waterMl: 150 }] }) } }] }));
  global.fetch = fetchMock as typeof fetch;
  const response = await runEnrichEngine({
    text: 'Cafe', domain: 'food', intent: 'parse', locale: 'pt-BR',
    media: [{ id: 'photo', kind: 'foodPhoto', base64: 'AAAA', description: 'Only selected item mediaId=photo:item-1: Copo de cafe com leite.' }],
  }, { chat: 'chat-test', image: 'vision-test', chatProvider: 'deepseek', imageProvider: 'gemini' });
  expect(response.ok).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toContain('deepseek');
});
