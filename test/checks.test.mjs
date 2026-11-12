import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHECKS, evaluate, summarise, DEFAULT_THRESHOLDS } from '../src/checks.mjs';
import * as report from '../src/report.mjs';

const NOW = '2026-11-12T09:00:00.000Z';
const ok = (data) => ({ status: 'ok', data });
const base = () => ({
  collectedAt: NOW,
  sections: {
    authorizationPolicy: ok({ allowInvitesFrom: 'adminsAndGuestInviters', guestUserRoleId: '10dae51f-b6af-4016-8d66-8c2a99b929b3', defaultUserRolePermissions: { allowedToCreateApps: false, allowedToCreateTenants: false, permissionGrantPoliciesAssigned: [] } }),
    adminConsentRequestPolicy: ok({ isEnabled: true, reviewers: [{}] }),
    securityDefaults: ok({ isEnabled: true }),
    authenticationMethodsPolicy: ok({ authenticationMethodConfigurations: [{ id: 'Sms', state: 'disabled' }, { id: 'Voice', state: 'disabled' }, { id: 'MicrosoftAuthenticator', state: 'enabled' }] }),
    organization: ok([{ onPremisesSyncEnabled: false, technicalNotificationMails: ['a@x.example'], securityComplianceNotificationMails: ['b@x.example'] }]),
    subscribedSkus: ok([]),
    applications: ok([]),
  },
});
const run = (mutate, now) => {
  const s = base();
  mutate(s.sections);
  return Object.fromEntries(evaluate(s, { now }).map((r) => [r.id, r]));
};
const ap = (s, patch) => { s.authorizationPolicy = ok({ ...s.authorizationPolicy.data, ...patch }); };
const perms = (s, patch) => ap(s, { defaultUserRolePermissions: { ...s.authorizationPolicy.data.defaultUserRolePermissions, ...patch } });

test('a tenant with sensible settings has no fail or warn', () => {
  const c = summarise(evaluate(base()));
  assert.equal(c.fail + c.warn + c.skipped, 0);
  assert.equal(c.pass, 12);
});

test('there are twelve checks with unique ids and full text', () => {
  assert.equal(CHECKS.length, 12);
  assert.equal(new Set(CHECKS.map((c) => c.id)).size, 12);
  for (const c of CHECKS) assert.ok(c.title && c.why.length > 30 && c.fix.length > 30 && c.needs.length === 2, c.id);
});

test('QC001 invitations', () => {
  assert.equal(run((s) => ap(s, { allowInvitesFrom: 'everyone' })).QC001.status, 'warn');
  assert.equal(run((s) => ap(s, { allowInvitesFrom: 'none' })).QC001.status, 'pass');
  assert.equal(run((s) => ap(s, { allowInvitesFrom: 'adminsGuestInvitersAndAllMembers' })).QC001.status, 'pass');
  assert.equal(run((s) => ap(s, { allowInvitesFrom: undefined })).QC001.status, 'info');
});

test('QC002 guest access, matching the role id in any case', () => {
  assert.equal(run((s) => ap(s, { guestUserRoleId: 'A0B1B346-4D3E-4E8B-98F8-753987BE4970' })).QC002.status, 'fail');
  assert.equal(run((s) => ap(s, { guestUserRoleId: '2af84b1e-32c8-42b7-82bc-daa82404023b' })).QC002.status, 'pass');
  assert.match(run((s) => ap(s, { guestUserRoleId: '2af84b1e-32c8-42b7-82bc-daa82404023b' })).QC002.detail, /restricted/);
  assert.equal(run((s) => ap(s, { guestUserRoleId: '11111111-1111-1111-1111-111111111111' })).QC002.status, 'info');
  assert.equal(run((s) => ap(s, { guestUserRoleId: undefined })).QC002.status, 'info');
});

test('QC003 and QC004 user permissions', () => {
  assert.equal(run((s) => perms(s, { allowedToCreateApps: true })).QC003.status, 'warn');
  assert.equal(run((s) => perms(s, { allowedToCreateApps: undefined })).QC003.status, 'info');
  assert.equal(run((s) => perms(s, { allowedToCreateTenants: true })).QC004.status, 'warn');
  assert.equal(run((s) => perms(s, { allowedToCreateTenants: undefined })).QC004.status, 'info');
});

