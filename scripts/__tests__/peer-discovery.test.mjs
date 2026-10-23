import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { advertisePeer, watchPeerDiscovery } from '../peer-discovery.mjs';

const token = 'a'.repeat(64);
const address = (value, internal = false) => ({ address: value, internal });

test('multicast uses private interfaces even when a VPN is the first/preferred adapter', () => {
  const created = [];
  const stop = advertisePeer(token, 3847, (options) => {
    const record = { options, service: null, stopped: false };
    created.push(record);
    return { publish: (service) => { record.service = service; }, destroy: () => { record.stopped = true; } };
  }, {
    VPN: [address('26.17.55.134')], Ethernet: [address('192.168.1.7')],
    WiFi: [address('10.0.0.8'), address('192.168.1.7')],
    loopback: [address('127.0.0.1', true)], public: [address('203.0.113.3')], ipv6: [address('fe80::1')],
  });
  assert.deepEqual(created.map((value) => value.options), [
    { interface: '10.0.0.8', bind: '0.0.0.0' }, { interface: '192.168.1.7', bind: '0.0.0.0' },
  ]);
  const names = new Set();
  for (const { service } of created) {
    names.add(service.name);
    assert.equal(service.host, `${service.name.toLowerCase()}.local`);
    assert.equal(service.type, 'gymnotes');
    assert.equal(service.port, 3847);
    assert.deepEqual(service.txt, {
      pairingId: createHash('sha256').update(`gymnotes-pairing-v1:${token}`).digest('hex'), protocol: '2',
    });
    assert.ok(!JSON.stringify(service).includes(token));
  }
  assert.equal(names.size, 2);
  stop();
  assert.ok(created.every((value) => value.stopped));
});

test('no LAN never falls back to advertising on a public or VPN route', () => {
  let created = false;
  assert.throws(() => advertisePeer(token, 3847, () => { created = true; }, {
    VPN: [address('26.17.55.134')], loopback: [address('127.0.0.1', true)],
  }), /connect.noLAN/);
  assert.equal(created, false);
});

test('a publish failure releases every previously started interface', () => {
  let closed = 0;
  let attempts = 0;
  assert.throws(() => advertisePeer(token, 3847, () => ({
    publish: () => { if (++attempts === 2) throw new Error('fixture-failure'); },
    destroy: () => { closed += 1; },
  }), { Ethernet: [address('192.168.1.7'), address('10.0.0.8')] }), /fixture-failure/);
  assert.equal(closed, 2);
});

test('discovery waits for Wi-Fi at sign-in and republishes after DHCP changes', () => {
  let interfaces = {};
  let refresh;
  const addresses = [];
  let closed = 0;
  const stop = watchPeerDiscovery(token, 3847, (options) => {
    addresses.push(options.interface);
    return { publish: () => {}, destroy: () => { closed++; } };
  }, () => interfaces, (callback) => { refresh = callback; return { unref() {} }; });
  assert.deepEqual(addresses, []);
  interfaces = { WiFi: [{ ...address('192.168.1.7'), family: 'IPv4' }] };
  refresh(); refresh();
  assert.deepEqual(addresses, ['192.168.1.7']);
  interfaces = { WiFi: [{ ...address('192.168.1.9'), family: 'IPv4' }] };
  refresh();
  assert.deepEqual(addresses, ['192.168.1.7', '192.168.1.9']);
  assert.equal(closed, 1);
  stop();
  assert.equal(closed, 2);
});
