import assert from 'node:assert/strict';
import { test } from 'node:test';

import { networkSetupEnvironment } from '../local-agent-network.mjs';

test('the Windows installer gets neither PowerShell 7 module paths nor GymNotes credentials', () => {
  const source = {
    SystemRoot: 'C:\\Windows', PATH: 'fixture-path', CUSTOM_SETTING: 'preserved',
    PSModulePath: 'C:\\PowerShell7\\Modules',
    GYMNOTES_PAIRING_TOKEN: 'fixture-pairing', GYMNOTES_CONNECT_TOKEN: 'fixture-tools',
  };
  const before = structuredClone(source);
  assert.deepEqual(networkSetupEnvironment(source), {
    SystemRoot: source.SystemRoot, PATH: source.PATH, CUSTOM_SETTING: source.CUSTOM_SETTING,
  });
  assert.deepEqual(source, before);
});

test('a clean installer environment is preserved without mutating its source', () => {
  const source = Object.freeze({ SystemRoot: 'C:\\Windows', PATH: 'fixture-path' });
  const env = networkSetupEnvironment(source);
  assert.deepEqual(env, source);
  assert.notEqual(env, source);
});

test('Windows environment names are filtered case-insensitively', () => {
  assert.deepEqual(networkSetupEnvironment({
    PSMODULEPATH: 'fixture-modules', gymnotes_pairing_token: 'fixture-pairing',
    GymNotes_Connect_Token: 'fixture-tools', Path: 'preserved',
  }), { Path: 'preserved' });
});
