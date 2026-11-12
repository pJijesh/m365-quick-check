// A deliberately small, read-only Microsoft Graph client. It can only issue GET requests.
// The access token is taken from the caller, sent only as a bearer header to the configured origin,
// and never written to a result, a log or an error message.

export const DEFAULT_BASE = 'https://graph.microsoft.com/v1.0';

export const SECTIONS = [
  { key: 'authorizationPolicy', path: '/policies/authorizationPolicy', scope: 'Policy.Read.All' },
  { key: 'adminConsentRequestPolicy', path: '/policies/adminConsentRequestPolicy', scope: 'Policy.Read.All' },
  { key: 'securityDefaults', path: '/policies/identitySecurityDefaultsEnforcementPolicy', scope: 'Policy.Read.All' },
  { key: 'authenticationMethodsPolicy', path: '/policies/authenticationMethodsPolicy', scope: 'Policy.Read.All' },
  { key: 'organization', path: '/organization', scope: 'Organization.Read.All', list: true },
  { key: 'subscribedSkus', path: '/subscribedSkus', scope: 'Organization.Read.All', list: true },
  { key: 'applications', path: '/applications?$select=id,displayName,appId,passwordCredentials,keyCredentials&$top=100', scope: 'Application.Read.All', list: true },
];

export const SCOPES = [...new Set(SECTIONS.map((s) => s.scope))];

export function checkBase(base) {
  const u = new URL(base);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw new Error('the Graph base URL must be https (http is allowed only for localhost)');
  return u;
}

const sleepFor = (ms) => new Promise((r) => setTimeout(r, ms));

export async function collect({ token, base = DEFAULT_BASE, fetchImpl = fetch, maxPages = 20, retries = 3, sleep = sleepFor, now = () => new Date() } = {}) {
  if (!token || typeof token !== 'string') throw new Error('no access token was provided');
  const origin = checkBase(base);
  const root = base.replace(/\/$/, '');

  async function get(url) {
    for (let attempt = 0; ; attempt += 1) {
      const res = await fetchImpl(url, { method: 'GET', headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, redirect: 'error' });
      if ((res.status === 429 || res.status === 503) && attempt < retries) {
        const wait = Math.min(Number(res.headers.get('retry-after')) || 1, 10);
        await sleep(wait * 1000);
        continue;
      }
      return res;
    }
  }

  const sections = {};
  for (const s of SECTIONS) {
    try {
      let url = root + s.path;
      let data = s.list ? [] : null;
      for (let page = 0; page < maxPages && url; page += 1) {
        const res = await get(url);
        if (res.status === 401 || res.status === 403) { sections[s.key] = { status: 'denied', httpStatus: res.status }; data = undefined; break; }
        if (res.status === 404) { sections[s.key] = { status: 'unavailable', httpStatus: 404 }; data = undefined; break; }
        if (!res.ok) { sections[s.key] = { status: 'error', httpStatus: res.status, detail: `HTTP ${res.status}` }; data = undefined; break; }
        const body = await res.json();
        if (s.list) data.push(...(body.value || []));
        else data = body;
        const next = s.list ? body['@odata.nextLink'] : null;
        if (next && new URL(next).origin !== origin.origin) { sections[s.key] = { status: 'error', detail: 'a paging link pointed at another origin and was not followed' }; data = undefined; break; }
        url = next || null;
      }
      if (data !== undefined) sections[s.key] = { status: 'ok', data };
    } catch (e) {
      sections[s.key] = { status: 'error', detail: String(e.message || e).replaceAll(token, '[token]') };
    }
  }
  return { tool: 'm365-quick-check', schema: 1, collectedAt: now().toISOString(), sections };
}
