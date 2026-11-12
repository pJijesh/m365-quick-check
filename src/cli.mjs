import { readFileSync, writeFileSync } from 'node:fs';
import { CHECKS, evaluate, summarise, DEFAULT_THRESHOLDS } from './checks.mjs';
import { collect, SECTIONS, SCOPES, DEFAULT_BASE } from './graph.mjs';
import * as report from './report.mjs';

export const USAGE = `usage: m365-quick-check <command> [options]

commands
  run                 read the tenant through Microsoft Graph (GET only) and report
  check <file>        evaluate a saved snapshot offline
  demo                evaluate the bundled fictional snapshot
  checks              list the checks
  permissions         list the read-only Graph scopes and endpoints used

options
  --token-env NAME    environment variable holding the access token (default GRAPH_ACCESS_TOKEN)
  --save FILE         (run) also write the snapshot to FILE; it contains tenant details, keep it private
  --format FMT        text (default), md or json
  --out FILE          write the report to FILE instead of the console
  --now ISO           evaluate as of this time (default: the time the snapshot was collected)
  --fail-on LEVEL     fail (default), warn or none: the lowest result that gives exit code 1
  --base-url URL      Graph base URL (default ${DEFAULT_BASE})

exit codes: 0 ok, 1 findings at or above --fail-on, 2 usage or collection error`;

const VALUE_FLAGS = new Set(['token-env', 'save', 'format', 'out', 'now', 'fail-on', 'base-url']);

export function parse(argv) {
  const flags = {};
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') flags.help = true;
    else if (a.startsWith('--')) {
      const k = a.slice(2);
      if (!VALUE_FLAGS.has(k)) throw new Error(`unknown option ${a}`);
      if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw new Error(`${a} needs a value`);
      flags[k] = argv[++i];
    } else args.push(a);
  }
  return { flags, args };
}

export function demoPath() { return new URL('../examples/snapshot.json', import.meta.url); }

function render(results, meta, format) {
  if (format === 'md') return report.markdown(results, meta);
  if (format === 'json') return report.json(results, meta);
  return report.text(results, meta);
}

function exitFor(results, failOn) {
  const c = summarise(results);
  if (failOn === 'none') return 0;
  return c.fail > 0 || (failOn === 'warn' && c.warn > 0) ? 1 : 0;
}

export async function main(argv, io = {}) {
  const out = io.out || console.log;
  const err = io.err || console.error;
  const env = io.env || process.env;
  let parsed;
  try { parsed = parse(argv); } catch (e) { err(e.message); err(USAGE); return 2; }
  const { flags, args } = parsed;
  const [cmd, file] = args;
  if (flags.help || !cmd) { (flags.help ? out : err)(USAGE); return flags.help ? 0 : 2; }
  const format = flags.format || 'text';
  const failOn = flags['fail-on'] || 'fail';
  if (!['text', 'md', 'json'].includes(format) || !['fail', 'warn', 'none'].includes(failOn)) { err('invalid --format or --fail-on'); err(USAGE); return 2; }

  if (cmd === 'checks') { for (const c of CHECKS) out(`${c.id}  ${c.title}  (needs ${c.needs[1]})`); return 0; }
  if (cmd === 'permissions') {
    out('Read-only delegated scopes: ' + SCOPES.join(', '));
    for (const s of SECTIONS) out(`GET ${s.path.split('?')[0]}  ${s.scope}`);
    return 0;
  }

  let snapshot;
  try {
    if (cmd === 'demo') snapshot = JSON.parse(readFileSync(demoPath(), 'utf8'));
    else if (cmd === 'check') {
      if (!file) { err('check needs a snapshot file'); return 2; }
      snapshot = JSON.parse(readFileSync(file, 'utf8'));
    } else if (cmd === 'run') {
      const name = flags['token-env'] || 'GRAPH_ACCESS_TOKEN';
      const token = env[name];
      if (!token) { err(`no access token found in the environment variable ${name}; see the README for where to get one`); return 2; }
      snapshot = await collect({ token, base: flags['base-url'] || DEFAULT_BASE, fetchImpl: io.fetchImpl || fetch, sleep: io.sleep });
      if (flags.save) writeFileSync(flags.save, JSON.stringify(snapshot, null, 2) + '\n');
    } else { err(`unknown command ${cmd}`); err(USAGE); return 2; }
  } catch (e) {
    err(`error: ${String(e.message || e)}`);
    return 2;
  }

  let results;
  try { results = evaluate(snapshot, { now: flags.now }); } catch (e) { err(`error: ${e.message}`); return 2; }
  const body = render(results, { collectedAt: snapshot.collectedAt }, format);
  if (flags.out) writeFileSync(flags.out, body + '\n');
  else out(body);
  return exitFor(results, failOn);
}

export { DEFAULT_THRESHOLDS };
