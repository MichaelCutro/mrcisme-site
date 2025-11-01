// scripts/publish-ipfs.mjs
import 'dotenv/config';
import { PinataSDK } from 'pinata';
import * as Name from 'w3name';
import { createReadStream, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PINATA_JWT = process.env.PINATA_JWT;
const W3NAME_KEY_B64 = process.env.W3NAME_KEY_B64;
if (!PINATA_JWT) throw new Error('PINATA_JWT missing');
if (!W3NAME_KEY_B64) throw new Error('W3NAME_KEY_B64 missing');

const pinata = new PinataSDK({
  pinataJwt: PINATA_JWT,
  // gateway is optional for upload; add your dedicated gateway if you have one:
  // pinataGateway: 'your-gateway.mypinata.cloud',
});

const ROOT_DIR = 'public';

function allFiles(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name);
    return e.isDirectory()
      ? allFiles(p, base)
      : [{ abs: p, rel: p.slice(base.length + 1).replaceAll('\\','/') }];
  });
}

const files = allFiles(ROOT_DIR);
if (files.length === 0) throw new Error('No files in public/');

// --- Upload the whole folder as a directory to IPFS via Pinata
const uploadItems = files.map(({ abs, rel }) => ({
  // filename with relative path tells IPFS to create a directory tree
  name: rel,
  stream: createReadStream(abs)
}));

console.log(`Uploading ${files.length} files to Pinata/IPFS...`);

// Pinata v2 SDK: use the public upload helper for multiple files
const { cid } = await pinata.upload.public.files(uploadItems);
// (Pinata docs show file uploads; folders are supported up to 25 GB per upload.)  [oai_citation:2‡docs.pinata.cloud](https://docs.pinata.cloud/sdk/getting-started)

console.log('CID:', cid);

// --- Update IPNS
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
writeFileSync('latest-ipfs.txt', out);