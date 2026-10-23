import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { homedir, networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import { spawn } from 'node:child_process';
import { agentRequestSchema, createAgentManager } from './agent-runtime.mjs';
import { prepareLocalAgentNetwork } from './local-agent-network.mjs';
import { watchPeerDiscovery } from './peer-discovery.mjs';
import { createCompanionQueue } from './companion-queue.mjs';
import { installCompanion, startInstalledCompanion } from './companion-service.mjs';

const MAX_BODY = 262_144;
const keySchema = z.string().regex(/^[a-f0-9]{64}$/i);
export const deriveToolToken = (token) => createHash('sha256').update(`gymnotes-tools-v1:${token}`).digest('hex');
export const derivePairingId = (token) => createHash('sha256').update(`gymnotes-pairing-v1:${keySchema.parse(token)}`).digest('hex');
export const pairingCode = (token, url) => `gymnotes-connect:v1:${JSON.stringify({ url,
  pairingId: derivePairingId(token) })}`;
export function pairingLink(token, socketURL) {
  const url = new URL(socketURL);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = '/connect';
  url.search = new URLSearchParams({ pairingId: derivePairingId(token) }).toString();
  return url.toString();
}
const htmlEscape = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const callSchema = z.object({ name: z.string().min(1).max(80),
  arguments: z.record(z.string(), z.unknown()).default({}), requestId: z.string().min(1).max(100).optional() });
const helloSchema = z.object({ type: z.literal('hello'), token: keySchema.optional(),
  nonce: keySchema.optional(), proof: keySchema.optional(),
  timeZone: z.string().max(100).optional(),
  tools: z.array(z.object({ name: z.string().max(80), description: z.string().max(2000),
    parameters: z.record(z.string(), z.unknown()) })).max(30) });

function sameKey(a, b) {
  if (typeof a !== 'string') return false;
  const actual = Buffer.from(a);
  const expected = Buffer.from(b);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Tool forwarding keeps the diary in the app; OAuth credentials stay with the agents. */
export function createBridge({ token, host = '127.0.0.1', port = 3847, timeoutMs = 30_000, agentFactory, advertise = false, discoveryFactory, queuePath, backgroundManaged = false }) {
  keySchema.parse(token);
  const toolToken = deriveToolToken(token);
  const hosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) if (address.family === 'IPv4') hosts.add(address.address);
  }
  let app = null;
  let catalog = [];
  const pending = new Map();
  const agents = createAgentManager({ factory: agentFactory });
  const queue = queuePath ? createCompanionQueue({ path: queuePath, token }) : null;
  const deliveries = new Map();
  let flushing = false;
  let closing = false;
  let retryDelivery;
  let stopDiscovery;
  const allowed = (request) => {
    try {
      for (const addresses of Object.values(networkInterfaces())) {
        for (const address of addresses ?? []) if (address.family === 'IPv4') hosts.add(address.address);
      }
      const hostURL = new URL(`http://${request.headers.host}`);
      if (!hosts.has(hostURL.hostname) || hostURL.username || hostURL.password || hostURL.pathname !== '/' || hostURL.search || hostURL.hash) return false;
      const origin = request.headers.origin;
      if (!origin) return true;
      const originURL = new URL(origin);
      return ['http:', 'https:'].includes(originURL.protocol) && hosts.has(originURL.hostname) && !originURL.username && !originURL.password && originURL.origin === origin;
    } catch { return false; }
  };
  const requestApp = (payload, id = randomUUID()) => {
    if (!app || app.readyState !== WebSocket.OPEN) throw new Error('app-offline');
    if (pending.size >= 32) throw new Error('busy');
    if (pending.has(id)) throw new Error('request-in-progress');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('app-timeout')); }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      app.send(JSON.stringify({ ...payload, id }));
    });
  };
  const queuedResult = (id) => ({ ok: true, queued: true, requestId: id,
    message: 'Saved in the encrypted local queue. Not yet delivered to GymNotes; it will be sent when the app reconnects.' });
  const deliver = (item) => {
    if (deliveries.has(item.id)) return deliveries.get(item.id);
    const operation = (async () => {
      if (!app || app.readyState !== WebSocket.OPEN) return queuedResult(item.id);
      if (!catalog.some((tool) => tool.name === 'addEntries')) {
        const result = { ok: false, error: 'connect.readOnly' };
        await queue.settle(item.id, result);
        return result;
      }
      try {
        const result = await requestApp({ type: 'call', name: 'addEntries', arguments: item.arguments }, item.id);
        if (['connect.disconnected', 'connect.deliveryPending', 'connect.busy'].includes(result?.error)) return queuedResult(item.id);
        await queue.settle(item.id, result);
        return result;
      } catch { return queuedResult(item.id); }
    })().finally(() => deliveries.delete(item.id));
    deliveries.set(item.id, operation);
    return operation;
  };
  const flush = async () => {
    if (!queue || flushing || closing) return;
    flushing = true;
    try {
      for (const item of queue.pending()) {
        if (closing || !app || app.readyState !== WebSocket.OPEN) break;
        if ((await deliver(item)).queued) break;
      }
    } catch { console.error('GymNotes: fila local aguardando nova tentativa.'); }
    finally {
      flushing = false;
      if (!closing && queue.count() && app?.readyState === WebSocket.OPEN) {
        clearTimeout(retryDelivery);
        retryDelivery = setTimeout(() => { void flush(); }, 5000);
        retryDelivery.unref();
      }
    }
  };
  const invoke = async (raw) => {
    const call = callSchema.parse(raw);
    if (queue && call.name === 'addEntries') {
      const item = await queue.enqueue(call.requestId ?? randomUUID(), call.arguments);
      if (item.status !== 'pending') return item.result;
      return deliver(item);
    }
    if (!app || app.readyState !== WebSocket.OPEN) throw new Error('app-offline');
    if (!catalog.some((tool) => tool.name === call.name)) throw new Error('tool-unavailable');
    return requestApp({ type: 'call', name: call.name, arguments: call.arguments }, call.requestId);
  };
  const server = createServer(async (req, res) => {
    const reply = (status, value) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store',
        'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(value));
    };
    if (!allowed(req)) return reply(403, { error: 'origin-not-allowed' });
    let target;
    try { target = new URL(req.url, `http://${req.headers.host}`); }
    catch { return reply(400, { error: 'invalid-request' }); }
    if (req.url === '/app-icon.png' && req.method === 'GET') {
      try {
        const icon = await readFile(new URL('../assets/images/gym/dark-icon.png', import.meta.url));
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        res.end(icon);
      } catch { reply(404, { error: 'not-found' }); }
      return;
    }
    if (target.pathname === '/connect' && req.method === 'GET') {
      const id = derivePairingId(token);
      if (target.searchParams.size !== 1 || !sameKey(target.searchParams.get('pairingId'), id)) return reply(403, { error: 'invalid-pairing' });
      const socketURL = `ws://${req.headers.host}/app`;
      const deepLink = `gym://connect?${new URLSearchParams({ url: socketURL, pairingId: id })}`;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
        'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" });
      res.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conectar GymNotes</title><style>*{box-sizing:border-box}body{font:17px system-ui;margin:0;background:#202020;color:#fff}main{max-width:468px;margin:12vh auto;padding:24px}img{display:block;width:72px;height:72px}h1{font-size:28px;margin:20px 0 12px}p{line-height:1.5;color:#ccc}a{display:block;margin-top:28px;padding:16px;background:#f0b648;color:#111;text-decoration:none;border-radius:8px;text-align:center;font-weight:600}a:focus-visible{outline:3px solid #fff;outline-offset:4px}.hint{font-size:14px;margin-top:24px;color:#aaa}</style><main><img src="/app-icon.png" alt="" width="72" height="72"><h1>GymNotes</h1><p>Computador pronto. Abra o app para concluir a conex&#227;o.</p><a href="${htmlEscape(deepLink)}">Abrir GymNotes e conectar</a><p class="hint">Use a mesma rede Wi-Fi e mantenha o app aberto. Se o app ainda n&#227;o reconhecer este link, atualize o GymNotes e tente novamente.</p></main></html>`);
      return;
    }
    if (!sameKey(req.headers.authorization, `Bearer ${toolToken}`)) return reply(401, { error: 'unauthorized' });
    if (req.url === '/api/v1/peer' && req.method === 'GET') return reply(200, { protocol: 2, discovery: advertise, durableQueue: !!queue, backgroundManaged });
    if (req.url === '/api/v1/tools' && req.method === 'GET') {
      const connected = app?.readyState === WebSocket.OPEN;
      return reply(200, { connected, tools: connected ? catalog : queue?.catalog().filter((tool) => tool.name === 'addEntries') ?? [] });
    }
    if (req.url === '/api/v1/queue' && req.method === 'GET') return reply(200, { pending: queue?.count() ?? 0 });
    if (req.url === '/api/v1/ping' && req.method === 'GET') {
      try { return reply(200, await requestApp({ type: 'ping' })); }
      catch { return reply(503, { error: 'app-offline' }); }
    }
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
      const known = ['app-offline', 'tool-unavailable', 'busy', 'app-timeout', 'request-in-progress', 'request-conflict', 'queue-full', 'queue-corrupt'];
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
    const nonce = randomBytes(32).toString('hex');
    let clientNonce = null;
    const proof = (side) => createHmac('sha256', Buffer.from(token, 'hex')).update(`gymnotes-${side}-v2:${clientNonce}:${nonce}`).digest('hex');
    const agentCalls = new Map();
    let alive = true;
    const authTimer = setTimeout(() => client.close(1008), 5000);
    client.on('pong', () => { alive = true; });
    const heartbeat = setInterval(() => {
      if (!alive) return client.terminate();
      alive = false;
      client.ping();
    }, 15_000);
    client.on('message', async (bytes) => {
      try {
        const message = JSON.parse(bytes.toString());
        if (!authenticated) {
          if (message.type === 'init' && !clientNonce && keySchema.safeParse(message.nonce).success) {
            clientNonce = message.nonce;
            client.send(JSON.stringify({ type: 'challenge', nonce, proof: proof('server') }));
            return;
          }
          const hello = helloSchema.safeParse(message);
          const valid = hello.success && (hello.data.token ? sameKey(hello.data.token, token) :
            clientNonce && hello.data.nonce === nonce && sameKey(hello.data.proof, proof('app')));
          if (!valid) return client.close(1008, 'wrong-key');
          if (app) return client.close(1008, 'app-in-use');
          clearTimeout(authTimer);
          authenticated = true;
          app = client;
          catalog = hello.data.tools;
          if (queue) await queue.remember(catalog, hello.data.timeZone);
          client.send(JSON.stringify({ type: 'ready' }));
          void flush();
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
    start: async () => { await queue?.ready; return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        if (advertise) {
          try { stopDiscovery = watchPeerDiscovery(token, server.address().port, discoveryFactory); }
          catch { console.error('GymNotes: descoberta local indisponivel.'); }
        }
        resolve(server.address());
      });
    }); },
    close: async () => {
      closing = true;
      clearTimeout(retryDelivery);
      stopDiscovery?.();
      for (const client of ws.clients) client.terminate();
      ws.close();
      await agents.close();
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
  let lastStart = 0;
  const api = async (path, body) => {
    if (url.port === '3847' && Date.now() - lastStart > 15_000) {
      lastStart = Date.now();
      try {
        await fetch(new URL('/api/v1/peer', url), { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(1000) });
      } catch {
        if (await startInstalledCompanion()) {
          for (let attempt = 0; attempt < 20; attempt++) {
            try {
              await fetch(new URL('/api/v1/peer', url), { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(500), redirect: 'error' });
              break;
            } catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
          }
        }
      }
    }
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
    try {
      const { tools } = await api('tools');
      return { tools: tools.map(({ name, description, parameters }) => ({ name, description, inputSchema: parameters,
        annotations: { readOnlyHint: name !== 'addEntries', destructiveHint: false, openWorldHint: name === 'addEntries' } })) };
    } catch { return { tools: [] }; }
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
    if (process.argv.includes('--setup')) {
      const runtime = await prepareLocalAgentNetwork();
      const existing = await fetch('http://127.0.0.1:3847/api/v1/peer', {
        headers: { authorization: `Bearer ${deriveToolToken(token)}` }, signal: AbortSignal.timeout(2000), redirect: 'error',
      }).catch((error) => {
        if (error.cause?.code === 'ECONNREFUSED') return null;
        throw new Error('connect.portConflict');
      });
      const peer = existing?.ok ? await existing.json() : null;
      if (existing && (!existing.ok || peer?.protocol !== 2)) throw new Error('connect.portConflict');
      if (process.platform === 'win32') {
        await installCompanion({ token, runtime, script: fileURLToPath(import.meta.url),
          replaceVerifiedPeer: !!peer && (!peer.durableQueue || !peer.discovery || !peer.backgroundManaged) });
        let ready = false;
        for (let attempt = 0; attempt < 80; attempt++) {
          const current = await fetch('http://127.0.0.1:3847/api/v1/peer', {
            headers: { authorization: `Bearer ${deriveToolToken(token)}` }, signal: AbortSignal.timeout(1000), redirect: 'error',
          }).then((response) => response.ok ? response.json() : null).catch(() => null);
          if (current?.protocol === 2 && current.durableQueue && current.discovery && current.backgroundManaged) { ready = true; break; }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (!ready) throw new Error('connect.serviceFailed');
        console.error('GymNotes: conexao em segundo plano pronta. Inicia com o Windows, sem terminal. Volte ao app na mesma rede.');
      } else if (!peer) {
        const child = spawn(runtime, [fileURLToPath(import.meta.url), '--lan'], {
          cwd: resolve(fileURLToPath(new URL('..', import.meta.url))),
          env: { ...process.env, GYMNOTES_PAIRING_TOKEN: token }, detached: true, stdio: 'ignore',
        });
        await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
        child.unref();
        console.error('GymNotes: conexao iniciada sem terminal. Inicio automatico disponivel no Windows.');
      }
    }
    else if (process.argv.includes('--mcp')) await serveMCP(token, process.env.GYMNOTES_CONNECT_URL ?? 'http://127.0.0.1:3847');
    else {
      const host = process.argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1';
      const bridge = createBridge({ token, host, advertise: host === '0.0.0.0',
        backgroundManaged: process.env.GYMNOTES_COMPANION_SERVICE === '1',
        queuePath: join(homedir(), '.gymnotes', 'queue', `${derivePairingId(token)}.bin`) });
      try { await bridge.start(); }
      catch (error) { if (error.code === 'EADDRINUSE') process.exitCode = 2; throw error; }
      console.error('GymNotes: ponte local pronta na porta 3847. Pedidos pendentes ficam na fila local criptografada.');
      if (host === '0.0.0.0') console.error('P2P ativo: volte ao GymNotes na mesma rede. O pareamento e automatico.');
      if (host === '0.0.0.0') {
        for (const addresses of Object.values(networkInterfaces())) for (const address of addresses ?? []) {
          if (address.family === 'IPv4' && !address.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(address.address)) {
            console.error(`Abrir no iPhone/Android: ${pairingLink(token, `ws://${address.address}:3847/app`)}`);
          }
        }
      }
      console.error(pairingCode(token, 'ws://127.0.0.1:3847/app'));
      const stop = async () => { await bridge.close(); process.exit(0); };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    }
  } catch (error) {
    console.error(error.message === 'connect.portConflict'
      ? 'A porta 3847 pertence a outra conexao. Nada foi encerrado.'
      : 'Nao foi possivel iniciar o GymNotes. Verifique o pareamento, a inicializacao local e a porta 3847.');
    process.exitCode ||= 1;
  }
}
