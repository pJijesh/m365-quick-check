# Contributing

Thanks for taking an interest. This is a small tool: standard library only, deterministic output, plain wording.

## Ground rules

1. **Read-only, always.** The Graph client issues GET requests and nothing else, and every scope ends in `.Read.All`. A test fails if a write method or a `ReadWrite` scope appears.
2. **No dependencies.** Node 18 or later and `node:test`.
3. **Fictional data only.** `examples/` describes an invented company. Never commit a real tenant snapshot, domain, address or credential, and redact anything you paste into an issue.
4. **A new check needs four things**: the check in `src/checks.mjs`, a pass, a warn or fail, and a not-assessed case in `test/checks.test.mjs`, and an entry in `docs/checks.md`. Name the Graph endpoint and property, and confirm both in Microsoft's reference.
5. **Say what the data does not show.** If a setting's effect depends on targets, groups or Conditional Access, the message must say so rather than imply a pass.
6. **Prefer silence to a noisy check.** A check that cries wolf trains people to ignore the report.
7. **British English, plain tone, no long dashes.** A test fails if an em dash or en dash appears in a text file.

## Development

```bash
node --test test/*.test.mjs
node bin/m365-quick-check.mjs demo
node bin/m365-quick-check.mjs demo --format md --out examples/report.md --fail-on none   # after changing results
```

The tests use a local fake Graph server, so they need no tenant and no network.

## Suggesting a check

Open a suggestion. Name the setting, the Graph endpoint and property that exposes it, and what a good and a bad value look like.
