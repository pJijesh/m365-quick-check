import { STATUS_ORDER, summarise } from './checks.mjs';

const LABEL = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', info: 'INFO', skipped: 'SKIP' };

export function text(results, meta = {}) {
  const lines = [];
  for (const r of results) lines.push(`${r.id}  ${LABEL[r.status].padEnd(4)}  ${r.title}: ${r.detail}`);
  const c = summarise(results);
  lines.push('', `${results.length} checks: ${c.fail} fail, ${c.warn} warn, ${c.pass} pass, ${c.info} info, ${c.skipped} not assessed${meta.collectedAt ? ` (data collected ${meta.collectedAt})` : ''}`);
  return lines.join('\n');
}

export function markdown(results, meta = {}) {
  const c = summarise(results);
  const out = ['# Microsoft 365 quick check', ''];
  if (meta.collectedAt) out.push(`Data collected: ${meta.collectedAt}`, '');
  out.push(`**${c.fail} fail, ${c.warn} warn, ${c.pass} pass, ${c.info} info, ${c.skipped} not assessed.**`, '');
  out.push('This report is a read-only snapshot of tenant settings. It is not an audit, and a pass means no known problem was found in the setting checked.', '');
  out.push('| Check | Result | What was found |', '| --- | --- | --- |');
  for (const r of results) out.push(`| ${r.id} ${r.title} | ${LABEL[r.status]} | ${r.detail.replace(/\|/g, '/')} |`);
  out.push('');
  const act = [...results].filter((r) => r.status === 'fail' || r.status === 'warn').sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.id.localeCompare(b.id));
  if (act.length) {
    out.push('## What to do', '');
    for (const r of act) out.push(`### ${r.id} ${r.title} (${LABEL[r.status]})`, '', r.detail, '', `Why it matters: ${r.why}`, '', `What to do: ${r.fix}`, '');
  }
  const skipped = results.filter((r) => r.status === 'skipped');
  if (skipped.length) {
    out.push('## Not assessed', '');
    for (const r of skipped) out.push(`- ${r.id} ${r.title}: ${r.detail}`);
    out.push('');
  }
  return out.join('\n');
}

export function json(results, meta = {}) {
  return JSON.stringify({ ...meta, summary: summarise(results), results }, null, 2);
}
