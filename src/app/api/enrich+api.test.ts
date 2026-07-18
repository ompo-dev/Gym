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
