import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agent, methods, PROTOCOL_VERSION, RequestError } from '@agentclientprotocol/sdk/unstable';
import { z } from 'zod';

import { createAgentManager, publicAgentOptions } from '../agent-runtime.mjs';

const options = () => [
  { id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: 'model-a',
    options: [{ value: 'model-a', name: 'A' }, { value: 'model-b', name: 'B' }] },
  { id: 'effort', name: 'Reasoning effort', category: 'thought_level', type: 'select', currentValue: 'medium',
    options: [{ value: 'medium', name: 'Medium' }, { value: 'high', name: 'High' }] },
  { id: 'mode', name: 'Permissions', category: 'mode', type: 'select', currentValue: 'read-only',
    options: [{ value: 'read-only', name: 'Read only' }, { value: 'yolo', name: 'Unsafe' }] },
];

export function fakeAgent({ authenticated = false, image = true, invalidJSON = false, legacy = false, authStatus = false } = {}) {
  const sessions = new Map();
  const calls = { prompts: [], permissions: [], initialized: null, stopped: 0, deleted: [] };
  const factory = async () => {
    const toAgent = new TransformStream();
    const toClient = new TransformStream();
    const app = agent({ name: 'fixture' })
      .onRequest(methods.agent.initialize, ({ params }) => {
        calls.initialized = params;
        return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: { promptCapabilities: { image }, sessionCapabilities: { delete: {} }, auth: { logout: {} },
          ...(authStatus ? { _meta: { authStatus: {} } } : {}) },
          authMethods: [{ id: 'chat-login', name: 'Chat account' }, { id: 'console-login', name: 'Console', type: 'terminal' },
            { id: 'api-key', name: 'API key', type: 'env_var' }] };
      })
      .onRequest(methods.agent.authenticate, () => { authenticated = true; return {}; })
      .onRequest(methods.agent.logout, () => { authenticated = false; return {}; })
      .onRequest(methods.agent.session.new, async ({ params, client }) => {
        if (!authenticated && !authStatus) throw RequestError.authRequired();
        if (authStatus) await client.notify('_auth/status_update', { authStatus: { kind: authenticated ? 'api_key' : 'none' } });
        assert.deepEqual(params.mcpServers, []);
        assert.deepEqual(params._meta.claudeCode.options.tools, []);
        const session = { sessionId: `s-${sessions.size + 1}`, ...(legacy ? { models: { currentModelId: 'model-a',
          availableModels: [{ modelId: 'model-a', name: 'A' }, { modelId: 'model-b', name: 'B' }] } } : { configOptions: options() }) };
        sessions.set(session.sessionId, session);
        return structuredClone(session);
      })
      .onRequest(methods.agent.session.setConfigOption, ({ params }) => {
        const session = sessions.get(params.sessionId);
        session.configOptions.find((option) => option.id === params.configId).currentValue = params.value;
        return { configOptions: session.configOptions };
      })
      .onRequest('session/set_model', z.object({ sessionId: z.string(), modelId: z.string() }), ({ params }) => {
        sessions.get(params.sessionId).models.currentModelId = params.modelId;
        return {};
      })
      .onRequest(methods.agent.session.prompt, async ({ params, client }) => {
        calls.prompts.push(params);
        calls.permissions.push(await client.request(methods.client.session.requestPermission, {
          sessionId: params.sessionId, toolCall: { toolCallId: 'execute', title: 'Run a command' },
          options: [{ optionId: 'yes', name: 'Allow', kind: 'allow_once' }],
        }));
        await assert.rejects(client.request(methods.client.fs.readTextFile, { sessionId: params.sessionId, path: '/private' }));
        await client.notify(methods.client.session.update, { sessionId: params.sessionId,
          update: { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'private reasoning' } } });
        await client.notify(methods.client.session.update, { sessionId: params.sessionId,
          update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: invalidJSON ? 'bad json' : '{"items":[]}' } } });
        return { stopReason: 'end_turn' };
      })
      .onRequest(methods.agent.session.delete, ({ params }) => { calls.deleted.push(params.sessionId); return {}; });
    const connection = app.connect({ writable: toClient.writable, readable: toAgent.readable });
    return { cwd: process.cwd(), target: { writable: toAgent.writable, readable: toClient.readable },
      authenticateTerminal: async () => { authenticated = true; },
      stop: async () => { calls.stopped += 1; connection.close(); } };
  };
  return { factory, calls, sessions };
}

