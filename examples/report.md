# Microsoft 365 quick check

Data collected: 2026-11-12T09:00:00.000Z

**1 fail, 5 warn, 5 pass, 1 info, 0 not assessed.**

This report is a read-only snapshot of tenant settings. It is not an audit, and a pass means no known problem was found in the setting checked.

| Check | Result | What was found |
| --- | --- | --- |
| QC001 Who can invite guests | PASS | Guest invitations are limited (allowInvitesFrom is adminsAndGuestInviters). |
| QC002 What guests can see | PASS | Guests have limited access. |
| QC003 Who can register applications | WARN | Every user can register applications. |
| QC004 Who can create tenants | PASS | Non-admin users cannot create tenants. |
| QC005 User consent to applications | FAIL | Users can consent to any application for any permission that does not need admin consent. |
| QC006 Admin consent workflow | PASS | The admin consent workflow is on with 1 reviewer scope(s). |
| QC007 Security defaults | INFO | Security defaults are off. That is expected when Conditional Access enforces MFA; this tool does not read Conditional Access. |
| QC008 Application secrets and certificates | WARN | 2 credential(s) expire within 30 days: Fernwood HR sync (18d), Fernwood reporting (23d). 1 more have already expired. |
| QC009 Unused licences | WARN | 1 SKU(s) have many unassigned licences: EXCHANGEENTERPRISE (28 of 40 unused). |
| QC010 Directory synchronisation | PASS | The last directory sync was 0.3 hours ago. |
| QC011 Authentication methods | WARN | SMS is enabled. The policy targets decide who is affected. |
| QC012 Who is told about problems | WARN | No security and compliance notification contact is set. |

## What to do

### QC005 User consent to applications (FAIL)

Users can consent to any application for any permission that does not need admin consent.

Why it matters: When users can consent to any app, one convincing phishing link can hand a mailbox or files to an attacker without a password ever being stolen.

What to do: In Entra, Enterprise applications, Consent and permissions, choose no user consent or consent only for verified publishers and low-impact permissions.

### QC003 Who can register applications (WARN)

Every user can register applications.

Why it matters: Any user who can register an application can create a place to hold credentials and permissions outside IT review.

What to do: In Entra, Users, User settings, set "Users can register applications" to No and give the right people the Application Developer role.

### QC008 Application secrets and certificates (WARN)

2 credential(s) expire within 30 days: Fernwood HR sync (18d), Fernwood reporting (23d). 1 more have already expired.

Why it matters: An expired secret breaks a service at the worst moment. Old expired credentials clutter the app and hide the ones that matter.

What to do: Rotate secrets that expire soon, prefer certificates or managed identities, and delete expired credentials.

### QC009 Unused licences (WARN)

1 SKU(s) have many unassigned licences: EXCHANGEENTERPRISE (28 of 40 unused).

Why it matters: Licences that are bought but not assigned are money spent for nothing, and a sign that joiner and leaver processes are not matching the contract.

What to do: Reduce the quantity at the next renewal, or assign the licences that are genuinely needed. Check the contract term before changing anything.

### QC011 Authentication methods (WARN)

SMS is enabled. The policy targets decide who is affected.

Why it matters: SMS and voice codes can be intercepted or socially engineered; an authenticator app or a security key resists that better.

What to do: In Entra, Authentication methods, Policies: disable SMS and voice where you can, enable Microsoft Authenticator, and consider FIDO2 for administrators.

### QC012 Who is told about problems (WARN)

No security and compliance notification contact is set.

Why it matters: Microsoft sends service and security notices to these addresses. If they are empty or go to a leaver, nobody hears.

What to do: In the Microsoft 365 admin centre, Settings, Org settings, Organization profile, set technical and security contacts to monitored shared mailboxes.

