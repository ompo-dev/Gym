import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export function peerProof(token: string, nonce: string, side: 'server' | 'app', clientNonce: string): string {
  if (!/^[a-f0-9]{64}$/i.test(token) || !/^[a-f0-9]{64}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(clientNonce)) throw new Error('connect.wrongKey');
  return bytesToHex(hmac(sha256, hexToBytes(token), utf8ToBytes(`gymnotes-${side}-v2:${clientNonce}:${nonce}`)));
}

export function verifyPeer(token: string, clientNonce: string, nonce: unknown, proof: unknown): nonce is string {
  return typeof nonce === 'string' && /^[a-f0-9]{64}$/.test(nonce) &&
    typeof proof === 'string' && /^[a-f0-9]{64}$/.test(proof) && peerProof(token, nonce, 'server', clientNonce) === proof;
}
