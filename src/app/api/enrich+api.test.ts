import { POST } from './enrich+api';

const originalFetch = global.fetch;
const originalApiKey = process.env.DEEPSEEK_API_KEY;

afterEach(() => {
  global.fetch = originalFetch;
  process.env.DEEPSEEK_API_KEY = originalApiKey;
});

test('enrich disables thinking for strict JSON responses', async () => {
  process.env.DEEPSEEK_API_KEY = 'test-key';
  const fetchMock = jest.fn(async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              items: [
                {
                  label: 'hamburguer',
                  calories: 500,
                  protein: 25,
                  carbs: 40,
                  fat: 28,
                  waterMl: 0,
                },
              ],
            }),
          },
        },
      ],
    }),
  );
  global.fetch = fetchMock as typeof fetch;

  const response = await POST(
    new Request('http://localhost/api/enrich', {
      method: 'POST',
      body: JSON.stringify({
        text: 'hambuirguer batata frita refri e salada',
        domain: 'food',
        locale: 'pt-BR',
      }),
    }),
  );

  expect(response.status).toBe(200);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
    thinking: { type: 'disabled' },
    response_format: { type: 'json_object' },
  });
});

// Which key signs the request decides who gets billed, so each branch is pinned.
function authOf(fetchMock: jest.Mock, call = 0): string {
  const init = fetchMock.mock.calls[call][1] as { headers: Record<string, string> };
  return init.headers.Authorization;
}

function okFetch() {
  return jest.fn(async () =>
    Response.json({
      choices: [{ message: { content: JSON.stringify({ exercise: 'Supino', sets: [] }) } }],
    }),
  );
}

async function post(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/enrich', { method: 'POST', body: JSON.stringify(body) }),
  );
}

const workout = { text: 'supino', domain: 'workout', locale: 'pt-BR' };

test('without user keys the request is signed with the managed key', async () => {
  process.env.DEEPSEEK_API_KEY = 'managed-key';
  const fetchMock = okFetch();
  global.fetch = fetchMock as typeof fetch;

  await post(workout);

  expect(authOf(fetchMock)).toBe('Bearer managed-key');
});

test('a user chat key replaces the managed key', async () => {
  process.env.DEEPSEEK_API_KEY = 'managed-key';
  const fetchMock = okFetch();
  global.fetch = fetchMock as typeof fetch;

  await post({ ...workout, keys: { chat: 'user-key' } });

  expect(authOf(fetchMock)).toBe('Bearer user-key');
});

test('a bad user key does NOT silently fall back to the managed key', async () => {
  // Falling back would spend our quota for someone who opted out of it.
  process.env.DEEPSEEK_API_KEY = 'managed-key';
  const fetchMock = jest.fn(async () => new Response('nope', { status: 401 }));
  global.fetch = fetchMock as typeof fetch;

  const response = await post({ ...workout, keys: { chat: 'wrong-key' } });

  expect(authOf(fetchMock)).toBe('Bearer wrong-key');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(response.status).toBe(502);
});

test('user keys work even when the server has no managed key configured', async () => {
  delete process.env.DEEPSEEK_API_KEY;
  const fetchMock = okFetch();
  global.fetch = fetchMock as typeof fetch;

  const response = await post({ ...workout, keys: { chat: 'user-key' } });

  expect(response.status).toBe(200);
  expect(authOf(fetchMock)).toBe('Bearer user-key');
});

test('no managed key and no user key is a configuration error, not a silent pass', async () => {
  delete process.env.DEEPSEEK_API_KEY;
  const fetchMock = okFetch();
  global.fetch = fetchMock as typeof fetch;

  const response = await post(workout);

  expect(response.status).toBe(500);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('the image key signs the vision call while the chat key signs the parse call', async () => {
  process.env.DEEPSEEK_API_KEY = 'managed-key';
  const fetchMock = jest.fn(async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              descriptions: [{ id: 'm1', description: 'um prato' }],
              items: [],
            }),
          },
        },
      ],
    }),
  );
  global.fetch = fetchMock as typeof fetch;

  await post({
    text: 'almoco',
    domain: 'food',
    locale: 'pt-BR',
    keys: { chat: 'chat-key', image: 'image-key' },
    media: [{ id: 'm1', kind: 'foodPhoto', base64: 'AAAA' }],
  });

  expect(authOf(fetchMock, 0)).toBe('Bearer image-key'); // vision pass first
  expect(authOf(fetchMock, 1)).toBe('Bearer chat-key');
});

test('an empty image key falls back to the user chat key, not to ours', async () => {
  process.env.DEEPSEEK_API_KEY = 'managed-key';
  const fetchMock = jest.fn(async () =>
    Response.json({
      choices: [{ message: { content: JSON.stringify({ descriptions: [], items: [] }) } }],
    }),
  );
  global.fetch = fetchMock as typeof fetch;

  await post({
    text: 'almoco',
    domain: 'food',
    locale: 'pt-BR',
    keys: { chat: 'chat-key' },
    media: [{ id: 'm1', kind: 'foodPhoto', base64: 'AAAA' }],
  });

  expect(authOf(fetchMock, 0)).toBe('Bearer chat-key');
});
