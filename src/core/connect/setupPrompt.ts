import * as Crypto from 'expo-crypto';
import { z } from 'zod';

import { connectionSchema, type AgentConnection } from './protocol';

const PREFIX = 'gymnotes-connect:v1:';
const payloadSchema = z.object({ url: z.string().max(300), pairingId: z.string().regex(/^[a-f0-9]{64}$/i).transform((id) => id.toLowerCase()) }).strict();
const digest = async (purpose: string, token: string) => (await Crypto.digestStringAsync(
  Crypto.CryptoDigestAlgorithm.SHA256, `gymnotes-${purpose}-v1:${token}`,
)).toLowerCase();

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
  const candidates = [text, ...(text.match(/gymnotes-connect:v1:\s*\{[^{}]{1,1100}\}(?=\s|`|$)|(?:gym|https?):\/\/[^\s<>"'`()]+/g) ?? [])];
  const matches = new Map<string, AgentConnection>();
  let wrongInvite = false;
  for (const candidate of new Set(candidates)) {
    try {
      const payload = candidate.startsWith(PREFIX) ? payloadSchema.parse(JSON.parse(candidate.slice(PREFIX.length))) : readConnectionLink(candidate);
      const next = connectionSchema.parse({ ...current, url: payload.url });
      if (payload.pairingId !== id) { wrongInvite = true; continue; }
      matches.set(next.url, next);
    } catch { /* Ignore surrounding chat text, never an invalid connection. */ }
  }
  if (matches.size !== 1) throw new Error(matches.size === 0 && wrongInvite ? 'connect.wrongInvite' : 'connect.invalidCode');
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
    'Complete the setup yourself using local execution. Do not ask me to edit paths, keys or commands. A cloud-only ChatGPT/Claude chat cannot reach this private peer or use a local MCP config: explain that limitation instead of claiming success or inventing an OAuth connection. Reuse or clone https://github.com/ompo-dev/Gym.git without overwriting existing changes; use Node.js 22+ and npm ci if dependencies are missing. Start `npm run connect -- --setup` in the background with this variable in the process environment only:',
    `GYMNOTES_PAIRING_TOKEN=${connection.token}`,
    'On Windows --setup installs a hidden current-user companion which starts at sign-in and restarts after failures. Let setup finish and close the terminal; do not keep a terminal window open. Pairing secrets are protected with Windows CurrentUser DPAPI outside Git. MCP can restart the installed companion automatically.',
    'Windows setup requests administrator consent for GymNotes-only LocalSubnet rules: TCP 3847 for the peer and UDP 5353 for local discovery, without disabling rules or changing network profiles. Do not bypass a declined consent, expose public ports or tunnels, print/commit keys, or kill an unrelated process. If a matching protocol-2 bridge is already running, reuse it. If port 3847 belongs to an older GymNotes invitation, first verify its executable and script belong to this checkout and authenticate it with the previous locally stored tools key; replace only that verified companion. Otherwise report the conflict.',
    'Configure the local MCP server gymnotes: command=node; args=[resolve the checkout absolute scripts/gymnotes-connect.mjs path,"--mcp"]. Keep all other settings.',
    config,
    `MCP environment: GYMNOTES_CONNECT_TOKEN=${tools}; GYMNOTES_CONNECT_URL=http://127.0.0.1:3847`,
    `Permission: ${connection.allowWrites ? 'reading and creating notes' : 'read-only'}. Never expand it. The app automatically discovers its peer through _gymnotes._tcp on the same LAN and authenticates protocol 2. Keep discovery enabled. Do not require the user to paste JSON, codes, IPs or a return prompt. Ask only to return to GymNotes and keep it open. A private /connect link is a fallback, not the normal flow.`,
    'After the first authenticated write grant, addEntries remains available while the phone is offline. The companion stores pending notes in an encrypted local queue and delivers them when the app reconnects. A response with queued=true means pending, NOT recorded in the phone. Do not claim nutrition is finished. Offline reads are unavailable. With the computer off, requests wait until it is available again; a cloud chat cannot bypass that. iOS does not keep a force-closed app connected.',
    'Verify authenticated GET /api/v1/tools reports connected=true and GET /api/v1/ping returns ok=true. Until then say waiting for the app, not connected. Do not read health data or trigger paid inference to test setup. Account login, models and effort stay inside the same GymNotes connection screen; credentials stay on the computer. If the existing checkout predates protocol 2, update it without discarding changes or use a separate current checkout.',
  ].join('\n\n');
}
