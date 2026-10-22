import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** A dedicated signed runtime lets the firewall grant only GymNotes, never all Node apps. */
export async function prepareLocalAgentNetwork() {
  if (process.platform !== 'win32') return process.execPath;
  const directory = join(homedir(), '.gymnotes', 'runtime');
  const runtime = join(directory, 'gymnotes-node.exe');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (resolve(process.execPath) !== resolve(runtime)) {
    const source = await readFile(process.execPath);
    const existing = await readFile(runtime).catch(() => null);
    if (!existing || hash(existing) !== hash(source)) await copyFile(process.execPath, runtime);
  }
  const script = join(dirname(fileURLToPath(import.meta.url)), 'install-local-agent-network.ps1');
  await new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'RemoteSigned', '-File', script, '-RuntimePath', runtime], {
      windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr.resume();
    child.once('error', () => reject(new Error('connect.networkSetupFailed')));
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error('connect.networkSetupFailed')));
  });
  return runtime;
}
