import * as Crypto from 'expo-crypto';
import { log } from '@/core/log';

export type AgentProvider = 'codex' | 'claude' | 'gemini';
export type AgentChoice = string | boolean;
export interface AgentRequest {
  provider: AgentProvider;
  action: 'inspect' | 'authenticate' | 'setOption' | 'generate' | 'logout';
  methodId?: string;
  optionId?: string;
  value?: AgentChoice;
  choices?: Record<string, AgentChoice>;
  messages?: { role: 'system' | 'user'; content: string }[];
  media?: { base64: string; mimeType: string }[];
  responseSchema?: Record<string, unknown>;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
}
interface AgentRPC {
  call: (request: AgentRequest, signal?: AbortSignal) => Promise<unknown>;
  receive: (message: { type?: unknown; id?: unknown; ok?: unknown; data?: unknown; error?: unknown }) => boolean;
  close: () => void;
}
let current: AgentRPC | null = null;

export function isAgentConnected(): boolean {
  return current !== null;
}

export function bindAgentRPC(send: (message: unknown) => void): AgentRPC {
  const pending = new Map<string, Pending>();
  let closed = false;
  const client = {
    call(request: AgentRequest, signal?: AbortSignal): Promise<unknown> {
      if (closed) return Promise.reject(new Error('agent.offline'));
      if (signal?.aborted) return Promise.reject(new Error('agent.cancelled'));
      if (pending.size >= 8) return Promise.reject(new Error('agent.busy'));
      return new Promise((resolve, reject) => {
        const id = Crypto.randomUUID();
        const end = log.time('connect', `agent.${request.action}`, { id, provider: request.provider, media: request.media?.length ?? 0 });
        const cancel = () => {
          pending.delete(id);
          cleanup();
          end({ ok: false, reason: 'agent.cancelled' });
          try { send({ type: 'agent.cancel', id }); } catch { /* Already disconnected. */ }
          reject(new Error('agent.cancelled'));
        };
        const timer = setTimeout(cancel, 180_000);
        const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); };
        pending.set(id, { resolve: (value) => { end({ ok: true }); resolve(value); },
          reject: (error) => { end({ ok: false, reason: error.message }); reject(error); }, cleanup });
        signal?.addEventListener('abort', cancel, { once: true });
        try { send({ type: 'agent.request', id, request }); }
        catch { pending.delete(id); cleanup(); end({ ok: false, reason: 'agent.offline' }); reject(new Error('agent.offline')); }
      });
    },
    receive(message: { type?: unknown; id?: unknown; ok?: unknown; data?: unknown; error?: unknown }): boolean {
      if (message.type !== 'agent.result') return false;
      if (typeof message.id !== 'string') return true;
      const call = pending.get(message.id);
      if (!call) return true;
      pending.delete(message.id); call.cleanup();
      if (message.ok === true) call.resolve(message.data);
      else call.reject(new Error(typeof message.error === 'string' && /^agent\.[a-zA-Z]+$/.test(message.error) ? message.error : 'agent.failed'));
      return true;
    },
    close() {
      closed = true;
      if (current === client) current = null;
      for (const call of pending.values()) { call.cleanup(); call.reject(new Error('agent.offline')); }
      pending.clear();
    },
  };
  current?.close();
  current = client;
  return client;
}

export function requestAgent(request: AgentRequest, signal?: AbortSignal): Promise<unknown> {
  return current ? current.call(request, signal) : Promise.reject(new Error('agent.offline'));
}
