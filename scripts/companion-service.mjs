import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkSetupEnvironment } from './local-agent-network.mjs';

const launcher = fileURLToPath(new URL('./companion-service.ps1', import.meta.url));
export const companionConfigPath = join(homedir(), '.gymnotes', 'companion', 'settings.dpapi');
export const serviceArguments = (mode, path = companionConfigPath) => [
  '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'RemoteSigned', '-File', launcher,
  '-Mode', mode, '-ConfigPath', path,
];

function run(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', args, { windowsHide: true, env: networkSetupEnvironment(), stdio: ['pipe', 'ignore', 'ignore'] });
    child.once('error', () => reject(new Error('connect.serviceFailed')));
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error('connect.serviceFailed')));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

export async function installCompanion({ token, runtime, script, replaceVerifiedPeer = false }) {
  if (process.platform !== 'win32') throw new Error('connect.startupUnsupported');
  const npm = process.env.npm_execpath ?? process.env.GYMNOTES_NPM_CLI;
  if (!npm) throw new Error('connect.npmUnavailable');
  await run(serviceArguments('Install'), JSON.stringify({ token, runtime, script, npm }));
  if (replaceVerifiedPeer) await run(serviceArguments('Verify'));
  await startInstalledCompanion();
}

export async function startInstalledCompanion() {
  if (process.platform !== 'win32') return false;
  try { await access(companionConfigPath); } catch { return false; }
  await run(serviceArguments('Start'));
  return true;
}
