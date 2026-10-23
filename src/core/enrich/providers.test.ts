import { callVisionJson } from './providers';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
const photo = { id: 'photo', kind: 'foodPhoto' as const, base64: 'AAAA', mimeType: 'image/jpeg' };
const input = { provider: 'gemini' as const, apiKey: 'fixture', media: [photo], language: 'Portuguese', mediaOrder: '1. photo', maxTokens: 700 };

test('ordinary Gemini captions use supported low thinking with room for both thoughts and JSON', async () => {
  const output = { descriptions: [{ id: 'photo', description: 'Copo com leite' }] };
  const fetchMock = jest.fn(async () => Response.json({ status: 'completed', steps: [
    { type: 'thought', content: [{ type: 'text', text: 'not the answer' }] },
    { type: 'model_output', content: [{ type: 'text', text: JSON.stringify(output) }] },
  ] }));
  global.fetch = fetchMock as typeof fetch;
  await expect(callVisionJson(input)).resolves.toEqual(output);
  const request = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
  expect(request.input[1]).toEqual({ type: 'image', data: photo.base64, mime_type: 'image/jpeg' });
  expect(request.store).toBe(false);
  expect(request.generation_config).toEqual({ thinking_level: 'low', max_output_tokens: 2748 });
});

test('a thinking-truncated reply is not accepted even if its JSON fragment happens to parse', async () => {
  global.fetch = jest.fn(async () => Response.json({ status: 'incomplete', output_text: '{}' })) as typeof fetch;
  await expect(callVisionJson(input)).rejects.toThrow('enrich.outputLimit');
});
