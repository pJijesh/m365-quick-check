// The twelve checks. Pure functions over a snapshot of Microsoft Graph responses. No network, no clock
// except the one passed in, so the same snapshot always gives the same result.

export const STATUS_ORDER = ['fail', 'warn', 'info', 'skipped', 'pass'];

const GUEST_ROLE = {
  'a0b1b346-4d3e-4e8b-98f8-753987be4970': 'same access as members',
  '10dae51f-b6af-4016-8d66-8c2a99b929b3': 'limited access',
  '2af84b1e-32c8-42b7-82bc-daa82404023b': 'restricted access',
};

const section = (snap, key) => (snap.sections && snap.sections[key]) || { status: 'unavailable' };
const need = (snap, key, scope) => {
  const s = section(snap, key);
  if (s.status === 'ok') return { data: s.data };
  const why = s.status === 'denied' ? `permission denied; needs ${scope}` : s.status === 'unavailable' ? 'not collected' : `could not be read (${s.detail || s.status})`;
  return { skipped: `Not assessed: ${why}.` };
};
const list = (items, max = 5) => (items.length > max ? `${items.slice(0, max).join(', ')} and ${items.length - max} more` : items.join(', '));
const days = (ms) => ms / 86400000;

export const CHECKS = [
  {
    id: 'QC001', title: 'Who can invite guests', needs: ['authorizationPolicy', 'Policy.Read.All'],
    why: 'If everyone, including other guests, can invite outsiders, nobody owns the list of external people with access.',
    fix: 'In Entra, External Identities, External collaboration settings, restrict invitations to admins and the Guest Inviter role (or to members only).',
    run: ({ data }) => {
      const v = data.allowInvitesFrom;
      if (v === 'everyone') return ['warn', 'Everyone in the organisation, including guests, can invite guests (allowInvitesFrom is everyone).'];
      if (!v) return ['info', 'The invitation setting was not returned.'];
      return ['pass', `Guest invitations are limited (allowInvitesFrom is ${v}).`];
    },
  },
  {
    id: 'QC002', title: 'What guests can see', needs: ['authorizationPolicy', 'Policy.Read.All'],
    why: 'Guests with member-level access can read the directory: users, groups and their properties.',
    fix: 'In Entra, External Identities, External collaboration settings, set guest user access to limited or restricted.',
    run: ({ data }) => {
      const id = String(data.guestUserRoleId || '').toLowerCase();
      if (!id) return ['info', 'The guest access level was not returned.'];
      const label = GUEST_ROLE[id];
      if (id === 'a0b1b346-4d3e-4e8b-98f8-753987be4970') return ['fail', 'Guests have the same access as members.'];
      if (label) return ['pass', `Guests have ${label}.`];
      return ['info', `Guests use an unrecognised role template (${id}). Check it is intended.`];
    },
  },
  {
    id: 'QC003', title: 'Who can register applications', needs: ['authorizationPolicy', 'Policy.Read.All'],
    why: 'Any user who can register an application can create a place to hold credentials and permissions outside IT review.',
    fix: 'In Entra, Users, User settings, set "Users can register applications" to No and give the right people the Application Developer role.',
    run: ({ data }) => {
      const v = (data.defaultUserRolePermissions || {}).allowedToCreateApps;
      if (v === true) return ['warn', 'Every user can register applications.'];
      if (v === false) return ['pass', 'Users cannot register applications.'];
      return ['info', 'The setting was not returned.'];
    },
  },
  {
    id: 'QC004', title: 'Who can create tenants', needs: ['authorizationPolicy', 'Policy.Read.All'],
    why: 'Users who create their own tenants create shadow IT that your organisation owns nothing of, but that carries your name.',
    fix: 'In Entra, Users, User settings, set "Restrict non-admin users from creating tenants" to Yes.',
    run: ({ data }) => {
      const v = (data.defaultUserRolePermissions || {}).allowedToCreateTenants;
      if (v === true) return ['warn', 'Non-admin users can create tenants.'];
      if (v === false) return ['pass', 'Non-admin users cannot create tenants.'];
      return ['info', 'The setting was not returned.'];
    },
  },
  {
    id: 'QC005', title: 'User consent to applications', needs: ['authorizationPolicy', 'Policy.Read.All'],
    why: 'When users can consent to any app, one convincing phishing link can hand a mailbox or files to an attacker without a password ever being stolen.',
    fix: 'In Entra, Enterprise applications, Consent and permissions, choose no user consent or consent only for verified publishers and low-impact permissions.',
    run: ({ data }) => {
      const grants = ((data.defaultUserRolePermissions || {}).permissionGrantPoliciesAssigned || []).map((x) => String(x).toLowerCase());
      const self = grants.filter((g) => g.startsWith('managepermissiongrantsforself.'));
      if (self.includes('managepermissiongrantsforself.microsoft-user-default-legacy')) return ['fail', 'Users can consent to any application for any permission that does not need admin consent.'];
      if (self.includes('managepermissiongrantsforself.microsoft-user-default-low')) return ['pass', 'Users can consent only to verified publishers and low-impact permissions.'];
      if (self.length) return ['info', `Users consent under a custom policy (${list(self)}). Review that policy.`];
      return ['pass', 'Users cannot consent to applications themselves.'];
    },
  },
  {
    id: 'QC006', title: 'Admin consent workflow', needs: ['adminConsentRequestPolicy', 'Policy.Read.All'],
    why: 'If users cannot consent and cannot ask, they work around the block or ask for blanket permissions.',
    fix: 'In Entra, Enterprise applications, Admin consent requests, enable the workflow and name reviewers.',
    run: ({ data }) => (data.isEnabled === true
      ? ['pass', `The admin consent workflow is on${Array.isArray(data.reviewers) ? ` with ${data.reviewers.length} reviewer scope(s)` : ''}.`]
      : ['warn', 'The admin consent workflow is off, so users have no way to request access to an app.']),
  },
  {
    id: 'QC007', title: 'Security defaults', needs: ['securityDefaults', 'Policy.Read.All'],
    why: 'Security defaults are Microsoft\'s baseline for tenants without Conditional Access. Being off is only fine if Conditional Access does the same job.',
    fix: 'If you do not use Conditional Access, turn security defaults on. If you do, confirm MFA for everyone, and for administrators, is enforced there (m365-entra-security-audit checks that).',
    run: ({ data }) => (data.isEnabled === true
      ? ['pass', 'Security defaults are on.']
      : ['info', 'Security defaults are off. That is expected when Conditional Access enforces MFA; this tool does not read Conditional Access.']),
  },
  {
    id: 'QC008', title: 'Application secrets and certificates', needs: ['applications', 'Application.Read.All'],
    why: 'An expired secret breaks a service at the worst moment. Old expired credentials clutter the app and hide the ones that matter.',
    fix: 'Rotate secrets that expire soon, prefer certificates or managed identities, and delete expired credentials.',
    run: ({ data }, ctx) => {
      const expiring = [];
      let expired = 0;
      for (const app of data) {
        for (const c of [...(app.passwordCredentials || []), ...(app.keyCredentials || [])]) {
          if (!c.endDateTime) continue;
          const left = days(Date.parse(c.endDateTime) - ctx.now);
          if (left < 0) expired += 1;
          else if (left <= ctx.thresholds.credentialDays) expiring.push(`${app.displayName || app.appId} (${Math.ceil(left)}d)`);
        }
      }
      if (expiring.length) return ['warn', `${expiring.length} credential(s) expire within ${ctx.thresholds.credentialDays} days: ${list(expiring)}.${expired ? ` ${expired} more have already expired.` : ''}`];
      if (expired) return ['info', `${expired} credential(s) have already expired and can be removed. None expire within ${ctx.thresholds.credentialDays} days.`];
      return ['pass', `No credential expires within ${ctx.thresholds.credentialDays} days.`];
    },
  },
  {
    id: 'QC009', title: 'Unused licences', needs: ['subscribedSkus', 'Organization.Read.All'],
    why: 'Licences that are bought but not assigned are money spent for nothing, and a sign that joiner and leaver processes are not matching the contract.',
    fix: 'Reduce the quantity at the next renewal, or assign the licences that are genuinely needed. Check the contract term before changing anything.',
    run: ({ data }, ctx) => {
      const rows = [];
      for (const s of data) {
        if (s.appliesTo !== 'User' || s.capabilityStatus !== 'Enabled') continue;
        const bought = (s.prepaidUnits || {}).enabled;
        if (!Number.isFinite(bought) || bought <= 0 || bought >= ctx.thresholds.skuIgnoreAbove) continue;
        const unused = bought - (s.consumedUnits || 0);
        if (unused >= ctx.thresholds.unusedLicences && unused / bought >= ctx.thresholds.unusedShare) rows.push(`${s.skuPartNumber} (${unused} of ${bought} unused)`);
      }
      if (rows.length) return ['warn', `${rows.length} SKU(s) have many unassigned licences: ${list(rows)}.`];
      return ['pass', 'No paid SKU has a large share of unassigned licences.'];
    },
  },
  {
    id: 'QC010', title: 'Directory synchronisation', needs: ['organization', 'Organization.Read.All'],
    why: 'A stalled sync means leavers disabled on-premises stay enabled in the cloud, and new starters wait.',
    fix: 'Check the sync service on the Entra Connect or cloud sync server, and its health alerts.',
    run: ({ data }, ctx) => {
      const org = Array.isArray(data) ? data[0] || {} : data;
      if (!org.onPremisesSyncEnabled) return ['pass', 'The tenant is not synchronised from an on-premises directory.'];
      if (!org.onPremisesLastSyncDateTime) return ['info', 'Synchronisation is on but no last sync time was returned.'];
      const hours = (ctx.now - Date.parse(org.onPremisesLastSyncDateTime)) / 3600000;
      if (hours > 24) return ['fail', `The last directory sync was ${Math.floor(hours)} hours ago.`];
      if (hours > 3) return ['warn', `The last directory sync was ${hours.toFixed(1)} hours ago; the normal interval is about 30 minutes.`];
      return ['pass', `The last directory sync was ${hours.toFixed(1)} hours ago.`];
    },
  },
  {
    id: 'QC011', title: 'Authentication methods', needs: ['authenticationMethodsPolicy', 'Policy.Read.All'],
    why: 'SMS and voice codes can be intercepted or socially engineered; an authenticator app or a security key resists that better.',
    fix: 'In Entra, Authentication methods, Policies: disable SMS and voice where you can, enable Microsoft Authenticator, and consider FIDO2 for administrators.',
    run: ({ data }) => {
      const cfg = Object.fromEntries((data.authenticationMethodConfigurations || []).map((c) => [c.id, c.state]));
      const issues = [];
      if (cfg.Sms === 'enabled') issues.push('SMS is enabled');
      if (cfg.Voice === 'enabled') issues.push('voice calls are enabled');
      if (cfg.MicrosoftAuthenticator && cfg.MicrosoftAuthenticator !== 'enabled') issues.push('Microsoft Authenticator is not enabled');
      if (issues.length) return ['warn', `${issues.join('; ')}. The policy targets decide who is affected.`];
      if (!Object.keys(cfg).length) return ['info', 'No authentication method configurations were returned.'];
      return ['pass', 'SMS and voice are off and Microsoft Authenticator is enabled.'];
    },
  },
  {
    id: 'QC012', title: 'Who is told about problems', needs: ['organization', 'Organization.Read.All'],
    why: 'Microsoft sends service and security notices to these addresses. If they are empty or go to a leaver, nobody hears.',
    fix: 'In the Microsoft 365 admin centre, Settings, Org settings, Organization profile, set technical and security contacts to monitored shared mailboxes.',
    run: ({ data }) => {
      const org = Array.isArray(data) ? data[0] || {} : data;
      const tech = (org.technicalNotificationMails || []).length;
      const sec = (org.securityComplianceNotificationMails || []).length;
      if (!tech && !sec) return ['warn', 'No technical or security notification contacts are set.'];
      if (!tech) return ['warn', 'No technical notification contact is set.'];
      if (!sec) return ['warn', 'No security and compliance notification contact is set.'];
      return ['pass', `${tech} technical and ${sec} security contact(s) are set. Check that they are monitored mailboxes.`];
    },
  },
];

export const DEFAULT_THRESHOLDS = { credentialDays: 30, unusedLicences: 10, unusedShare: 0.2, skuIgnoreAbove: 10000 };

export function evaluate(snapshot, options = {}) {
  const now = Date.parse(options.now || snapshot.collectedAt || new Date().toISOString());
  if (!Number.isFinite(now)) throw new Error('the snapshot has no valid collectedAt and no --now was given');
  const ctx = { now, thresholds: { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) } };
  return CHECKS.map((c) => {
    const base = { id: c.id, title: c.title, why: c.why, fix: c.fix };
    const got = need(snapshot, c.needs[0], c.needs[1]);
    if (got.skipped) return { ...base, status: 'skipped', detail: got.skipped };
    try {
      const [status, detail] = c.run(got, ctx);
      return { ...base, status, detail };
    } catch (e) {
      return { ...base, status: 'skipped', detail: `Not assessed: the data was not in the expected shape (${e.message}).` };
    }
  });
}

export function summarise(results) {
  const counts = { pass: 0, warn: 0, fail: 0, info: 0, skipped: 0 };
  for (const r of results) counts[r.status] += 1;
  return counts;
}
