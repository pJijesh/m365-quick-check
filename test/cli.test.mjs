import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { main, parse } from '../src/cli.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = 'tok-NOT-A-REAL-TOKEN-0123456789';
const io = (extra = {}) => {
  const out = [];
  const err = [];
  return { out: (s) => out.push(s), err: (s) => err.push(s), env: {}, get stdout() { return out.join('\n'); }, get stderr() { return err.join('\n'); }, ...extra };
};
const tmp = () => mkdtempSync(join(tmpdir(), 'qc-'));

test('demo prints twelve results and exits 1 because one check fails', async () => {
  const i = io();
  assert.equal(await main(['demo'], i), 1);
  assert.equal(i.stdout.split('\n').filter((l) => /^QC\d{3}/.test(l)).length, 12);
  assert.match(i.stdout, /12 checks: 1 fail, 5 warn, 5 pass, 1 info, 0 not assessed/);
});

test('--fail-on controls the exit code', async () => {
  assert.equal(await main(['demo', '--fail-on', 'none'], io()), 0);
  assert.equal(await main(['demo', '--fail-on', 'warn'], io()), 1);
  assert.equal(await main(['demo', '--fail-on', 'fail'], io()), 1);
});

test('formats: md, json and --out', async () => {
  const dir = tmp();
  const md = io();
  await main(['demo', '--format', 'md'], md);
  assert.match(md.stdout, /^# Microsoft 365 quick check/);
  const js = io();
  await main(['demo', '--format', 'json'], js);
  assert.equal(JSON.parse(js.stdout).results.length, 12);
  const file = join(dir, 'r.md');
  const o = io();
  await main(['demo', '--format', 'md', '--out', file, '--fail-on', 'none'], o);
  assert.equal(o.stdout, '');
  assert.equal(readFileSync(file, 'utf8'), readFileSync(join(ROOT, 'examples/report.md'), 'utf8'));
});

test('check evaluates a saved snapshot, and --now changes the evaluation time', async () => {
  const dir = tmp();
  const file = join(dir, 's.json');
  writeFileSync(file, readFileSync(join(ROOT, 'examples/snapshot.json')));
  const a = io();
  await main(['check', file, '--format', 'json'], a);
  const b = io();
  await main(['check', file, '--format', 'json', '--now', '2027-06-01T00:00:00Z'], b);
  const find = (o, id) => JSON.parse(o.stdout).results.find((r) => r.id === id).status;
  assert.equal(find(a, 'QC008'), 'warn');
  assert.equal(find(b, 'QC008'), 'info');
});

test('usage errors exit 2 with a message', async () => {
  for (const argv of [[], ['banana'], ['check'], ['demo', '--format', 'xml'], ['demo', '--fail-on', 'maybe'], ['demo', '--nope'], ['demo', '--format']]) {
    const i = io();
    assert.equal(await main(argv, i), 2, argv.join(' '));
    assert.ok(i.stderr.length > 0, argv.join(' '));
  }
  assert.equal(await main(['check', join(tmp(), 'missing.json')], io()), 2);
  const bad = join(tmp(), 'bad.json');
  writeFileSync(bad, 'not json');
  assert.equal(await main(['check', bad], io()), 2);
  const noDate = join(tmp(), 'nodate.json');
  writeFileSync(noDate, JSON.stringify({ sections: { x: {} }, collectedAt: 'nope' }));
  assert.equal(await main(['check', noDate], io()), 2);
});

test('--help prints usage and exits 0; checks and permissions list their content', async () => {
  const h = io();
  assert.equal(await main(['--help'], h), 0);
  assert.match(h.stdout, /usage: m365-quick-check/);
  const c = io();
  assert.equal(await main(['checks'], c), 0);
  assert.equal(c.stdout.split('\n').length, 12);
  const p = io();
  assert.equal(await main(['permissions'], p), 0);
  assert.match(p.stdout, /Policy\.Read\.All/);
  assert.ok(!/ReadWrite/.test(p.stdout));
  assert.equal(p.stdout.split('\n').filter((l) => l.startsWith('GET ')).length, 7);
});

test('parse rejects options without a value and keeps positional arguments', () => {
  assert.throws(() => parse(['run', '--save']), /needs a value/);
  assert.deepEqual(parse(['check', 'x.json', '--format', 'md']), { flags: { format: 'md' }, args: ['check', 'x.json'] });
});

function fakeOk() {
  const bodies = {
    '/policies/authorizationPolicy': { allowInvitesFrom: 'none', guestUserRoleId: '10dae51f-b6af-4016-8d66-8c2a99b929b3', defaultUserRolePermissions: { allowedToCreateApps: false, allowedToCreateTenants: false, permissionGrantPoliciesAssigned: [] } },
    '/policies/adminConsentRequestPolicy': { isEnabled: true },
    '/policies/identitySecurityDefaultsEnforcementPolicy': { isEnabled: true },
    '/policies/authenticationMethodsPolicy': { authenticationMethodConfigurations: [{ id: 'Sms', state: 'disabled' }] },
    '/organization': { value: [{ technicalNotificationMails: ['a'], securityComplianceNotificationMails: ['b'] }] },
    '/subscribedSkus': { value: [] },
    '/applications': { value: [] },
  };
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, auth: init.headers.authorization });
    const path = new URL(url).pathname.replace('/v1.0', '');
    return new Response(JSON.stringify(bodies[path] || {}), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetchImpl, calls };
}

