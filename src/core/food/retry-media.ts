import type { EnrichMediaInput } from '@/core/enrich/types';
import type { Entry } from '@/core/types';
import { prepareFoodPhoto } from './scan-photo';
import { selectedPhotoDescription } from './photo-cutouts';

/** Restore persisted photos, never silently turn a failed image into a text-only note. */
export async function loadEntryPhotos(entry: Entry): Promise<EnrichMediaInput[]> {
  if (entry.media?.some((media) => media.kind === 'barcode')) throw new Error('media.retryUnsupported');
  return Promise.all((entry.media ?? []).map(async (media) => {
    if (!media.uri) throw new Error('media.sourceMissing');
    const stored = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(media.uri);
    const photo = stored ? { mimeType: stored[1], base64: stored[2] }
      : await prepareFoodPhoto({ ...media, uri: media.uri, kind: media.kind as 'foodPhoto' | 'menuPhoto' });
    if (!photo.base64.length || photo.base64.length > 2_500_000) throw new Error('media.sourceInvalid');
    return { id: media.id, kind: media.kind as 'foodPhoto' | 'menuPhoto',
      mimeType: photo.mimeType, base64: photo.base64, description: selectedPhotoDescription(media) };
  }));
}
