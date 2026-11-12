// Checks the real Worker and the deployed site. Run by .github/workflows/live.yml
// (nightly and on demand, never on PRs). Core routes must answer; routes whose upstreams
// are known to be flaky are reported but do not fail the run. Every debug response is
// also scanned for credentials that escaped redaction.

const WORKER = process.env.WORKER_URL ?? 'https://art.hicksrch.workers.dev';
const SITE = process.env.SITE_URL ?? 'https://rhicksrad.github.io/art/';

const core = [
  '/diag',
  '/harvard-art/object?size=1&hasimage=1&debug=1',
  '/princeton-art/search?q=monet&type=artobjects&size=1&debug=1',
  '/northwestern/api/v2/search?query=poster&size=1&debug=1',
  '/arxiv/search?search_query=all:art&max_results=1&debug=1',
];
const optional = [
  '/ubc/collections?debug=1',
  '/hathi-catalog/api/volumes/brief/oclc/424023.json?debug=1',
  '/stanford-purl/bb112zx3193.json?debug=1',
  '/dataverse/search?q=art&type=dataset&per_page=1&debug=1',
];

const LEAK = /[?&](?:api[-_]?key|key|token|access[-_]?token)=(?!REDACTED)[^&\s"'<>\\]{6,}/i;

let failed = 0;

async function check(path, required) {
  const url = WORKER + path;
  let status = 'ERR';
  let body = '';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    status = res.status;
    body = await res.text();
  } catch (err) {
    body = String(err);
  }
  const ok = typeof status === 'number' && status < 400;
  const leak = LEAK.test(body);
  const tag = leak ? 'LEAK' : ok ? 'ok' : required ? 'FAIL' : 'warn';
  console.log(`${tag.padEnd(4)} ${String(status).padEnd(3)} ${path}`);
  if (leak) {
    console.log(`::error::Unredacted credential in the response from ${path}`);
    failed++;
  } else if (!ok && required) {
    console.log(`::error::${path} answered ${status}: ${body.slice(0, 200)}`);
    failed++;
  } else if (!ok) {
    console.log(`::warning::${path} answered ${status}`);
  }
}

for (const path of core) await check(path, true);
for (const path of optional) await check(path, false);

try {
  const res = await fetch(SITE, { signal: AbortSignal.timeout(20000) });
  const html = await res.text();
  const ok = res.ok && html.includes('<title');
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${res.status} ${SITE}`);
  if (!ok) failed++;
} catch (err) {
  console.log(`::error::${SITE} did not load: ${err}`);
  failed++;
}

if (failed) {
  console.log(`${failed} live check(s) failed.`);
  process.exit(1);
}
console.log('All live checks passed.');
