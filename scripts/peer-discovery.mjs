import { Bonjour } from 'bonjour-service';
import { createHash } from 'node:crypto';
import { isIPv4 } from 'node:net';
import { networkInterfaces } from 'node:os';

const createBonjour = (options) => new Bonjour(options, () => {
  console.error('GymNotes: descoberta local indisponivel. A conexao direta continua disponivel.');
});

export function advertisePeer(token, port, factory = createBonjour, interfaces = networkInterfaces()) {
  const addresses = [...new Set(Object.values(interfaces).flatMap((values) => values ?? [])
    .filter((value) => !value.internal && isIPv4(value.address) &&
      /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(value.address))
    .map((value) => value.address))].sort();
  if (!addresses.length) throw new Error('connect.noLAN');
  const pairingId = createHash('sha256').update(`gymnotes-pairing-v1:${token}`).digest('hex');
  const peers = [];
  try {
    for (const [index, address] of addresses.entries()) {
      // Pin multicast to each private LAN instead of the OS's preferred VPN route.
      const bonjour = factory({ interface: address, bind: '0.0.0.0' });
      peers.push(bonjour);
      const name = `GymNotes-${pairingId.slice(0, 12)}-${index + 1}`;
      bonjour.publish({ name, host: `${name.toLowerCase()}.local`, type: 'gymnotes', protocol: 'tcp',
        port, disableIPv6: true, txt: { pairingId, protocol: '2' } });
    }
  } catch (error) { for (const peer of peers) peer.destroy(); throw error; }
  return () => { for (const peer of peers) peer.destroy(); };
}
