import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import { agentRequestSchema, createAgentManager } from './agent-runtime.mjs';

const MAX_BODY = 262_144;
const keySchema = z.string().regex(/^[a-f0-9]{64}$/i);
export const deriveToolToken = (token) => createHash('sha256').update(`gymnotes-tools-v1:${token}`).digest('hex');
export const pairingCode = (token, url) => `gymnotes-connect:v1:${JSON.stringify({ url,
  pairingId: createHash('sha256').update(`gymnotes-pairing-v1:${keySchema.parse(token)}`).digest('hex') })}`;
const callSchema = z.object({ name: z.string().min(1).max(80),
  arguments: z.record(z.string(), z.unknown()).default({}), requestId: z.string().min(1).max(100).optional() });
const helloSchema = z.object({ type: z.literal('hello'), token: keySchema,
  tools: z.array(z.object({ name: z.string().max(80), description: z.string().max(2000),
    parameters: z.record(z.string(), z.unknown()) })).max(30) });

function sameKey(a, b) {
  if (typeof a !== 'string') return false;
  const actual = Buffer.from(a);
  const expected = Buffer.from(b);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Tool forwarding keeps the diary in the app; OAuth credentials stay with the agents. */
export function createBridge({ token, host = '127.0.0.1', port = 3847, timeoutMs = 30_000, agentFactory }) {
  keySchema.parse(token);
  const toolToken = deriveToolToken(token);
  const hosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) if (address.family === 'IPv4') hosts.add(address.address);
  }
  let app = null;
  let catalog = [];
  const pending = new Map();
  const allowed = (request) => {
    try {
      if (!hosts.has(new URL(`http://${request.headers.host}`).hostname)) return false;
      const origin = request.headers.origin;
      return !origin || (['http:', 'https:'].includes(new URL(origin).protocol) && hosts.has(new URL(origin).hostname));
    } catch { return false; }
  };
  const invoke = async (raw) => {
    const call = callSchema.parse(raw);
    if (!app || app.readyState !== WebSocket.OPEN) throw new Error('app-offline');
    if (!catalog.some((tool) => tool.name === call.name)) throw new Error('tool-unavailable');
    if (pending.size >= 32) throw new Error('busy');
    const id = call.requestId ?? randomUUID();
    if (pending.has(id)) throw new Error('request-in-progress');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('app-timeout')); }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      app.send(JSON.stringify({ type: 'call', id, name: call.name, arguments: call.arguments }));
    });
  };
  const server = createServer(async (req, res) => {
    const reply = (status, value) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store',
        'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(value));
    };
    if (!allowed(req)) return reply(403, { error: 'origin-not-allowed' });
    if (!sameKey(req.headers.authorization, `Bearer ${toolToken}`)) return reply(401, { error: 'unauthorized' });
    if (req.url === '/api/v1/tools' && req.method === 'GET') return reply(200, { connected: !!app, tools: catalog });
    if (req.url !== '/api/v1/call' || req.method !== 'POST') return reply(404, { error: 'not-found' });
    if (!req.headers['content-type']?.startsWith('application/json')) return reply(415, { error: 'json-required' });
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY) { reply(413, { error: 'request-too-large' }); req.destroy(); return; }
        chunks.push(chunk);
      }
      const call = callSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      if (!call.success) return reply(400, { error: 'invalid-request' });
      return reply(200, await invoke(call.data));
    } catch (error) {
      const known = ['app-offline', 'tool-unavailable', 'busy', 'app-timeout', 'request-in-progress'];
      const reason = known.includes(error.message) ? error.message : 'invalid-request';
      return reply(reason === 'invalid-request' ? 400 : 503, { error: reason });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  const ws = new WebSocketServer({ noServer: true, maxPayload: 12 * 1024 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    if (!allowed(req) || req.url !== '/app' || ws.clients.size >= 4) { socket.destroy(); return; }
    ws.handleUpgrade(req, socket, head, (client) => ws.emit('connection', client));
  });
  ws.on('connection', (client) => {
    let authenticated = false;
    const agents = createAgentManager({ factory: agentFactory });
    const agentCalls = new Map();
    let alive = true;
    const authTimer = setTimeout(() => client.close(1008), 5000);
    client.on('pong', () => { alive = true; });
    const heartbeat = setInterval(() => {
      if (!alive) return client.terminate();
      alive = false;
      client.ping();
    }, 15_000);
    client.on('message', (bytes) => {
      try {
        const message = JSON.parse(bytes.toString());
        if (!authenticated) {
          const hello = helloSchema.safeParse(message);
          if (!hello.success || !sameKey(hello.data.token, token) || app) return client.close(1008);
          clearTimeout(authTimer);
          authenticated = true;
          app = client;
          catalog = hello.data.tools;
          client.send(JSON.stringify({ type: 'ready' }));
          return;
        }
        if (message.type === 'agent.cancel') { agentCalls.get(message.id)?.controller.abort(); return; }
        if (message.type === 'agent.request') {
          if (typeof message.id !== 'string' || !message.id.length || message.id.length > 100) return client.close(1008);
          if (agentCalls.has(message.id)) return;
          const request = agentRequestSchema.safeParse(message.request);
          if (!request.success || agentCalls.size >= 8) {
            client.send(JSON.stringify({ type: 'agent.result', id: message.id, ok: false, error: 'agent.invalidRequest' }));
            return;
          }
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 180_000);
          agentCalls.set(message.id, { controller });
          void agents.handle(request.data, controller.signal).then((data) => {
            if (client.readyState === WebSocket.OPEN && !controller.signal.aborted) client.send(JSON.stringify({ type: 'agent.result', id: message.id, ok: true, data }));
          }).catch((error) => {
            const code = /^agent\.[a-zA-Z]+$/.test(error.message) ? error.message : error.code === -32000 ? 'agent.authRequired' : 'agent.failed';
            if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'agent.result', id: message.id, ok: false, error: controller.signal.aborted ? 'agent.cancelled' : code }));
          }).finally(() => { clearTimeout(timer); agentCalls.delete(message.id); });
          return;
        }
        if (message.type !== 'result' || typeof message.id !== 'string') return client.close(1008);
        const request = pending.get(message.id);
        if (!request) return;
        clearTimeout(request.timer);
        pending.delete(message.id);
        request.resolve(message.result);
      } catch { client.close(1008); }
    });
    client.on('error', () => client.terminate());
    client.on('close', () => {
      clearTimeout(authTimer);
      clearInterval(heartbeat);
      for (const call of agentCalls.values()) call.controller.abort();
      agentCalls.clear();
      void agents.close();
      if (app !== client) return;
      app = null;
      catalog = [];
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error('app-offline'));
      }
      pending.clear();
    });
  });
  return {
    server,
    start: () => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => resolve(server.address())); }),
    close: async () => {
      for (const client of ws.clients) client.terminate();
      ws.close();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function serveMCP(token, endpoint) {
  const { Server } = await import('@modelcontextprotocol/server');
  const { StdioServerTransport } = await import('@modelcontextprotocol/server/stdio');
  const url = new URL(endpoint);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.protocol !== 'http:' || url.username || url.password) {
    throw new Error('MCP bridge must be on localhost.');
  }
  const api = async (path, body) => {
    const response = await fetch(new URL(`/api/v1/${path}`, url), {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(35_000),
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`GymNotes bridge: HTTP ${response.status}`);
    return response.json();
  };
  const server = new Server({ name: 'gymnotes', version: '1.0.0' }, { capabilities: { tools: { listChanged: true } } });
  server.setRequestHandler('tools/list', async () => {
    const { tools } = await api('tools');
    return { tools: tools.map(({ name, description, parameters }) => ({ name, description, inputSchema: parameters,
      annotations: { readOnlyHint: name !== 'addEntries', destructiveHint: false, openWorldHint: name === 'addEntries' } })) };
  });
  server.setRequestHandler('tools/call', async (request) => {
    try {
      const result = await api('call', { name: request.params.name, arguments: request.params.arguments ?? {} });
      return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: !result.ok };
    } catch { return { content: [{ type: 'text', text: 'GymNotes indisponivel. Abra o app e conecte a ponte local.' }], isError: true }; }
  });
  await server.connect(new StdioServerTransport());
  let previous = '';
  const poll = setInterval(async () => {
    try {
      const { tools } = await api('tools');
      const next = JSON.stringify(tools);
      if (next !== previous) { previous = next; await server.notification({ method: 'notifications/tools/list_changed' }); }
    } catch { /* The companion can start after the agent. */ }
  }, 5000);
  server.onclose = () => clearInterval(poll);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let token = process.argv.includes('--mcp') ? process.env.GYMNOTES_CONNECT_TOKEN :
      process.env.GYMNOTES_PAIRING_TOKEN ?? process.env.GYMNOTES_CONNECT_TOKEN;
    if (!token && !process.argv.includes('--mcp')) {
      const input = createInterface({ input: process.stdin, output: process.stderr });
      token = await input.question('Cole a chave criada em Conectar GymNotes: ');
      input.close();
    }
    keySchema.parse(token);
    if (process.argv.includes('--mcp')) await serveMCP(token, process.env.GYMNOTES_CONNECT_URL ?? 'http://127.0.0.1:3847');
    else {
      const host = process.argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1';
      const bridge = createBridge({ token, host });
      await bridge.start();
      console.error('GymNotes: ponte local pronta na porta 3847. Nenhum dado e salvo aqui.');
      if (host === '0.0.0.0') {
        for (const addresses of Object.values(networkInterfaces())) for (const address of addresses ?? []) {
          if (address.family === 'IPv4' && !address.internal) console.error(pairingCode(token, `ws://${address.address}:3847/app`));
        }
      }
      console.error(pairingCode(token, 'ws://127.0.0.1:3847/app'));
      const stop = async () => { await bridge.close(); process.exit(0); };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    }
  } catch { console.error('Nao foi possivel iniciar. Verifique a chave de 64 caracteres e a porta 3847.'); process.exitCode = 1; }
}
