import { log } from '@/core/log';
import type { AiHttpRequest, AiHttpResponse } from './http';

let sequence = 0;

// SDK 57's buffered expo/fetch reader can hang after a mid-response failure.
// RN's supported XHR transport settles on load/error/abort without that reader.
export function requestAiText(url: string, init: AiHttpRequest): Promise<AiHttpResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const started = Date.now();
    const host = new URL(url).host;
    const requestId = ++sequence;
    let settled = false;
    const finish = (result?: AiHttpResponse, error?: Error) => {
      if (settled) return;
      settled = true;
      init.signal?.removeEventListener('abort', abort);
      xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = xhr.onreadystatechange = null;
      xhr.upload.onload = null;
      log.ai('http.complete', { requestId, host, status: xhr.status, elapsedMs: Date.now() - started, failed: !!error });
      if (error) reject(error); else resolve(result!);
    };
    const abort = () => {
      const error = new Error('enrich.timeout');
      error.name = 'AbortError';
      finish(undefined, error);
      xhr.abort();
    };
    if (init.signal?.aborted) { abort(); return; }
    init.signal?.addEventListener('abort', abort, { once: true });
    try {
      xhr.open(init.method, url, true);
      xhr.responseType = 'text';
      for (const [name, value] of Object.entries(init.headers)) xhr.setRequestHeader(name, value);
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 2) log.ai('http.headers', { requestId, host, status: xhr.status, elapsedMs: Date.now() - started });
      };
      xhr.upload.onload = () => log.ai('http.uploaded', { requestId, host, elapsedMs: Date.now() - started });
      xhr.onload = () => finish({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body: xhr.responseText });
      xhr.onerror = () => finish(undefined, new TypeError('Network request failed'));
      xhr.onabort = abort;
      xhr.ontimeout = abort;
      log.ai('http.start', { requestId, host, bytes: init.body.length, transport: 'xhr' });
      xhr.send(init.body);
    } catch (error) { finish(undefined, error instanceof Error ? error : new Error('Network request failed')); }
  });
}