test('QC005 consent policies, matched case-insensitively', () => {
  const legacy = run((s) => perms(s, { permissionGrantPoliciesAssigned: ['ManagePermissionGrantsForSelf.microsoft-user-default-legacy'] }));
  assert.equal(legacy.QC005.status, 'fail');
  assert.equal(run((s) => perms(s, { permissionGrantPoliciesAssigned: ['managePermissionGrantsForSelf.microsoft-user-default-low'] })).QC005.status, 'pass');
  assert.equal(run((s) => perms(s, { permissionGrantPoliciesAssigned: ['managePermissionGrantsForSelf.our-custom'] })).QC005.status, 'info');
  assert.equal(run((s) => perms(s, { permissionGrantPoliciesAssigned: ['ManagePermissionGrantsForOwnedResource.DeveloperConsent'] })).QC005.status, 'pass');
});

test('QC006 and QC007', () => {
  assert.equal(run((s) => { s.adminConsentRequestPolicy = ok({ isEnabled: false }); }).QC006.status, 'warn');
  assert.equal(run((s) => { s.securityDefaults = ok({ isEnabled: false }); }).QC007.status, 'info');
});

test('QC008 credentials: expiring warns, expired only informs, far future passes', () => {
  const app = (name, end) => ({ displayName: name, passwordCredentials: [{ endDateTime: end }], keyCredentials: [] });
  const soon = run((s) => { s.applications = ok([app('Soon', '2026-11-20T00:00:00Z')]); });
  assert.equal(soon.QC008.status, 'warn');
  assert.match(soon.QC008.detail, /Soon \(8d\)/);
  assert.equal(run((s) => { s.applications = ok([app('Old', '2025-01-01T00:00:00Z')]); }).QC008.status, 'info');
  assert.equal(run((s) => { s.applications = ok([app('Fine', '2027-12-01T00:00:00Z')]); }).QC008.status, 'pass');
  const edge = run((s) => { s.applications = ok([app('Edge', '2026-12-12T09:00:00Z')]); });
  assert.equal(edge.QC008.status, 'warn', 'exactly 30 days counts as expiring');
  const certs = run((s) => { s.applications = ok([{ displayName: 'Cert', passwordCredentials: [], keyCredentials: [{ endDateTime: '2026-11-15T00:00:00Z' }] }]); });
  assert.equal(certs.QC008.status, 'warn');
  assert.equal(run((s) => { s.applications = ok([{ displayName: 'None' }, { displayName: 'NoEnd', passwordCredentials: [{}] }]); }).QC008.status, 'pass');
});

test('QC008 summarises long lists', () => {
  const apps = Array.from({ length: 8 }, (_, i) => ({ displayName: `App${i}`, passwordCredentials: [{ endDateTime: '2026-11-20T00:00:00Z' }] }));
  assert.match(run((s) => { s.applications = ok(apps); }).QC008.detail, /and 3 more/);
});

test('QC009 licences: threshold on count and share, free SKUs ignored', () => {
  const sku = (part, enabled, used, extra = {}) => ({ skuPartNumber: part, appliesTo: 'User', capabilityStatus: 'Enabled', consumedUnits: used, prepaidUnits: { enabled }, ...extra });
  assert.equal(run((s) => { s.subscribedSkus = ok([sku('E3', 100, 60)]); }).QC009.status, 'warn');
  assert.equal(run((s) => { s.subscribedSkus = ok([sku('E3', 100, 95)]); }).QC009.status, 'pass', 'few unused');
  assert.equal(run((s) => { s.subscribedSkus = ok([sku('E3', 1000, 950)]); }).QC009.status, 'pass', 'large count but small share');
  assert.equal(run((s) => { s.subscribedSkus = ok([sku('FREE', 10000, 4)]); }).QC009.status, 'pass', 'free-scale SKU ignored');
  assert.equal(run((s) => { s.subscribedSkus = ok([sku('E3', 100, 10, { capabilityStatus: 'Suspended' })]); }).QC009.status, 'pass');
  assert.equal(run((s) => { s.subscribedSkus = ok([sku('E3', 100, 10, { appliesTo: 'Company' })]); }).QC009.status, 'pass');
});

test('QC010 directory sync age', () => {
  const org = (t) => ok([{ onPremisesSyncEnabled: true, onPremisesLastSyncDateTime: t, technicalNotificationMails: ['a'], securityComplianceNotificationMails: ['b'] }]);
  assert.equal(run((s) => { s.organization = org('2026-11-12T08:45:00Z'); }).QC010.status, 'pass');
  assert.equal(run((s) => { s.organization = org('2026-11-12T04:00:00Z'); }).QC010.status, 'warn');
  assert.equal(run((s) => { s.organization = org('2026-11-10T09:00:00Z'); }).QC010.status, 'fail');
  assert.equal(run((s) => { s.organization = org(undefined); }).QC010.status, 'info');
});

