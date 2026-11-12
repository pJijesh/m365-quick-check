import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKS } from '../src/checks.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['.git', 'node_modules']);
const TEXT = new Set(['.md', '.mjs', '.cjs', '.json', '.yml', '.cff', '']);
const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    if (SKIP.has(n)) continue;
    const p = join(d, n);
    statSync(p).isDirectory() ? walk(p) : files.push(p);
  }
})(ROOT);
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('no em or en dashes in any text file', () => {
  const bad = files.filter((f) => TEXT.has(extname(f)) && /[\u2013\u2014]/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(ROOT.length + 1));
  assert.deepEqual(bad, []);
});

test('markdown relative links resolve', () => {
  const bad = [];
  for (const f of files.filter((x) => x.endsWith('.md'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const t = m[1];
      if (/^[a-z]+:/.test(t) || t.startsWith('#')) continue;
      if (!existsSync(resolve(dirname(f), t.split('#')[0]))) bad.push(`${f.slice(ROOT.length + 1)} -> ${t}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('README follows the house structure', () => {
  const r = read('README.md');
  assert.equal(r.split('\n')[0], '# m365-quick-check');
  const order = ['**Problem:**', '**For:**', '**Demonstrates:**', '## What it does', '## Install', '## How it works', '## How it is built', '## Design choices', '## Limitations', '## Verification status', '## Roadmap', '## Related work', '## Licence'];
  const pos = order.map((m) => r.indexOf(m));
  assert.ok(pos.every((p) => p >= 0), `missing: ${order.filter((_, i) => pos[i] < 0)}`);
  assert.deepEqual(pos, [...pos].sort((a, b) => a - b));
});

test('the README says it has not been run on a real tenant', () => {
  assert.match(read('README.md'), /never been run against a real tenant/);
});

test('docs/checks.md has an entry for every check, and the README count matches', () => {
  const doc = read('docs/checks.md');
  for (const c of CHECKS) assert.ok(doc.includes(`## ${c.id} ${c.title}`), c.id);
  assert.ok(read('README.md').includes('**Twelve checks**'));
  assert.equal(CHECKS.length, 12);
});

test('no write scope and no write method anywhere in the source or the docs', () => {
  for (const f of files.filter((x) => /(src|bin)\//.test(x) && x.endsWith('.mjs'))) {
    const t = readFileSync(f, 'utf8');
    assert.ok(!/ReadWrite/.test(t), f);
    assert.ok(!/method:\s*'(POST|PATCH|PUT|DELETE)'/.test(t), f);
  }
  assert.ok(!/\.ReadWrite\./.test(read('docs/permissions.md')));
});

test('package metadata, changelog and citation agree, and there are no dependencies', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.match(read('CHANGELOG.md'), new RegExp(`## \\[${pkg.version.replace(/\./g, '\\.')}\\]`));
  assert.ok(read('CITATION.cff').includes(`version: ${pkg.version}`));
});

test('no secrets or real-looking tokens in the repository', () => {
  const bad = files.filter((f) => TEXT.has(extname(f)) && /eyJ[A-Za-z0-9_-]{20,}\.|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|-----BEGIN (RSA |EC )?PRIVATE KEY-----/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(ROOT.length + 1));
  assert.deepEqual(bad, []);
});

test('the example snapshot is fictional: reserved example domains and a fictional name only', () => {
  const t = read('examples/snapshot.json');
  const domains = [...t.matchAll(/@([a-z0-9.-]+\.[a-z]{2,})/gi)].map((m) => m[1].toLowerCase());
  assert.ok(domains.length > 0);
  for (const d of domains) assert.ok(d.endsWith('.example'), d);
  assert.match(t, /fictional/);
  assert.ok(!/"tenantId"/.test(t));
});

test('required files exist', () => {
  for (const f of ['LICENSE', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'CITATION.cff', 'CHANGELOG.md', '.github/workflows/test.yml', '.github/dependabot.yml', 'docs/images/banner.png', 'docs/permissions.md', 'examples/report.md']) {
    assert.ok(existsSync(join(ROOT, f)), f);
  }
});
