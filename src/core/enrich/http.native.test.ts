const { requestAiText } = jest.requireActual<typeof import('./http.native')>('./http.native.ts');
import { clearLogBuffer, formatLogs } from '@/core/log';

class TestXHR {
  static last: TestXHR;
  status = 0;
  responseText = '';
  responseType = '';
  readyState = 0;
  upload = { onload: null as (() => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onreadystatechange: (() => void) | null = null;
  open = jest.fn();
  send = jest.fn();
  abort = jest.fn(() => this.onabort?.());
  setRequestHeader = jest.fn();
  constructor() { TestXHR.last = this; }
}

const original = global.XMLHttpRequest;
beforeEach(() => { global.XMLHttpRequest = TestXHR as unknown as typeof XMLHttpRequest; clearLogBuffer(); });
afterEach(() => { global.XMLHttpRequest = original; });
const init = { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': 'fixture-key' }, body: JSON.stringify({ image: 'A'.repeat(275948) }) };

test('sends the entire photo body and credentials, then returns a complete response without expo/fetch', async () => {
  const result = requestAiText('https://generativelanguage.googleapis.com/v1beta/interactions', init);
  const xhr = TestXHR.last;
  expect(xhr.open).toHaveBeenCalledWith('POST', expect.any(String), true);
  expect(xhr.setRequestHeader).toHaveBeenCalledWith('x-goog-api-key', 'fixture-key');
  expect(xhr.send).toHaveBeenCalledWith(init.body);
  xhr.upload.onload!();
  xhr.status = 200;
  xhr.readyState = 2; xhr.onreadystatechange!();
  xhr.responseText = '{"output_text":"{}"}';
  xhr.onload!();
  await expect(result).resolves.toEqual({ ok: true, status: 200, body: xhr.responseText });
  expect(xhr.onload).toBeNull();
  expect(formatLogs()).toContain('http.uploaded');
  expect(formatLogs()).toContain('http.headers');
  expect(formatLogs()).toContain('http.complete');
  expect(formatLogs()).not.toContain('fixture-key');
  expect(formatLogs()).not.toContain('AAAA');
});

test('a failure after headers rejects instead of hanging on a native body reader', async () => {
  const result = requestAiText('https://example.com/ai', init);
  const xhr = TestXHR.last;
  xhr.status = 200; xhr.readyState = 2; xhr.onreadystatechange!();
  xhr.onerror!();
  await expect(result).rejects.toThrow('Network request failed');
});

test('aborting after headers settles the request, releases listeners and cancels the native upload', async () => {
  const controller = new AbortController();
  const result = requestAiText('https://example.com/ai', { ...init, signal: controller.signal });
  const xhr = TestXHR.last;
  xhr.readyState = 2; xhr.onreadystatechange!();
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(xhr.abort).toHaveBeenCalledTimes(1);
  expect(xhr.onload).toBeNull();
});

test('an already aborted request sends no photo', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(requestAiText('https://example.com/ai', { ...init, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(TestXHR.last.send).not.toHaveBeenCalled();
});

test('a rejected credential is a complete HTTP response, not a connection failure', async () => {
  const result = requestAiText('https://example.com/ai', init);
  TestXHR.last.status = 401; TestXHR.last.responseText = '{}'; TestXHR.last.onload!();
  await expect(result).resolves.toEqual({ ok: false, status: 401, body: '{}' });
});
