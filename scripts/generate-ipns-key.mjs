import * as Name from 'w3name';
import { writeFileSync } from 'node:fs';

const name = await Name.create();
console.log('IPNS Name:', name.toString());
writeFileSync('signing-key.txt', name.key.raw);
console.log('Saved private key to signing-key.txt (DO NOT COMMIT)');
const b64 = Buffer.from(name.key.raw).toString('base64');
console.log('W3NAME_KEY_B64:\n' + b64);