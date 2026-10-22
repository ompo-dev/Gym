import { z } from 'zod';
import { localSocketURL } from './protocol';

const serviceSchema = z.object({ port: z.literal(3847), addresses: z.array(z.string().max(45)).max(32),
  txt: z.object({ pairingId: z.string().regex(/^[a-f0-9]{64}$/), protocol: z.literal('2') }) });

/** Discovery is a hint, never authentication. The socket must prove possession of the invite. */
export function peerSocketURLs(value: unknown, pairingId: string, localAddress = ''): string[] {
  const parsed = serviceSchema.safeParse(value);
  if (!parsed.success || parsed.data.txt.pairingId !== pairingId) return [];
  const local = localAddress.split('.');
  return [...new Set(parsed.data.addresses)].filter((address) => {
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(address) || address.startsWith('127.')) return false;
    try { localSocketURL(`ws://${address}:3847/app`); return true; } catch { return false; }
  }).sort((a, b) => {
    const score = (address: string) => address.split('.').reduce((sum, part, i) => sum + (part === local[i] ? 4 - i : 0), 0);
    return score(b) - score(a);
  }).map((address) => `ws://${address}:3847/app`);
}
