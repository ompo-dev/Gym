import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { z } from 'zod';

import { apiBase } from '@/core/enrich/client';
import { runFoodPhotoScan, type PhotoScanRequest } from '@/core/enrich/food-photo-scan';
import { resolveProviderCredential } from '@/core/enrich/providers';
import { agentJsonTransport, availableAgentTransports } from '@/core/connect/agentTransport';
import type { FoodPhotoCutout } from '@/core/types';
import { useAppStore } from '@/store/useAppStore';
import { log } from '@/core/log';

import { foodPhotoCutoutSchema } from './photo-cutouts';

export interface CapturedFoodPhoto {
  kind: 'foodPhoto' | 'menuPhoto';
  uri: string;
  width?: number;
  height?: number;
  base64?: string;
  mimeType?: string;
  description?: string;
  cutouts?: FoodPhotoCutout[];
}

export type PreparedFoodPhoto = CapturedFoodPhoto & {
  width: number;
  height: number;
  base64: string;
  mimeType: 'image/jpeg';
};

export async function prepareFoodPhoto(photo: CapturedFoodPhoto): Promise<PreparedFoodPhoto> {
  const end = log.time('media', 'photo.prepare', { kind: photo.kind, width: photo.width, height: photo.height });
  const context = ImageManipulator.manipulate(photo.uri);
  const portrait = (photo.height ?? 0) > (photo.width ?? 0);
  if (!photo.width || !photo.height || Math.max(photo.width, photo.height) > 1280) {
    context.resize(portrait ? { height: 1280 } : { width: 1280 });
  }
  let rendered: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  try {
    rendered = await context.renderAsync();
    const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
    if (!result.base64 || result.base64.length > 2_500_000) throw new Error('photoScan.failed');
    end({ ok: true, width: result.width, height: result.height, bytes: result.base64.length });
    // Persist the normalized source once; picker blob/cache URIs do not survive reloads.
    return { ...photo, ...result, base64: result.base64, mimeType: 'image/jpeg', uri: `data:image/jpeg;base64,${result.base64}` };
  } catch (error) {
    end({ ok: false, reason: error instanceof Error ? error.message : 'media.prepareFailed' });
    throw error;
  } finally {
    rendered?.release();
    context.release();
  }
}

export async function scanFoodPhoto(photo: PreparedFoodPhoto, locale: string, signal: AbortSignal): Promise<FoodPhotoCutout[]> {
  const input: PhotoScanRequest = { base64: photo.base64, mimeType: photo.mimeType, locale };
  const { vision } = await availableAgentTransports();
  const keys = useAppStore.getState().apiKeys;
  if (vision) return runFoodPhotoScan(input, { provider: 'gemini', key: '' }, signal, vision);
  if (keys.mode === 'agent' && !keys.image.trim() && !keys.chat.trim()) {
    return runFoodPhotoScan(input, { provider: 'gemini', key: '' }, signal, agentJsonTransport);
  }
  if (keys.mode !== 'managed') {
    const rawKey = keys.image.trim() || keys.chat.trim();
    if (!rawKey) throw new Error('photoScan.unconfigured');
    const credential = resolveProviderCredential(rawKey, keys.image.trim() ? 'gemini' : 'deepseek');
    return runFoodPhotoScan(input, credential, signal);
  }
  const base = apiBase();
  if (base === null) throw new Error('photoScan.unconfigured');
  const response = await fetch(`${base}/api/food-photo-scan`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input), signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error === 'photoScan.unconfigured' ? body.error : 'photoScan.failed');
  return z.object({ items: z.array(foodPhotoCutoutSchema).max(40) }).parse(body).items;
}