test('ACP login, dynamic models/effort, fresh sessions and image blocks use the official SDK', async (t) => {
  const fake = fakeAgent();
  const manager = createAgentManager(fake);
  t.after(() => manager.close());
  const before = await manager.handle({ provider: 'codex', action: 'inspect' });
  assert.equal(before.authenticated, false);
  assert.equal(before.imageSupported, true);
  assert.equal(before.authMethods.some((method) => method.id === 'api-key'), false);
  assert.equal(fake.calls.initialized.clientCapabilities.terminal, false);
  const signedIn = await manager.handle({ provider: 'codex', action: 'authenticate', methodId: 'chat-login' });
  assert.equal(signedIn.authenticated, true);
  assert.deepEqual(signedIn.options.map((option) => option.id), ['model', 'effort']);
  const changed = await manager.handle({ provider: 'codex', action: 'setOption', optionId: 'effort', value: 'high' });
  assert.equal(changed.options[1].currentValue, 'high');
  const response = await manager.handle({ provider: 'codex', action: 'generate', choices: { model: 'model-b', effort: 'high' },
    messages: [{ role: 'system', content: 'JSON only' }, { role: 'user', content: 'full prompt '.repeat(500) }],
    media: [{ base64: 'dGVzdA==', mimeType: 'image/jpeg' }] });
  assert.deepEqual(response, { json: { items: [] } });
  const prompt = fake.calls.prompts[0];
  assert.notEqual(prompt.sessionId, 's-1');
  assert.equal(prompt.prompt.find((block) => block.type === 'image').mimeType, 'image/jpeg');
  assert.ok(prompt.prompt.some((block) => block.text?.length > 5000));
  assert.equal(fake.sessions.get(prompt.sessionId).configOptions[0].currentValue, 'model-b');
  assert.deepEqual(fake.calls.permissions[0], { outcome: { outcome: 'cancelled' } });
  assert.deepEqual(fake.calls.deleted, [prompt.sessionId]);
  assert.equal((await manager.handle({ provider: 'codex', action: 'logout' })).authenticated, false);
});

test('Claude never offers claude.ai or API-key authentication', async (t) => {
  const manager = createAgentManager(fakeAgent()); t.after(() => manager.close());
  const state = await manager.handle({ provider: 'claude', action: 'inspect' });
  assert.deepEqual(state.authMethods.map((method) => method.id), ['console-login']);
  await assert.rejects(manager.handle({ provider: 'claude', action: 'authenticate', methodId: 'chat-login' }), /authNotSupported/);
  assert.equal((await manager.handle({ provider: 'claude', action: 'authenticate', methodId: 'console-login' })).authenticated, true);
});

test('invalid model choices, unsupported images and malformed JSON fail without a fallback', async (t) => {
  const manager = createAgentManager(fakeAgent({ authenticated: true, image: false, invalidJSON: true }));
  t.after(() => manager.close());
  await assert.rejects(manager.handle({ provider: 'gemini', action: 'setOption', optionId: 'mode', value: 'yolo' }), /invalidOption/);
  await assert.rejects(manager.handle({ provider: 'gemini', action: 'generate', messages: [{ role: 'user', content: 'photo' }],
    media: [{ base64: 'dGVzdA==', mimeType: 'image/png' }] }), /noVision/);
  await assert.rejects(manager.handle({ provider: 'gemini', action: 'generate', messages: [{ role: 'user', content: 'meal' }] }), /invalidResponse/);
});

test('grouped model options flatten without exposing permission or tool modes', () => {
  const grouped = [{ ...options()[0], options: [{ group: 'Family', options: options()[0].options }] }, options()[2]];
  assert.equal(publicAgentOptions(grouped).length, 1);
  assert.deepEqual(publicAgentOptions(grouped)[0].options.map((item) => item.value), ['model-a', 'model-b']);
});

test('legacy model catalog and session/set_model work like the Momor compatibility path', async (t) => {
  const fake = fakeAgent({ authenticated: true, legacy: true });
  const manager = createAgentManager(fake); t.after(() => manager.close());
  const before = await manager.handle({ provider: 'gemini', action: 'inspect' });
  assert.deepEqual(before.options[0].options.map((option) => option.value), ['model-a', 'model-b']);
  const changed = await manager.handle({ provider: 'gemini', action: 'setOption', optionId: 'model', value: 'model-b' });
  assert.equal(changed.options[0].currentValue, 'model-b');
  await assert.rejects(manager.handle({ provider: 'gemini', action: 'setOption', optionId: 'model', value: 'invented' }), /invalidOption/);
  await manager.handle({ provider: 'gemini', action: 'generate', choices: { model: 'model-b' }, messages: [{ role: 'user', content: 'JSON' }] });
  assert.equal(fake.sessions.get(fake.calls.prompts[0].sessionId).models.currentModelId, 'model-b');
});

test('a Claude session and model catalog alone do not prove account authentication', async (t) => {
  const manager = createAgentManager(fakeAgent({ authStatus: true })); t.after(() => manager.close());
  const state = await manager.handle({ provider: 'claude', action: 'inspect' });
  assert.equal(state.authenticated, false);
  await assert.rejects(manager.handle({ provider: 'claude', action: 'generate', messages: [{ role: 'user', content: 'JSON' }] }), /authRequired/);
  assert.equal((await manager.handle({ provider: 'claude', action: 'authenticate', methodId: 'console-login' })).authenticated, true);
});
