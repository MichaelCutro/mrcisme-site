import 'dotenv/config';
import * as Name from 'w3name';
import { promises as fs } from 'node:fs';
import { createReadStream, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PINATA_JWT = process.env.PINATA_JWT;
const W3NAME_KEY_B64 = process.env.W3NAME_KEY_B64;
if (!PINATA_JWT) throw new Error('PINATA_JWT missing');
if (!W3NAME_KEY_B64) throw new Error('W3NAME_KEY_B64 missing');

// ---- collect files in ./public (recursive)
const ROOT_DIR = 'public';
function walk(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name);
    return e.isDirectory()
      ? walk(p, base)
      : [{ abs: p, rel: p.slice(base.length + 1).replaceAll('\\','/') }];
  });
}
const files = walk(ROOT_DIR);
if (files.length === 0) throw new Error('No files in public/');

console.log(`Uploading ${files.length} files to Pinata/IPFS...`);

// ---- build multipart form manually (Node 20+ has FormData/Blob/fetch)
const form = new FormData();
// add each file with its relative path as the filename (this preserves folder structure)
for (const { abs, rel } of files) {
  const data = await fs.readFile(abs);
  form.append('file', new Blob([data]), rel); // filename = rel path
}

// optional: metadata (shows a nicer name in Pinata UI)
form.append('pinataMetadata', JSON.stringify({ name: 'mrcisme-site' }));

// older pinning endpoint that accepts JWT and directory uploads
const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
  method: 'POST',
  headers: { Authorization: `Bearer ${PINATA_JWT}` },
  body: form
});

if (!res.ok) {
  const text = await res.text();
  throw new Error(`Pinata upload failed: ${res.status} ${res.statusText}\n${text}`);
}

const json = await res.json();
const cid = json.IpfsHash;
console.log('CID:', cid);

// ---- update IPNS using w3name
const keyRaw = Buffer.from(W3NAME_KEY_B64, 'base64');
const name = await Name.from(keyRaw);
const value = `/ipfs/${cid}`;

let rev;
try { rev = await Name.resolve(name); rev = await Name.increment(rev, value); }
catch { rev = await Name.v0(name, value); }

await Name.publish(rev, name.key);

const ipns = name.toString();
const out = `CID=${cid}
IPNS=${ipns}
Gateway (CID): https://ipfs.io/ipfs/${cid}/
Gateway (IPNS): https://ipfs.io/ipns/${ipns}/
`;

console.log('\nPublish complete\n' + out);
await fs.writeFile('latest-ipfs.txt', out);