test('QC011 authentication methods', () => {
  const cfg = (...c) => ({ authenticationMethodConfigurations: c.map(([id, state]) => ({ id, state })) });
  const r = run((s) => { s.authenticationMethodsPolicy = ok(cfg(['Sms', 'enabled'], ['Voice', 'enabled'], ['MicrosoftAuthenticator', 'disabled'])); });
  assert.equal(r.QC011.status, 'warn');
  assert.match(r.QC011.detail, /SMS.*voice.*Authenticator/);
  assert.equal(run((s) => { s.authenticationMethodsPolicy = ok(cfg()); }).QC011.status, 'info');
});

test('QC012 notification contacts', () => {
  const org = (tech, sec) => ok([{ technicalNotificationMails: tech, securityComplianceNotificationMails: sec }]);
  assert.equal(run((s) => { s.organization = org([], []); }).QC012.status, 'warn');
  assert.match(run((s) => { s.organization = org([], ['b']); }).QC012.detail, /technical/);
  assert.match(run((s) => { s.organization = org(['a'], []); }).QC012.detail, /security and compliance/);
});

test('a section that was denied, missing or errored is skipped, never passed', () => {
  const r = run((s) => {
    s.authorizationPolicy = { status: 'denied' };
    delete s.subscribedSkus;
    s.applications = { status: 'error', detail: 'HTTP 500' };
  });
  for (const id of ['QC001', 'QC002', 'QC003', 'QC004', 'QC005']) { assert.equal(r[id].status, 'skipped'); assert.match(r[id].detail, /needs Policy\.Read\.All/); }
  assert.match(r.QC009.detail, /not collected/);
  assert.match(r.QC008.detail, /HTTP 500/);
});

test('data in the wrong shape is skipped with a reason, not a crash', () => {
  const r = run((s) => { s.applications = ok(null); });
  assert.equal(r.QC008.status, 'skipped');
  assert.match(r.QC008.detail, /expected shape/);
});

test('evaluation is deterministic and uses collectedAt unless --now is given', () => {
  const s = base();
  s.sections.applications = ok([{ displayName: 'A', passwordCredentials: [{ endDateTime: '2026-11-20T00:00:00Z' }] }]);
  assert.deepEqual(evaluate(s), evaluate(s));
  assert.equal(evaluate(s).find((r) => r.id === 'QC008').status, 'warn');
  assert.equal(evaluate(s, { now: '2027-01-01T00:00:00Z' }).find((r) => r.id === 'QC008').status, 'info');
  assert.throws(() => evaluate({ collectedAt: 'nonsense', sections: {} }), /collectedAt/);
});

test('thresholds can be changed', () => {
  const s = base();
  s.sections.applications = ok([{ displayName: 'A', passwordCredentials: [{ endDateTime: '2026-12-20T00:00:00Z' }] }]);
  assert.equal(evaluate(s).find((r) => r.id === 'QC008').status, 'pass');
  assert.equal(evaluate(s, { thresholds: { credentialDays: 60 } }).find((r) => r.id === 'QC008').status, 'warn');
  assert.equal(DEFAULT_THRESHOLDS.credentialDays, 30);
});

test('the demo snapshot gives the documented mix and the recorded report', () => {
  const snap = JSON.parse(readFileSync(new URL('../examples/snapshot.json', import.meta.url), 'utf8'));
  const results = evaluate(snap);
  assert.deepEqual(summarise(results), { pass: 5, warn: 5, fail: 1, info: 1, skipped: 0 });
  assert.equal(readFileSync(new URL('../examples/report.md', import.meta.url), 'utf8'), report.markdown(results, { collectedAt: snap.collectedAt }) + '\n');
});

test('report formats: text lines, markdown sections, json shape', () => {
  const results = evaluate(base());
  assert.equal(report.text(results).split('\n').filter((l) => /^QC\d{3}/.test(l)).length, 12);
  const bad = run((s) => { s.adminConsentRequestPolicy = { status: 'denied' }; ap(s, { allowInvitesFrom: 'everyone' }); });
  const md = report.markdown(Object.values(bad));
  assert.match(md, /## What to do/);
  assert.match(md, /## Not assessed/);
  assert.match(md, /Why it matters:/);
  const j = JSON.parse(report.json(Object.values(bad), { collectedAt: NOW }));
  assert.equal(j.results.length, 12);
  assert.equal(j.summary.warn, 1);
  assert.equal(j.collectedAt, NOW);
  assert.ok(!/## What to do/.test(report.markdown(evaluate(base()))));
});
