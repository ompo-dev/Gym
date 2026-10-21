import * as Crypto from 'expo-crypto';
import { z } from 'zod';

import { connectionSchema, type AgentConnection } from './protocol';

const PREFIX = 'gymnotes-connect:v1:';
const digest = (purpose: string, token: string) => Crypto.digestStringAsync(
  Crypto.CryptoDigestAlgorithm.SHA256, `gymnotes-${purpose}-v1:${token}`,
);

export const toolTokenFor = (token: string) => digest('tools', token);
export const pairingIdFor = (token: string) => digest('pairing', token);

/** Only the public address and a fingerprint return through the clipboard. */
export async function importAgentConnection(code: string, current: AgentConnection): Promise<AgentConnection> {
  const text = code.trim();
  if (text.length > 1200 || !text.startsWith(PREFIX)) throw new Error('connect.invalidCode');
  const payload = z.object({ url: z.string().max(300), pairingId: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
    .parse(JSON.parse(text.slice(PREFIX.length)));
  if (payload.pairingId !== await pairingIdFor(current.token)) throw new Error('connect.invalidCode');
  return connectionSchema.parse({ ...current, url: payload.url });
}

export async function buildAgentSetupPrompt(agent: string, connection: AgentConnection, language: string): Promise<string> {
  const tools = await toolTokenFor(connection.token);
  const config = agent === 'codex' || agent === 'chatgpt'
    ? 'Codex: merge [mcp_servers.gymnotes] in ~/.codex/config.toml (TOML, not JSON).'
    : agent === 'claudecode' ? 'Claude Code: merge mcpServers.gymnotes in the project .mcp.json (JSON).'
      : agent === 'gemini' ? 'Gemini CLI: merge mcpServers.gymnotes in ~/.gemini/settings.json (JSON).'
        : 'Claude Desktop or another local MCP client: merge mcpServers.gymnotes in its supported configuration.';
  return [
    `Connect my GymNotes app to ${agent}. ${language === 'pt-BR' ? 'Responda em portugues.' : 'Reply in English.'}`,
    'Do the local setup for me; do not ask me to edit paths, generate keys or assemble commands.',
    'This is a local integration, not a hosted remote MCP server. You need permission to run commands on my computer.',
    'If you are a cloud-only chat without local execution, explain that limitation and hand this prompt to Codex, Claude Code, Gemini CLI or a desktop agent. Never claim a connection you cannot reach.',
    '1. Locate an existing GymNotes checkout (origin https://github.com/ompo-dev/Gym.git). Otherwise clone that repository into a new folder. Preserve all existing files and changes. Use Node.js 22+ and npm ci if dependencies are missing.',
    '2. Start npm run connect -- --lan as a background process from the checkout, with this environment variable set ONLY on that process:',
    `GYMNOTES_PAIRING_TOKEN=${connection.token}`,
    'Do not print the pairing key, put it in command-line arguments, commit it or put it into the MCP client configuration. If port 3847 is busy, do not kill or replace an unrelated process; diagnose the conflict first.',
    '3. The bridge prints public gymnotes-connect:v1: connection codes. Return the code for this computer\'s private LAN IPv4 as one plain line for me to copy into GymNotes. If app and agent run on the same computer, use the loopback code. Never invent an IP or use a public URL. Keep the app open on the same trusted network; allow the firewall only on a private network. No tunnels or public ports.',
    '4. Add the local MCP stdio server named gymnotes to this agent. Resolve the checkout\'s absolute scripts/gymnotes-connect.mjs path yourself; command=node, args=[absoluteScriptPath,"--mcp"]. Merge existing configuration, preserving all other servers and settings.',
    config,
    `MCP environment: GYMNOTES_CONNECT_TOKEN=${tools}; GYMNOTES_CONNECT_URL=http://127.0.0.1:3847`,
    'This tools key is deliberately different from the pairing key. Use only the tools key for REST/MCP. Store client secrets locally outside Git and avoid logs. Ask before modifying an unrelated client or user-wide configuration.',
    `5. Permission selected in the app: ${connection.allowWrites ? 'reading and creating notes' : 'read-only; do not create, edit or delete notes'}. Never expand it yourself.`,
    '6. Verify GET http://127.0.0.1:3847/api/v1/tools using Authorization: Bearer followed by the tools key. Wait for connected=true, then verify readGoals through MCP. If the app is offline, say pairing is pending, not successful. Do not read diary entries or transmit health data as part of setup.',
    '7. For direct model use, I will select Enter account in GymNotes. The bridge uses official ACP agents for Codex/ChatGPT, Gemini or Anthropic Console. Login takes place in the computer browser. Keep OAuth credentials on the computer, never paste them into GymNotes or a chat. Models, vision support and reasoning effort must come from the authenticated agent, not invented lists. Do not trigger paid inference just to test setup.',
  ].join('\n\n');
}
