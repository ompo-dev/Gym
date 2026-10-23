import type { Entry } from '@/core/types';
import { loadEntryPhotos } from './retry-media';
import { prepareFoodPhoto } from './scan-photo';

jest.mock('./scan-photo', () => ({ prepareFoodPhoto: jest.fn(async () => ({ base64: 'AAAA', mimeType: 'image/jpeg' })) }));
const entry: Entry = { id: 'photo-note', text: 'Imagens anexadas', date: '2026-10-23', domain: 'food',
  status: 'error', error: 'agent.authRequired', data: null, createdAt: 1,
  media: [{ id: 'photo', kind: 'foodPhoto', description: '', uri: 'data:image/jpeg;base64,dGVzdA==' }] };
beforeEach(() => jest.clearAllMocks());

test('restores a persisted photo without recompressing or changing its bytes', async () => {
  expect(await loadEntryPhotos(entry)).toEqual([{ id: 'photo', kind: 'foodPhoto', mimeType: 'image/jpeg', base64: 'dGVzdA==', description: '' }]);
  expect(prepareFoodPhoto).not.toHaveBeenCalled();
});

test('normalizes legacy photo URIs and refuses missing sources or barcode-only retry', async () => {
  expect(await loadEntryPhotos({ ...entry, media: [{ ...entry.media![0], uri: 'file://legacy.jpg' }] })).toHaveLength(1);
  expect(prepareFoodPhoto).toHaveBeenCalledTimes(1);
  await expect(loadEntryPhotos({ ...entry, media: [{ ...entry.media![0], uri: undefined }] })).rejects.toThrow('media.sourceMissing');
  await expect(loadEntryPhotos({ ...entry, media: [{ id: 'barcode', kind: 'barcode', description: 'fixture' }] })).rejects.toThrow('media.retryUnsupported');
});
