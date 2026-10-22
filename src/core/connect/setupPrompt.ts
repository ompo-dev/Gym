import * as Crypto from 'expo-crypto';
import { z } from 'zod';

import { connectionSchema, type AgentConnection } from './protocol';

const PREFIX = 'gymnotes-connect:v1:';
const payloadSchema = z.object({ url: z.string().max(300), pairingId: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const digest = (purpose: string, token: string) => Crypto.digestStringAsync(
  Crypto.CryptoDigestAlgorithm.SHA256, `gymnotes-${purpose}-v1:${token}`,
);

export const toolTokenFor = (token: string) => digest('tools', token);
export const pairingIdFor = (token: string) => digest('pairing', token);

export function isAgentConnectionLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'gym:' && url.hostname === 'connect' && !url.username && !url.password;
  } catch { return false; }
}

function readConnectionLink(value: string) {
  const url = new URL(value);
  if (url.username || url.password || url.hash) throw new Error('connect.invalidCode');
  if (isAgentConnectionLink(value)) {
    if (url.pathname && url.pathname !== '/') throw new Error('connect.invalidCode');
    if (url.searchParams.size !== 2) throw new Error('connect.invalidCode');
    return payloadSchema.parse({ url: url.searchParams.get('url'), pairingId: url.searchParams.get('pairingId') });
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/connect' || url.searchParams.size !== 1) throw new Error('connect.invalidCode');
  const pairingId = url.searchParams.get('pairingId');
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/app'; url.search = '';
  return payloadSchema.parse({ url: url.toString(), pairingId });
}

/** Only the public address and a fingerprint return through the clipboard. */
export async function importAgentConnection(code: string, current: AgentConnection): Promise<AgentConnection> {
  const text = code.trim();
  if (text.length > 20_000) throw new Error('connect.invalidCode');
  const id = await pairingIdFor(current.token);
  const candidates = [text, ...(text.match(/gymnotes-connect:v1:\{[^\r\n]{1,1100}\}(?=\s|`|$)|(?:gym|https?):\/\/[^\s<>"'`()]+/g) ?? [])];
  const matches = new Map<string, AgentConnection>();
  for (const candidate of new Set(candidates)) {
    try {
      const payload = candidate.startsWith(PREFIX) ? payloadSchema.parse(JSON.parse(candidate.slice(PREFIX.length))) : readConnectionLink(candidate);
      if (payload.pairingId !== id) continue;
      const next = connectionSchema.parse({ ...current, url: payload.url });
      matches.set(next.url, next);
    } catch { /* Ignore surrounding chat text, never an invalid connection. */ }
  }
  if (matches.size !== 1) throw new Error('connect.invalidCode');
  return [...matches.values()][0];
}

export async function buildAgentSetupPrompt(agent: string, connection: AgentConnection, language: string): Promise<string> {
  const tools = await toolTokenFor(connection.token);
  const config = agent === 'codex' || agent === 'chatgpt'
    ? 'Codex: merge [mcp_servers.gymnotes] in ~/.codex/config.toml (TOML, not JSON).'
    : agent === 'claudecode' ? 'Claude Code: merge mcpServers.gymnotes in the project .mcp.json (JSON).'
      : agent === 'gemini' ? 'Gemini CLI: merge mcpServers.gymnotes in ~/.gemini/settings.json (JSON).'
        : 'Claude Desktop or another local MCP client: merge mcpServers.gymnotes in its supported configuration.';
  return [
    language === 'pt-BR' ? `Conecte meu GymNotes ao ${agent}. Faca a configuracao. Responda em portugues.` : `Connect my GymNotes to ${agent} and complete the setup for me.`,
    'Use a local computer agent, not a cloud-only chat. Reuse or clone https://github.com/ompo-dev/Gym.git without overwriting existing changes; install dependencies if missing. Start `npm run connect -- --setup` in the background with this variable in the process environment only:',
    `GYMNOTES_PAIRING_TOKEN=${connection.token}`,
    'Windows setup requests administrator consent for GymNotes-only LocalSubnet rules: TCP 3847 for the peer and UDP 5353 for local discovery, without disabling rules or changing network profiles. Do not bypass a declined consent, expose public ports or tunnels, print/commit keys, or kill an unrelated process. If a matching protocol-2 bridge is already running, reuse it.',
    'Configure the local MCP server gymnotes: command=node; args=[resolve the checkout absolute scripts/gymnotes-connect.mjs path,"--mcp"]. Keep all other settings.',
    config,
    `MCP environment: GYMNOTES_CONNECT_TOKEN=${tools}; GYMNOTES_CONNECT_URL=http://127.0.0.1:3847`,
    `Permission: ${connection.allowWrites ? 'reading and creating notes' : 'read-only'}. Never expand it. The app automatically discovers its peer through _gymnotes._tcp on the same LAN and authenticates protocol 2. Keep discovery enabled. Do not require the user to paste JSON, codes, IPs or a return prompt. Ask only to return to GymNotes and keep it open. A private /connect link is a fallback, not the normal flow.`,
    'Verify authenticated GET /api/v1/tools reports connected=true and GET /api/v1/ping returns ok=true. Until then say waiting for the app, not connected. Do not read health data or trigger paid inference to test setup. Account login, models and effort stay inside the same GymNotes connection screen; credentials stay on the computer. If the existing checkout predates protocol 2, update it without discarding changes or use a separate current checkout.',
  ].join('\n\n');
}
