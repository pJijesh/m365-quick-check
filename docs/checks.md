# The checks

Twelve checks over seven read-only Graph endpoints. Each one reads a setting and reports pass, warn, fail or info. A check whose data could not be read is reported as not assessed and is never counted as a pass.

Thresholds can be changed in code through `evaluate(snapshot, { thresholds })`; the defaults are listed in `src/checks.mjs`.

## QC001 Who can invite guests

- **Reads:** `GET /policies/authorizationPolicy` (needs `Policy.Read.All`)
- **Rule:** Warn if `allowInvitesFrom` is `everyone`. Pass for the other values.
- **Why it matters:** If everyone, including other guests, can invite outsiders, nobody owns the list of external people with access.
- **What to do:** In Entra, External Identities, External collaboration settings, restrict invitations to admins and the Guest Inviter role (or to members only).

## QC002 What guests can see

- **Reads:** `GET /policies/authorizationPolicy` (needs `Policy.Read.All`)
- **Rule:** Fail if `guestUserRoleId` is the member-level role template. Pass for limited and restricted guest roles. Info for an unrecognised template.
- **Why it matters:** Guests with member-level access can read the directory: users, groups and their properties.
- **What to do:** In Entra, External Identities, External collaboration settings, set guest user access to limited or restricted.

## QC003 Who can register applications

- **Reads:** `GET /policies/authorizationPolicy` (needs `Policy.Read.All`)
- **Rule:** Warn if `defaultUserRolePermissions.allowedToCreateApps` is true.
- **Why it matters:** Any user who can register an application can create a place to hold credentials and permissions outside IT review.
- **What to do:** In Entra, Users, User settings, set "Users can register applications" to No and give the right people the Application Developer role.

## QC004 Who can create tenants

- **Reads:** `GET /policies/authorizationPolicy` (needs `Policy.Read.All`)
- **Rule:** Warn if `defaultUserRolePermissions.allowedToCreateTenants` is true.
- **Why it matters:** Users who create their own tenants create shadow IT that your organisation owns nothing of, but that carries your name.
- **What to do:** In Entra, Users, User settings, set "Restrict non-admin users from creating tenants" to Yes.

## QC005 User consent to applications

- **Reads:** `GET /policies/authorizationPolicy` (needs `Policy.Read.All`)
- **Rule:** Fail if `permissionGrantPoliciesAssigned` contains `managePermissionGrantsForSelf.microsoft-user-default-legacy`. Pass for the `-low` policy or no self-consent policy. Info for a custom policy.
- **Why it matters:** When users can consent to any app, one convincing phishing link can hand a mailbox or files to an attacker without a password ever being stolen.
- **What to do:** In Entra, Enterprise applications, Consent and permissions, choose no user consent or consent only for verified publishers and low-impact permissions.

## QC006 Admin consent workflow

- **Reads:** `GET /policies/adminConsentRequestPolicy` (needs `Policy.Read.All`)
- **Rule:** Warn if the admin consent request policy is not enabled.
- **Why it matters:** If users cannot consent and cannot ask, they work around the block or ask for blanket permissions.
- **What to do:** In Entra, Enterprise applications, Admin consent requests, enable the workflow and name reviewers.

## QC007 Security defaults

- **Reads:** `GET /policies/identitySecurityDefaultsEnforcementPolicy` (needs `Policy.Read.All`)
- **Rule:** Pass if security defaults are on. Info if off, because Conditional Access may do the same job. This tool does not read Conditional Access.
- **Why it matters:** Security defaults are Microsoft's baseline for tenants without Conditional Access. Being off is only fine if Conditional Access does the same job.
- **What to do:** If you do not use Conditional Access, turn security defaults on. If you do, confirm MFA for everyone, and for administrators, is enforced there (m365-entra-security-audit checks that).

## QC008 Application secrets and certificates

- **Reads:** `GET /applications` (needs `Application.Read.All`)
- **Rule:** Warn if any password or certificate credential expires within 30 days (`--now` aside, the window is `credentialDays`). Info if only already-expired credentials remain.
- **Why it matters:** An expired secret breaks a service at the worst moment. Old expired credentials clutter the app and hide the ones that matter.
- **What to do:** Rotate secrets that expire soon, prefer certificates or managed identities, and delete expired credentials.

## QC009 Unused licences

- **Reads:** `GET /subscribedSkus` (needs `Organization.Read.All`)
- **Rule:** Warn for a paid, user-assigned SKU with at least 10 unassigned licences and at least 20% unassigned. SKUs with 10,000 or more licences are ignored as free-scale plans.
- **Why it matters:** Licences that are bought but not assigned are money spent for nothing, and a sign that joiner and leaver processes are not matching the contract.
- **What to do:** Reduce the quantity at the next renewal, or assign the licences that are genuinely needed. Check the contract term before changing anything.

## QC010 Directory synchronisation

- **Reads:** `GET /organization` (needs `Organization.Read.All`)
- **Rule:** Pass when the tenant is cloud only. For a synchronised tenant: warn after 3 hours, fail after 24 hours since the last sync.
- **Why it matters:** A stalled sync means leavers disabled on-premises stay enabled in the cloud, and new starters wait.
- **What to do:** Check the sync service on the Entra Connect or cloud sync server, and its health alerts.

## QC011 Authentication methods

- **Reads:** `GET /policies/authenticationMethodsPolicy` (needs `Policy.Read.All`)
- **Rule:** Warn if SMS or voice is enabled, or if Microsoft Authenticator is not. The policy targets decide who is affected, and this tool reports the state, not the targets.
- **Why it matters:** SMS and voice codes can be intercepted or socially engineered; an authenticator app or a security key resists that better.
- **What to do:** In Entra, Authentication methods, Policies: disable SMS and voice where you can, enable Microsoft Authenticator, and consider FIDO2 for administrators.

## QC012 Who is told about problems

- **Reads:** `GET /organization` (needs `Organization.Read.All`)
- **Rule:** Warn if the technical or the security and compliance notification contacts are empty.
- **Why it matters:** Microsoft sends service and security notices to these addresses. If they are empty or go to a leaver, nobody hears.
- **What to do:** In the Microsoft 365 admin centre, Settings, Org settings, Organization profile, set technical and security contacts to monitored shared mailboxes.

## What this tool does not check

Conditional Access policies, MFA registration per user, privileged role holders, stale accounts and guest accounts are covered by [m365-entra-security-audit](https://github.com/pJijesh/m365-entra-security-audit). Exchange Online, SharePoint, Teams, Defender and Intune settings are not covered at all.
