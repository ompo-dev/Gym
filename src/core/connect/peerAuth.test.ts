import { createHmac } from 'node:crypto';
import { peerProof, verifyPeer } from './peerAuth';

const token = 'a'.repeat(64);
const nonce = 'b'.repeat(64);
const clientNonce = 'c'.repeat(64);

test.each(['server', 'app'] as const)('native %s proof matches the Node companion HMAC', (side) => {
  expect(peerProof(token, nonce, side, clientNonce)).toBe(createHmac('sha256', Buffer.from(token, 'hex')).update(`gymnotes-${side}-v2:${clientNonce}:${nonce}`).digest('hex'));
});

test('proofs are bound to the invitation, nonce and direction', () => {
  const proof = peerProof(token, nonce, 'server', clientNonce);
  expect(verifyPeer(token, clientNonce, nonce, proof)).toBe(true);
  expect(verifyPeer('c'.repeat(64), clientNonce, nonce, proof)).toBe(false);
  expect(verifyPeer(token, clientNonce, 'd'.repeat(64), proof)).toBe(false);
  expect(verifyPeer(token, clientNonce, nonce, peerProof(token, nonce, 'app', clientNonce))).toBe(false);
  expect(verifyPeer(token, clientNonce, null, proof)).toBe(false);
  expect(verifyPeer(token, clientNonce, nonce, 'invalid')).toBe(false);
  expect(verifyPeer(token, 'e'.repeat(64), nonce, proof)).toBe(false);
});
