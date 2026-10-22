import { peerSocketURLs } from './discovery';

const id = 'a'.repeat(64);
const service = { port: 3847, addresses: ['172.18.1.1', '192.168.1.6', '127.0.0.1', '8.8.8.8', 'fe80::1'], txt: { pairingId: id, protocol: '2' } };

test('discovers only private GymNotes addresses and prefers the phone network', () => {
  expect(peerSocketURLs(service, id, '192.168.1.15')).toEqual(['ws://192.168.1.6:3847/app', 'ws://172.18.1.1:3847/app']);
});

test.each([{ ...service, port: 80 }, { ...service, txt: { pairingId: id, protocol: '1' } },
  { ...service, txt: { pairingId: 'b'.repeat(64), protocol: '2' } }, { ...service, addresses: ['attacker.example', '192.168.1.6@8.8.8.8', '192.168.1.6:80'] },
  { ...service, addresses: Array(33).fill('192.168.1.6') }, null])('ignores other invites, protocols and malformed services: %o', (value) => {
  expect(peerSocketURLs(value, id)).toEqual([]);
});
