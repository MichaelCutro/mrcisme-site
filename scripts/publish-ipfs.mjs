import 'dotenv/config';
import * as Name from 'w3name';
import { promises as fs } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const PINATA_JWT = process.env.PINATA_JWT;
const W3NAME_KEY_B64 = process.env.W3NAME_KEY_B64;
if (!PINATA_JWT) throw new Error('PINATA_JWT missing');
if (!W3NAME_KEY_B64) throw new Error('W3NAME_KEY_B64 missing');

// Collect files in ./public (recursive)
const ROOT_DIR = 'public';
function walk(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory()
      ? walk(p, base)
      : [{ abs: p, rel: p.slice(base.length + 1).replaceAll('\\', '/') }];
  });
}
const files = walk(ROOT_DIR);
if (files.length === 0) throw new Error('No files in public/');

console.log(`Uploading ${files.length} files to Pinata/IPFS...`);

// Build multipart form (Node 20+: FormData/Blob/fetch are global)
const form = new FormData();
for (const { abs, rel } of files) {
  const data = await fs.readFile(abs);
  // IMPORTANT: give all files a shared top-level folder name
  form.append('file', new Blob([data]), `public/${rel}`);
}

// Optional niceties
form.append('pinataMetadata', JSON.stringify({ name: 'mrcisme-site' }));
// (Optional) also ask Pinata to wrap with a directory explicitly
form.append('pinataOptions', JSON.stringify({ wrapWithDirectory: true }));

const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
  method: 'POST',
  headers: { Authorization: `Bearer ${PINATA_JWT}` },
  body: form,
});

if (!res.ok) {
  const text = await res.text();
  throw new Error(`Pinata upload failed: ${res.status} ${res.statusText}\n${text}`);
}

const json = await res.json();
const cid = json.IpfsHash;
console.log('CID:', cid);

// Update IPNS using w3name
const keyRaw = Buffer.from(W3NAME_KEY_B64, 'base64');
const name = await Name.from(keyRaw);
const value = `/ipfs/${cid}`;

let rev;
try {
  rev = await Name.resolve(name);
  rev = await Name.increment(rev, value);
} catch {
  rev = await Name.v0(name, value);
}
await Name.publish(rev, name.key);

const ipns = name.toString();
const out = `CID=${cid}
IPNS=${ipns}
Gateway (CID): https://ipfs.io/ipfs/${cid}/
Gateway (IPNS): https://ipfs.io/ipns/${ipns}/
`;
console.log('\nPublish complete\n' + out);
await fs.writeFile('latest-ipfs.txt', out);