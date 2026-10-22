import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHmac, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { request } from 'node:http';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { WebSocket } from 'ws';

import { createBridge, derivePairingId, deriveToolToken, pairingCode, pairingLink } from '../gymnotes-connect.mjs';

const token = 'a'.repeat(64);
const toolToken = deriveToolToken(token);
test('public connection code contains no pairing or tools secret', () => {
  const code = pairingCode(token, 'ws://192.168.1.10:3847/app');
  assert.ok(code.startsWith('gymnotes-connect:v1:'));
  assert.ok(!code.includes(token));
  assert.ok(!code.includes(toolToken));
  const data = JSON.parse(code.slice('gymnotes-connect:v1:'.length));
  assert.equal(data.url, 'ws://192.168.1.10:3847/app');
  assert.match(data.pairingId, /^[a-f0-9]{64}$/);
});
const tools = [{ name: 'readDay', description: 'Read the diary', parameters: { type: 'object', properties: { domain: { type: 'string' } } } }];
async function setup(t, options = {}) {
  const bridge = createBridge({ token, port: 0, ...options });
  const address = await bridge.start();
  t.after(() => bridge.close());
  const base = `http://127.0.0.1:${address.port}`;
  const api = (path, body, headers = {}) => fetch(`${base}/api/v1/${path}`, {
    method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${toolToken}`, 'content-type': 'application/json', ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { base, api };
}
async function pair(base, key = token, catalog = tools) {
  const app = new WebSocket(`${base.replace('http:', 'ws:')}/app`);
  const received = once(app, 'message');
  await once(app, 'open');
  const clientNonce = randomBytes(32).toString('hex');
  app.send(JSON.stringify({ type: 'init', nonce: clientNonce }));
  const [bytes] = await received;
  const challenge = JSON.parse(bytes.toString());
  assert.equal(challenge.type, 'challenge');
  assert.equal(challenge.proof, createHmac('sha256', Buffer.from(token, 'hex')).update(`gymnotes-server-v2:${clientNonce}:${challenge.nonce}`).digest('hex'));
  app.send(JSON.stringify({ type: 'hello', nonce: challenge.nonce,
    proof: createHmac('sha256', Buffer.from(key, 'hex')).update(`gymnotes-app-v2:${clientNonce}:${challenge.nonce}`).digest('hex'), tools: catalog }));
  return app;
}

test('REST requires bearer authentication, rejects foreign origins and does not claim an offline app is connected', async (t) => {
  const { api } = await setup(t);
  assert.equal((await api('tools', null, { authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await api('tools', null, { authorization: `Bearer ${token}` })).status, 401);
  assert.equal((await api('tools', null, { authorization: 'Bearer ' + 'é'.repeat(64) })).status, 401);
  assert.equal((await api('tools', null, { origin: 'https://attacker.example' })).status, 403);
  assert.deepEqual(await (await api('tools')).json(), { connected: false, tools: [] });
  assert.equal((await api('call', { name: 'readDay', arguments: {} })).status, 503);
});

test('a wrong WebSocket credential is rejected and never exposes tools', async (t) => {
  const { base, api } = await setup(t);
  const app = await pair(base, toolToken);
  const [code, reason] = await once(app, 'close');
  assert.equal(code, 1008);
  assert.equal(reason.toString(), 'wrong-key');
  assert.deepEqual(await (await api('tools')).json(), { connected: false, tools: [] });
});

test('REST calls reach the paired app and only return its result', async (t) => {
  const { base, api } = await setup(t);
  const app = await pair(base);
  await once(app, 'message');
  const catalog = await (await api('tools')).json();
  assert.equal(catalog.connected, true);
  assert.equal(catalog.tools[0].name, 'readDay');
  assert.equal((await api('call', { name: 'addEntries', arguments: {} })).status, 503);
  app.on('message', (bytes) => {
    const call = JSON.parse(bytes.toString());
    if (call.type === 'call') app.send(JSON.stringify({ type: 'result', id: call.id, result: { ok: true, data: { calories: 650 } } }));
  });
  const response = await api('call', { name: 'readDay', arguments: { domain: 'food' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, data: { calories: 650 } });
});

test('missing app replies time out; disconnection clears advertised tools', async (t) => {
  const { base, api } = await setup(t, { timeoutMs: 40 });
  const app = await pair(base);
  await once(app, 'message');
  const response = await api('call', { name: 'readDay', arguments: {} });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'app-timeout');
  app.close();
  await once(app, 'close');
  assert.deepEqual(await (await api('tools')).json(), { connected: false, tools: [] });
});

test('a second app cannot hijack an already paired session', async (t) => {
  const { base, api } = await setup(t);
  const first = await pair(base);
  await once(first, 'message');
  const second = await pair(base);
  const [code, reason] = await once(second, 'close');
  assert.equal(code, 1008);
  assert.equal(reason.toString(), 'app-in-use');
  assert.equal((await (await api('tools')).json()).connected, true);
});

test('MCP stdio initialization, tool discovery and tool execution use the official SDK', { timeout: 15_000 }, async (t) => {
  const { base } = await setup(t);
  const app = await pair(base);
  await once(app, 'message');
  app.on('message', (bytes) => {
    const call = JSON.parse(bytes.toString());
    if (call.type === 'call') app.send(JSON.stringify({ type: 'result', id: call.id,
      result: { ok: true, data: { domain: call.arguments.domain, calories: 650 } } }));
  });
  const child = spawn(process.execPath, [resolve('scripts/gymnotes-connect.mjs'), '--mcp'], {
    env: { ...process.env, GYMNOTES_CONNECT_TOKEN: toolToken, GYMNOTES_CONNECT_URL: base }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(() => { child.kill(); });
  const reader = createInterface({ input: child.stdout });
  const pending = new Map();
  reader.on('line', (line) => {
    const response = JSON.parse(line);
    const request = pending.get(response.id);
    if (request) { pending.delete(response.id); request(response); }
  });
  const rpc = (id, method, params) => new Promise((resolve) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const init = await rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } });
  assert.equal(init.result.serverInfo.name, 'gymnotes');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const list = await rpc(2, 'tools/list', {});
  assert.equal(list.result.tools[0].name, 'readDay');
  const call = await rpc(3, 'tools/call', { name: 'readDay', arguments: { domain: 'food' } });
  assert.equal(call.result.isError, false, JSON.stringify(call));
  assert.deepEqual(JSON.parse(call.result.content[0].text), { ok: true, data: { domain: 'food', calories: 650 } });
});

test('the phone landing page opens the app without publishing either secret', async (t) => {
  const { base } = await setup(t);
  const link = pairingLink(token, `${base.replace('http:', 'ws:')}/app`);
  assert.equal(new URL(link).pathname, '/connect');
  const response = await fetch(link);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
  const html = await response.text();
  assert.ok(!html.includes(token));
  assert.ok(!html.includes(toolToken));
  assert.ok(!html.includes('<script'));
  const href = html.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&');
  const appLink = new URL(href);
  assert.equal(appLink.protocol, 'gym:');
  assert.equal(appLink.hostname, 'connect');
  assert.equal(appLink.searchParams.get('url'), `${base.replace('http:', 'ws:')}/app`);
  assert.equal(appLink.searchParams.get('pairingId'), derivePairingId(token));
  const image = await fetch(`${base}/app-icon.png`);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await image.arrayBuffer()).subarray(1, 4).toString(), 'PNG');
});

test('landing rejects unknown invites, extra fields and untrusted origins', async (t) => {
  const { base } = await setup(t);
  const link = pairingLink(token, `${base.replace('http:', 'ws:')}/app`);
  for (const bad of [link.replace(derivePairingId(token), 'b'.repeat(64)), link + '&token=bad',
    link + `&pairingId=${derivePairingId(token)}`, `${base}/connect`]) {
    assert.equal((await fetch(bad)).status, 403);
  }
  assert.equal((await fetch(link, { headers: { origin: 'https://attacker.example' } })).status, 403);
});

test('authenticated connectivity test verifies a real app round trip without reading the diary', async (t) => {
  const { base, api } = await setup(t);
  assert.equal((await api('ping')).status, 503);
  assert.equal((await api('ping', null, { authorization: '' })).status, 401);
  const app = await pair(base);
  await once(app, 'message');
  app.on('message', (bytes) => {
    const message = JSON.parse(bytes.toString());
    assert.equal(message.type, 'ping');
    assert.equal(message.name, undefined);
    app.send(JSON.stringify({ type: 'result', id: message.id, result: { ok: true, data: { connected: true } } }));
  });
  const response = await api('ping');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, data: { connected: true } });
});

test('an app which authenticates but does not answer the probe is not reported as a successful round trip', async (t) => {
  const { base, api } = await setup(t, { timeoutMs: 40 });
  const app = await pair(base);
  await once(app, 'message');
  assert.equal((await api('ping')).status, 503);
});

test('a proof from another socket or from the server direction cannot authenticate an app', async (t) => {
  const { base, api } = await setup(t);
  let previous;
  for (const replay of [false, true]) {
    const app = new WebSocket(`${base.replace('http:', 'ws:')}/app`);
    const received = once(app, 'message');
    await once(app, 'open');
    app.send(JSON.stringify({ type: 'init', nonce: randomBytes(32).toString('hex') }));
    const [bytes] = await received;
    const challenge = JSON.parse(bytes.toString());
    const used = replay ? previous : challenge;
    app.send(JSON.stringify({ type: 'hello', nonce: used.nonce, proof: used.proof, tools }));
    assert.equal((await once(app, 'close'))[0], 1008);
    previous = challenge;
  }
  assert.equal((await (await api('tools')).json()).connected, false);
});

test('LAN mode advertises only a public invitation fingerprint and cleans up discovery', async () => {
  let published;
  let stopped = false;
  const bridge = createBridge({ token, port: 0, advertise: true, discoveryFactory: () => ({
    publish: (service) => { published = service; }, destroy: () => { stopped = true; },
  }) });
  try {
    const address = await bridge.start();
    assert.equal(published.type, 'gymnotes');
    assert.equal(published.protocol, 'tcp');
    assert.equal(published.port, address.port);
    assert.deepEqual(published.txt, { pairingId: derivePairingId(token), protocol: '2' });
    assert.ok(!JSON.stringify(published).includes(token));
    assert.ok(!JSON.stringify(published).includes(toolToken));
  } finally { await bridge.close(); }
  assert.equal(stopped, true);
});

test('a malformed unauthenticated request target cannot crash the peer', async (t) => {
  const { base, api } = await setup(t);
  const status = await new Promise((resolve, reject) => {
    const req = request(base, { path: 'http://[' }, (response) => { response.resume(); resolve(response.statusCode); });
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 400);
  assert.equal((await api('tools')).status, 200);
});

test('an explicitly paired legacy phone still connects without discovery or a new handshake', async (t) => {
  const { base, api } = await setup(t);
  const app = new WebSocket(`${base.replace('http:', 'ws:')}/app`);
  await once(app, 'open');
  app.send(JSON.stringify({ type: 'hello', token, tools }));
  const [bytes] = await once(app, 'message');
  assert.equal(JSON.parse(bytes.toString()).type, 'ready');
  assert.equal((await (await api('tools')).json()).connected, true);
});
