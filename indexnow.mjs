#!/usr/bin/env node
// Ping IndexNow so Bing (and therefore ChatGPT's search grounding) picks up
// changes immediately instead of waiting for a crawl.
//
//   node indexnow.mjs                 # submit every URL in sitemap.xml
//   node indexnow.mjs /privacy.html   # submit specific paths
//
// The key must stay reachable at https://www.guavo.com/<KEY>.txt containing
// exactly the key, or IndexNow rejects the submission.

import { readFileSync } from 'node:fs';

const HOST = 'www.guavo.com';
const KEY = '1e4cffc5ae20c577aac71ae4e6bd1c64';

const args = process.argv.slice(2);

const urlList = args.length
  ? args.map(p => (p.startsWith('http') ? p : `https://${HOST}${p.startsWith('/') ? p : '/' + p}`))
  : [...readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8')
      .matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

if (!urlList.length) {
  console.error('No URLs to submit.');
  process.exit(1);
}

// Fail loudly if the key file is not actually being served — a silent 200 from
// IndexNow with an unreachable key means nothing was queued.
const keyUrl = `https://${HOST}/${KEY}.txt`;
const keyCheck = await fetch(keyUrl).catch(() => null);
const keyBody = keyCheck && keyCheck.ok ? (await keyCheck.text()).trim() : null;
if (keyBody !== KEY) {
  console.error(`Key file not serving correctly at ${keyUrl}`);
  console.error(`  status: ${keyCheck ? keyCheck.status : 'unreachable'}, body: ${JSON.stringify(keyBody)}`);
  console.error('Deploy the key file before submitting.');
  process.exit(1);
}

const res = await fetch('https://api.indexnow.org/IndexNow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: keyUrl, urlList })
});

// 200 = accepted, 202 = accepted but key validation pending.
console.log(`IndexNow responded ${res.status} ${res.statusText}`);
urlList.forEach(u => console.log('  ' + u));
process.exit(res.status === 200 || res.status === 202 ? 0 : 1);
