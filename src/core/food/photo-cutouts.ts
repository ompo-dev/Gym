import { z } from 'zod';

import type { EntryMediaAttachment, FoodPhotoCutout } from '@/core/types';

const coordinate = z.number().finite().min(0).max(1000);
const point = z.tuple([coordinate, coordinate]);
const box = z.tuple([coordinate, coordinate, coordinate, coordinate]);
const polygon = z.array(point).min(3).max(256);

export const foodPhotoCutoutSchema = z.object({
  id: z.string().min(1).max(160),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(350),
  box,
  polygon,
}).refine((item) => item.box[2] > item.box[0] && item.box[3] > item.box[1], 'Empty box')
  .refine((item) => Math.abs(item.polygon.reduce((sum, p, i, points) => {
    const next = points[(i + 1) % points.length];
    return sum + p[0] * next[1] - next[0] * p[1];
  }, 0)) > 100, 'Empty contour');

export const foodPhotoScanSchema = z.object({
  items: z.array(z.object({
    label: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(350),
    box_2d: box,
    mask: polygon,
  })).max(40),
});

export function parsePhotoScan(raw: unknown): FoodPhotoCutout[] {
  return foodPhotoScanSchema.parse(raw).items.map((item, index) => foodPhotoCutoutSchema.parse({
    id: `item-${index + 1}`,
    label: item.label,
    description: item.description,
    box: item.box_2d,
    polygon: item.mask,
  }));
}

export function persistedPhotoFields(record: Record<string, unknown>) {
  const cutouts = Array.isArray(record.cutouts)
    ? record.cutouts.flatMap((item) => {
        const parsed = foodPhotoCutoutSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
  const width = typeof record.width === 'number' && record.width > 0 && Number.isFinite(record.width) ? record.width : undefined;
  const height = typeof record.height === 'number' && record.height > 0 && Number.isFinite(record.height) ? record.height : undefined;
  return { width, height, cutouts: width && height && cutouts.length ? cutouts : undefined };
}

/** Virtual attachments share the original image; only the parent is persisted. */
export function expandPhotoCutouts(media: EntryMediaAttachment[]): EntryMediaAttachment[] {
  return media.flatMap((photo) => photo.cutouts?.length
    ? photo.cutouts.map((cutout) => ({
        ...photo,
        id: `${photo.id}:${cutout.id}`,
        description: cutout.description,
        cutouts: [cutout],
      }))
    : [photo]);
}

export function selectedPhotoDescription(photo: EntryMediaAttachment): string {
  if (!photo.cutouts?.length) return photo.description;
  return [
    'Only these selected items are included. Return a separate food item for each exact mediaId; do not include other objects or a combined parent item.',
    ...expandPhotoCutouts([photo]).map((item) => `mediaId=${item.id}: ${item.description}`),
    photo.description,
  ].filter(Boolean).join('\n');
}

export function cutoutGeometry(cutout: FoodPhotoCutout, width: number, height: number) {
  const [top, left, bottom, right] = cutout.box;
  const x = left * width / 1000;
  const y = top * height / 1000;
  const w = (right - left) * width / 1000;
  const h = (bottom - top) * height / 1000;
  return {
    x, y, width: w, height: h,
    points: cutout.polygon.map(([px, py]) => `${x + px * w / 1000},${y + py * h / 1000}`).join(' '),
    viewBox: `${x} ${y} ${w} ${h}`,
  };
}
