import { Bonjour } from 'bonjour-service';
import { createHash } from 'node:crypto';

export function advertisePeer(token, port, factory = () => new Bonjour(undefined, () => {
  console.error('GymNotes: descoberta local indisponivel. A conexao direta continua disponivel.');
})) {
  const bonjour = factory();
  const pairingId = createHash('sha256').update(`gymnotes-pairing-v1:${token}`).digest('hex');
  try {
    bonjour.publish({ name: `GymNotes-${pairingId.slice(0, 12)}`, type: 'gymnotes', protocol: 'tcp',
      port, disableIPv6: true, txt: { pairingId, protocol: '2' } });
  } catch (error) { bonjour.destroy(); throw error; }
  return () => bonjour.destroy();
}
