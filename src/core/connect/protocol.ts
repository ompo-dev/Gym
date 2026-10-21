import { z } from 'zod';

export function localSocketURL(value: string): string {
  const url = new URL(value.trim());
  const host = url.hostname.toLowerCase();
  const octets = host.split('.').map(Number);
  const privateIPv4 = octets.length === 4 && octets.every((v) => Number.isInteger(v) && v >= 0 && v <= 255) &&
    (octets[0] === 127 || octets[0] === 10 ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31));
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
    !['', '/', '/app'].includes(url.pathname) ||
    !(host === 'localhost' || host === '[::1]' || privateIPv4)) {
    throw new Error('connect.localOnly');
  }
  url.pathname = '/app';
  return url.toString();
}

export const connectionSchema = z.object({
  url: z.string().transform(localSocketURL),
  token: z.string().regex(/^[a-f0-9]{64}$/i),
  allowWrites: z.boolean().default(false),
});
export type AgentConnection = z.output<typeof connectionSchema>;

export const agentCallSchema = z.object({
  type: z.literal('call'),
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(80),
  arguments: z.record(z.string(), z.unknown()),
});
