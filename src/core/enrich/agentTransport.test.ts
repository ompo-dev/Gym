import { runEnrichEngine } from './deepseek';
import { runFoodPhotoScan } from './food-photo-scan';

test('agent enrichment keeps full instructions and context without provider keys or HTTP', async () => {
  const fetchSpy = jest.spyOn(global, 'fetch');
  const transport = jest.fn(async () => ({ items: [{ label: 'arroz', calories: 300, protein: 5, carbs: 65, fat: 1 }] }));
  const userContext = `${'context '.repeat(500)}tail-never-truncated`;
  try {
    expect((await runEnrichEngine({ domain: 'food', intent: 'foodAuto', text: 'planeje minha dieta', userContext },
      { chat: '', image: '' }, undefined, transport)).ok).toBe(true);
    const request = transport.mock.calls[0][0];
    expect(request.messages[1].content).toContain('tail-never-truncated');
    expect(request.messages[0].content.length).toBeGreaterThan(1200);
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally { fetchSpy.mockRestore(); }
});
test('agent caption failures are not turned into blind nutrition guesses', async () => {
  const transport = jest.fn(async () => { throw new Error('agent.noVision'); });
  await expect(runEnrichEngine({ domain: 'food', intent: 'foodAuto', text: 'foto',
    media: [{ id: 'photo', kind: 'foodPhoto', base64: 'AAAA' }] }, { chat: '', image: '' }, undefined, transport))
    .rejects.toThrow('agent.noVision');
  expect(transport).toHaveBeenCalledTimes(1);
});
test('agent photo scanning uses the same image prompt, schema and contour validation', async () => {
  const transport = jest.fn(async () => ({ items: [{ label: 'Café', description: 'Copo com café',
    box_2d: [100, 100, 800, 800], mask: [[0, 0], [1000, 0], [800, 1000], [200, 1000]] }] }));
  const items = await runFoodPhotoScan({ base64: 'AAAA', mimeType: 'image/jpeg', locale: 'pt-BR' },
    { provider: 'gemini', key: '' }, undefined, transport);
  expect(items[0]).toMatchObject({ id: 'item-1', label: 'Café' });
  expect(transport.mock.calls[0][0]).toMatchObject({ media: [expect.objectContaining({ base64: 'AAAA' })], responseSchema: expect.any(Object) });
});
test('incomplete agent captions cannot silently drop an attached photo', async () => {
  const transport = jest.fn(async () => ({ descriptions: [] }));
  await expect(runEnrichEngine({ domain: 'food', intent: 'foodAuto', text: 'foto',
    media: [{ id: 'photo', kind: 'foodPhoto', base64: 'AAAA' }] }, { chat: '', image: '' }, undefined, transport))
    .rejects.toThrow('agent.invalidResponse');
  expect(transport).toHaveBeenCalledTimes(1);
});
