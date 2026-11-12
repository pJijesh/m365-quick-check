import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { collect, checkBase, SECTIONS, SCOPES } from '../src/graph.mjs';
import { evaluate } from '../src/checks.mjs';

const TOKEN = 'tok-NOT-A-REAL-TOKEN-0123456789';

// A fake Graph. It records every request and answers from a table.
async function fakeGraph(routes) {
  const log = [];
  const server = createServer((req, res) => {
    log.push({ method: req.method, url: req.url, auth: req.headers.authorization });
    const key = req.url.split('?')[0].replace(/^\/v1\.0/, '');
    const r = routes[key];
    if (typeof r === 'function') return r(req, res, log);
    if (!r) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"error":{"code":"ResourceNotFound"}}'); }
    res.writeHead(r.status || 200, { 'content-type': 'application/json', ...(r.headers || {}) });
    res.end(JSON.stringify(r.body ?? {}));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/v1.0`;
  return { base, log, close: () => new Promise((r) => server.close(r)) };
}

const healthy = () => ({
  '/policies/authorizationPolicy': { body: { allowInvitesFrom: 'none', guestUserRoleId: '10dae51f-b6af-4016-8d66-8c2a99b929b3', defaultUserRolePermissions: { allowedToCreateApps: false, allowedToCreateTenants: false, permissionGrantPoliciesAssigned: [] } } },
  '/policies/adminConsentRequestPolicy': { body: { isEnabled: true, reviewers: [] } },
  '/policies/identitySecurityDefaultsEnforcementPolicy': { body: { isEnabled: true } },
  '/policies/authenticationMethodsPolicy': { body: { authenticationMethodConfigurations: [{ id: 'Sms', state: 'disabled' }] } },
  '/organization': { body: { value: [{ technicalNotificationMails: ['a'], securityComplianceNotificationMails: ['b'] }] } },
  '/subscribedSkus': { body: { value: [] } },
  '/applications': { body: { value: [{ displayName: 'One', passwordCredentials: [] }] } },
});

test('collect reads every section with GET only and the bearer token', async () => {
  const g = await fakeGraph(healthy());
  try {
    const snap = await collect({ token: TOKEN, base: g.base });
    assert.equal(g.log.length, SECTIONS.length);
    assert.ok(g.log.every((r) => r.method === 'GET'));
    assert.ok(g.log.every((r) => r.auth === `Bearer ${TOKEN}`));
    for (const s of SECTIONS) assert.equal(snap.sections[s.key].status, 'ok', s.key);
    assert.deepEqual(snap.sections.organization.data.length, 1);
    assert.equal(snap.schema, 1);
    assert.ok(!JSON.stringify(snap).includes(TOKEN), 'the token must not be in the snapshot');
    assert.equal(evaluate(snap).filter((r) => r.status === 'skipped').length, 0);
  } finally { await g.close(); }
});

test('paging follows nextLink on the same origin and concatenates the pages', async () => {
  const routes = healthy();
  let base;
  routes['/applications'] = (req, res) => {
    const second = req.url.includes('page=2');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(second ? { value: [{ displayName: 'B' }] } : { value: [{ displayName: 'A' }], '@odata.nextLink': `${base}/applications?page=2` }));
  };
  const g = await fakeGraph(routes);
  base = g.base;
  try {
    const snap = await collect({ token: TOKEN, base: g.base });
    assert.deepEqual(snap.sections.applications.data.map((a) => a.displayName), ['A', 'B']);
    assert.ok(g.log.every((r) => r.method === 'GET'));
  } finally { await g.close(); }
});

test('a nextLink on another origin is not followed and the token is not sent there', async () => {
  const other = await fakeGraph({});
  const routes = healthy();
  routes['/applications'] = { body: { value: [{ displayName: 'A' }], '@odata.nextLink': `${other.base}/applications?page=2` } };
  const g = await fakeGraph(routes);
  try {
    const snap = await collect({ token: TOKEN, base: g.base });
    assert.equal(snap.sections.applications.status, 'error');
    assert.match(snap.sections.applications.detail, /another origin/);
    assert.equal(other.log.length, 0, 'nothing may be sent to the other origin');
  } finally { await g.close(); await other.close(); }
});

test('paging stops at maxPages', async () => {
  const routes = healthy();
  let base;
  routes['/applications'] = (req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ value: [{ displayName: 'x' }], '@odata.nextLink': `${base}/applications?n=${Math.random()}` })); };
  const g = await fakeGraph(routes);
  base = g.base;
  try {
    const snap = await collect({ token: TOKEN, base: g.base, maxPages: 3 });
    assert.equal(snap.sections.applications.data.length, 3);
  } finally { await g.close(); }
});

test('403 and 401 mean denied, 404 means unavailable, 500 means error; the rest still run', async () => {
  const routes = healthy();
  routes['/policies/authorizationPolicy'] = { status: 403, body: { error: { code: 'Authorization_RequestDenied' } } };
  routes['/policies/adminConsentRequestPolicy'] = { status: 401, body: {} };
  delete routes['/policies/identitySecurityDefaultsEnforcementPolicy'];
  routes['/subscribedSkus'] = { status: 500, body: {} };
  const g = await fakeGraph(routes);
  try {
    const snap = await collect({ token: TOKEN, base: g.base });
    assert.equal(snap.sections.authorizationPolicy.status, 'denied');
    assert.equal(snap.sections.adminConsentRequestPolicy.status, 'denied');
    assert.equal(snap.sections.securityDefaults.status, 'unavailable');
    assert.equal(snap.sections.subscribedSkus.status, 'error');
    assert.equal(snap.sections.applications.status, 'ok');
    const r = Object.fromEntries(evaluate(snap).map((x) => [x.id, x]));
    assert.equal(r.QC001.status, 'skipped');
    assert.equal(r.QC012.status, 'pass');
  } finally { await g.close(); }
});

test('429 is retried after Retry-After, then succeeds', async () => {
  const routes = healthy();
  let calls = 0;
  routes['/organization'] = (req, res) => {
    calls += 1;
    if (calls < 3) { res.writeHead(429, { 'retry-after': '0' }); return res.end(); }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ value: [{}] }));
  };
  const g = await fakeGraph(routes);
  const waits = [];
  try {
    const snap = await collect({ token: TOKEN, base: g.base, sleep: async (ms) => { waits.push(ms); } });
    assert.equal(snap.sections.organization.status, 'ok');
    assert.equal(calls, 3);
    assert.equal(waits.length, 2);
  } finally { await g.close(); }
});

test('429 forever gives up after the retry limit and reports an error', async () => {
  const routes = healthy();
  routes['/organization'] = (req, res) => { res.writeHead(429, { 'retry-after': '1' }); res.end(); };
  const g = await fakeGraph(routes);
  try {
    const snap = await collect({ token: TOKEN, base: g.base, retries: 2, sleep: async () => {} });
    assert.equal(snap.sections.organization.status, 'error');
  } finally { await g.close(); }
});

test('a redirect is not followed, so the token cannot be sent elsewhere', async () => {
  const other = await fakeGraph({});
  const routes = healthy();
  routes['/organization'] = (req, res) => { res.writeHead(302, { location: `${other.base}/organization` }); res.end(); };
  const g = await fakeGraph(routes);
  try {
    const snap = await collect({ token: TOKEN, base: g.base });
    assert.equal(snap.sections.organization.status, 'error');
    assert.equal(other.log.length, 0);
  } finally { await g.close(); await other.close(); }
});

test('an error that mentions the token is scrubbed', async () => {
  const fetchImpl = async () => { throw new Error(`boom ${TOKEN}`); };
  const snap = await collect({ token: TOKEN, base: 'https://graph.microsoft.com/v1.0', fetchImpl });
  const text = JSON.stringify(snap);
  assert.ok(!text.includes(TOKEN));
  assert.match(text, /\[token\]/);
});

test('the client refuses a missing token and an insecure base URL', async () => {
  await assert.rejects(() => collect({ token: '' }), /no access token/);
  await assert.rejects(() => collect({ token: TOKEN, base: 'http://graph.example.invalid/v1.0' }), /https/);
  assert.doesNotThrow(() => checkBase('http://localhost:3000/v1.0'));
  assert.doesNotThrow(() => checkBase('http://127.0.0.1:3000/v1.0'));
  assert.doesNotThrow(() => checkBase('https://graph.microsoft.com/v1.0'));
  assert.throws(() => checkBase('ftp://x.example'), /https/);
});

test('every request in the client is a GET: the module has no other method', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/graph.mjs', import.meta.url), 'utf8');
  assert.equal([...src.matchAll(/method:\s*'([A-Z]+)'/g)].map((m) => m[1]).join(','), 'GET');
  assert.ok(!/\b(POST|PATCH|PUT|DELETE)\b/.test(src));
});

test('every section uses a Read scope and the scope list matches', () => {
  for (const s of SECTIONS) assert.match(s.scope, /\.Read\.All$/, s.key);
  assert.deepEqual([...SCOPES].sort(), ['Application.Read.All', 'Organization.Read.All', 'Policy.Read.All']);
});
