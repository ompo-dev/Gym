import { buildBarcodeText, latestThumbnails, SCANNED_PREFIX } from './FoodMediaDraftTray';
import { foodRouterPrompt } from '@/domains/prompts';

import type { FoodMediaDraft } from './FoodMediaDraftTray';

const scanned = (label: string, description = ''): FoodMediaDraft => ({
  id: label,
  kind: 'barcode',
  description,
  data: { items: [{ label, calories: 1, protein: 0, carbs: 0, fat: 0, waterMl: 0 }] },
});

// The strip beside the shutter showed the first three drafts, so a photo taken
// after three older ones never appeared — and the slot kept showing a gallery
// pick from earlier, which read as the camera saving the wrong image.
test('shows the newest photos, not the oldest', () => {
  const drafts = [{ uri: 'a' }, { uri: 'b' }, { uri: 'c' }, { uri: 'd' }];

  expect(latestThumbnails(drafts)).toEqual(['d', 'c', 'b']);
});

test('a photo just added is always the first one shown', () => {
  const drafts = [{ uri: 'old' }, { uri: 'just-taken' }];

  expect(latestThumbnails(drafts)[0]).toBe('just-taken');
});

// A barcode draft carries nutrition but no picture, and a gap in the strip
// would read as a photo that failed to save.
test('skips drafts that have no image', () => {
  expect(latestThumbnails([{ uri: 'a' }, {}, { uri: 'b' }])).toEqual(['b', 'a']);
});

// A scanned product is the only attached food the model never sees on its own:
// it arrives as finished FoodData, so it is in no image payload. Without this
// line, "receita com isso" beside a scanned jar asked for a dish with nothing
// in it.
test('names every scanned product so a request can point at it', () => {
  expect(buildBarcodeText([scanned('Maionese'), scanned('Arroz')])).toBe(
    'Already scanned and identified: Maionese, Arroz.',
  );
});

test('a description the user typed wins over the product name', () => {
  expect(buildBarcodeText([scanned('Nutella', 'meio pote')])).toContain('meio pote');
});

test('photo drafts carry no nutrition, so they are not listed here', () => {
  expect(buildBarcodeText([{ id: '1', kind: 'foodPhoto', uri: 'a', description: '' }])).toBe('');
});

// Two halves of one contract: the composer writes this prefix, the router is
// taught to recognise it. Changing one side alone silently drops the food.
test('the router prompt knows the prefix the composer writes', () => {
  expect(foodRouterPrompt).toContain(SCANNED_PREFIX);
});
