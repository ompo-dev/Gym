import { createHash as mockCreateHash } from 'node:crypto';

import { buildAgentSetupPrompt, importAgentConnection, isAgentConnectionLink, pairingIdFor, toolTokenFor } from './setupPrompt';

jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_algorithm: string, value: string) => mockCreateHash('sha256').update(value).digest('hex'),
}));

const connection = { url: 'ws://127.0.0.1:3847/app', token: 'a'.repeat(64), allowWrites: false };
const code = (url: string, pairingId: string, extra = {}) => `gymnotes-connect:v1:${JSON.stringify({ url, pairingId, ...extra })}`;

test.each(['claude', 'chatgpt', 'claudecode', 'codex', 'gemini', 'mcp'])('ready prompt for %s needs no hand-edited key or path', async (agent) => {
  const prompt = await buildAgentSetupPrompt(agent, connection, 'pt-BR');
  expect(prompt).toContain(`GYMNOTES_PAIRING_TOKEN=${connection.token}`);
  expect(prompt).toContain(`GYMNOTES_CONNECT_TOKEN=${await toolTokenFor(connection.token)}`);
  expect(prompt).toContain('read-only');
  expect(prompt).toContain('https://github.com/ompo-dev/Gym.git');
  expect(prompt).toContain('Responda em portugues');
  expect(prompt).not.toMatch(/SUA_CHAVE|YOUR_KEY|CAMINHO|copilot/i);
});

test('public pairing fingerprint matches the Node companion and cannot grant tools access', async () => {
  const id = await pairingIdFor(connection.token);
  expect(id).toBe(mockCreateHash('sha256').update(`gymnotes-pairing-v1:${connection.token}`).digest('hex'));
  expect(id).not.toBe(connection.token);
  expect(id).not.toBe(await toolTokenFor(connection.token));
  expect(await importAgentConnection(code('ws://192.168.1.10:3847', id), connection))
    .toEqual({ ...connection, url: 'ws://192.168.1.10:3847/app' });
});

test('import cannot replace the secret, change permissions, select a public host or accept another pairing', async () => {
  const id = await pairingIdFor(connection.token);
  for (const bad of ['not a code', code('ws://1.1.1.1', id), code('ws://localhost/app?token=secret', id),
    code('ws://localhost', 'b'.repeat(64)), code('ws://localhost', id, { allowWrites: true }),
    code('ws://localhost', id, { token: 'b'.repeat(64) }), code('ws://localhost', id) + 'x'.repeat(1300)]) {
    await expect(importAgentConnection(bad, connection)).rejects.toThrow();
  }
  expect(connection.allowWrites).toBe(false);
});

test('phone links and complete agent replies preserve the on-device grant', async () => {
  const id = await pairingIdFor(connection.token);
  const landing = `http://192.168.1.10:3847/connect?pairingId=${id}`;
  const deepLink = `gym://connect?${new URLSearchParams({ url: 'ws://192.168.1.10:3847/app', pairingId: id })}`;
  for (const text of [landing, deepLink, `Pronto!\n[Abrir GymNotes](${landing})\nAguardando o app.`,
    `Copie esta linha:\n\x60${code('ws://192.168.1.10:3847/app', id)}\x60`, `${landing}\n${deepLink}`]) {
    expect(await importAgentConnection(text, connection)).toEqual({ ...connection, url: 'ws://192.168.1.10:3847/app' });
  }
  expect(isAgentConnectionLink(deepLink)).toBe(true);
  expect(isAgentConnectionLink('gym://add?text=abc')).toBe(false);
});

test('phone links cannot add credentials, public destinations or ambiguous addresses', async () => {
  const id = await pairingIdFor(connection.token);
  const landing = `http://192.168.1.10:3847/connect?pairingId=${id}`;
  for (const text of [landing + '&token=bad', landing + '#extra', landing.replace('192.168.1.10', 'example.com'),
    landing.replace('192.168.1.10', 'user:pass@192.168.1.10'), landing.replace('/connect?', '/other?'),
    `${landing}\n${landing.replace('192.168.1.10', '192.168.1.11')}`,
    `gym://connect?${new URLSearchParams({ url: 'ws://192.168.1.10:3847/app', pairingId: id, allowWrites: 'true' })}`,
    'x'.repeat(20_001)]) {
    await expect(importAgentConnection(text, connection)).rejects.toThrow('connect.invalidCode');
  }
});

test('setup explicitly verifies an app round trip without reading health data', async () => {
  const prompt = await buildAgentSetupPrompt('codex', connection, 'pt-BR');
  expect(prompt).toContain('npm run connect -- --setup');
  expect(prompt).toContain('LocalSubnet');
  expect(prompt).toContain('GET /api/v1/ping');
  expect(prompt).toContain('not connected');
  expect(prompt).toContain('Do not read health data');
});
