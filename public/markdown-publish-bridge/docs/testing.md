# Test and verification strategy

SFW baseline: v1.1.0. Profile B, highest relevant change tier T2.

## Automatic, required CI (`.github/workflows/ci.yml`)

| Gate | Exact command | Enforcement | Scope |
| --- | --- | --- | --- |
| Reproducible install | `npm ci --ignore-scripts --no-fund` | Blocking | `package-lock.json`, no external NPM dependencies |
| Static checks | `npm run lint` | Blocking | `node --check`, referenced assets, CSP presence, basic HTML/CSS invariants |
| Unit tests | `npm run test:unit` | Blocking | Markdown conversion/output logic |
| Integration | `npm run test:integration` | Blocking | GitHub transport contract using stub Responses; no live network |
| Security negative tests | `npm run test:security` | Blocking | Host/URL checks, input limits, frontmatter injection, dangerous sinks |
| Heuristic source/secret scan | `npm run scan:static` | Blocking for its limited rules | Source sink patterns, common leaked tokens/keys in textual files |
| Gitleaks independent secret scan | `gitleaks dir .` and `gitleaks git .` (v8.30.1, checksum verified in CI) | Blocking if scanner runs and detects leaks | Working tree and full Git history; not run locally here |
| Dependency audit | `npm audit --audit-level=high` | Blocking at High+ | npm dependencies (currently none) |
| Playwright browser E2E | **NOT in CI** | **Disabled by owner instruction** | See `SFW-EXC-001` |

A green workflow does **not** attest that browser checks, independent SAST, scanner execution in the target GitHub environment, standards-level HTML/CSS validation or accessibility auditing have passed. Refer to `docs/engineering/EXCEPTIONS.md`.

## Local commands

```bash
npm ci --ignore-scripts --offline
npm run verify
npm audit --offline --audit-level=high
```

## Manual browser suite (intentionally excluded from CI)

Python 3.10+ and Playwright are needed:

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
npm run test:browser
# Additional browser coverage when installed:
BRIDGE_BROWSER=firefox npm run test:browser
BRIDGE_BROWSER=webkit npm run test:browser
```

The suite self-hosts `public/` on `127.0.0.1` only and checks: example conversion, tab and keyboard interaction, file import and focus, malicious source not executed, CSP outbound restriction, mobile/tablet/desktop overflow. If a secured execution environment blocks local browser navigation, document it as `BLOCKED/NOT RUN` and perform equivalent manual verification on an authorised workstation.

### Release manual matrix

| Browser | 390x844 | 768x1024 | 1440x900 | Accessibility |
| --- | --- | --- | --- | --- |
| Chromium | Required local test | Required | Required | Keyboard/focus/clipboard, zoom 200%, reduced motion and axe where available |
| Firefox | Significant changes/T2 release | Significant | Significant | Keyboard/focus and rendering |
| WebKit | Significant changes/T2 release | Significant | Significant | Keyboard/focus and rendering |

Do not confuse test script presence with execution. Record the real browser versions, environment, pass/fail evidence, and manual approval in each release record.

## Manual publication checks

- DEV.to Basic Markdown editor: article title/metadata, code fences, image and reference links, tag/series eligibility, draft state and canonical URL.
- Hugging Face blog editor: separate title/summary and Markdown body, no DEV YAML front matter, simple `<details>` flattening.
- Verify any public asset base actually serves images anonymously.
- Check credentials and private Confluence attachments do not appear in pasted outputs.

## Pre-existing baseline

v0.1.0: 14/14 Node converter tests passed before the refactor. No CI workflows, independent security scan or repeatable browser suite in the original project tree. No production/security baseline beyond those tests was established.