test('run reads the token from the environment, collects, saves a snapshot without the token and exits 0 when clean', async () => {
  const { fetchImpl, calls } = fakeOk();
  const dir = tmp();
  const save = join(dir, 'snap.json');
  const i = io({ env: { GRAPH_ACCESS_TOKEN: TOKEN }, fetchImpl });
  assert.equal(await main(['run', '--save', save], i), 0, i.stderr);
  assert.equal(calls.length, 7);
  assert.ok(calls.every((c) => c.method === 'GET' && c.auth === `Bearer ${TOKEN}` && c.url.startsWith('https://graph.microsoft.com/v1.0/')));
  assert.ok(!readFileSync(save, 'utf8').includes(TOKEN));
  assert.ok(!i.stdout.includes(TOKEN));
  assert.match(i.stdout, /12 checks: 0 fail, 0 warn, 12 pass/);
  const again = io();
  assert.equal(await main(['check', save], again), 0);
});

test('run honours --token-env and refuses to run without a token, without printing anything secret', async () => {
  const { fetchImpl, calls } = fakeOk();
  const i = io({ env: { MY_TOKEN: TOKEN }, fetchImpl });
  assert.equal(await main(['run', '--token-env', 'MY_TOKEN'], i), 0, i.stderr);
  assert.equal(calls.length, 7);
  const none = io({ env: {}, fetchImpl });
  assert.equal(await main(['run'], none), 2);
  assert.match(none.stderr, /GRAPH_ACCESS_TOKEN/);
});

test('run refuses an insecure base URL and never puts the token in an error', async () => {
  const i = io({ env: { GRAPH_ACCESS_TOKEN: TOKEN } });
  assert.equal(await main(['run', '--base-url', 'http://graph.example.invalid/v1.0'], i), 2);
  assert.ok(!i.stderr.includes(TOKEN));
  const failing = io({ env: { GRAPH_ACCESS_TOKEN: TOKEN }, fetchImpl: async () => { throw new Error(`network down ${TOKEN}`); } });
  const code = await main(['run', '--fail-on', 'none'], failing);
  assert.equal(code, 0);
  assert.ok(!failing.stdout.includes(TOKEN) && !failing.stderr.includes(TOKEN));
  assert.match(failing.stdout, /12 not assessed|0 pass/);
});

test('the token cannot be passed as an argument', async () => {
  const i = io({ env: {} });
  assert.equal(await main(['run', '--token', TOKEN], i), 2);
  assert.ok(!i.stderr.includes(TOKEN));
});

test('the bin script runs as a process', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'bin/m365-quick-check.mjs'), 'demo', '--fail-on', 'none'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /QC005  FAIL/);
  assert.ok(!existsSync(join(ROOT, 'snapshot.json')));
});
