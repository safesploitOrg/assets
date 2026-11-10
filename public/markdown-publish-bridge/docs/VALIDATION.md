# Implementation verification record — 2026-11-10

## Target

Proposed **Markdown Publish Bridge v0.2.0**, SFW v1.1.0, Profile B; T2 review applies to changes in untrusted Markdown parsing and remote URL fetch.

## Baseline observations (v0.1.0)

- Original tree: root-level HTML/CSS/JS, 14 converter tests, no workflow, no SFW policy entry point, no documented threat model.
- Before changes: `npm test` completed **14/14 PASS**.
- No original GitHub Actions run or production vulnerability baseline was available for comparison; additional claims are not made.

## Results on proposed v0.2.0

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Locked offline install | PASS | `npm ci --offline --ignore-scripts --no-audit --no-fund` |
| Structure, CSS guardrails, HTML links/CSP and JS syntax | PASS | `npm run lint` |
| Converter unit tests | PASS | `npm run test:unit`: **14/14** |
| GitHub transport integration tests | PASS | `npm run test:integration`: **8/8** |
| Security negative tests | PASS | `npm run test:security`: **9/9** |
| Heuristic secret and JS sink scan | PASS | `npm run scan:secrets` |
| npm dependency audit | PASS (no dependencies) | `npm audit --offline --audit-level=high`: **0 vulnerabilities**; limited relevance without dependencies |
| CSS parser (local independent inspection) | PASS | PostCSS parse using environment-supplied global tool; not part of portable CI |
| HTML parser (local independent inspection) | PASS | Python `HTMLParser` parsed page; not full W3C validation |
| GitHub Actions YAML syntax | PASS | PyYAML parsed two jobs; not evidence of a completed workflow run |
| Gitleaks working-tree/history scans | NOT RUN | CI steps configured with release SHA-256; require GitHub Actions execution to verify |
| Browser Playwright | BLOCKED / NOT VERIFIED | `npm run test:browser` attempted; local Chromium navigation returned `net::ERR_BLOCKED_BY_ADMINISTRATOR` for localhost and file URLs in the execution environment |
| Firefox and WebKit responsive/a11y | NOT RUN | Requires authorised workstation/tooling |
| Independent SAST and automated axe/accessibility | NOT RUN | Tracked as outstanding in `docs/engineering/EXCEPTIONS.md` |
| GitHub workflow live execution | NOT RUN | This is a local implementation artifact only; not pushed |

## Security and release disposition

- New protections: exact GitHub host/scheme checks, path segment validation, redirect rejection, credential/referrer omission, streaming byte bound, strict UTF-8, CSP, safe DOM sinks and input size caps.
- Source output may still contain unsafe HTML or links: warning-only by design and human publication preview is mandatory.
- No new known critical or High finding was observed by the local checks; this is **not** evidence of a comprehensive vulnerability assessment.
- `SFW-EXC-001` records the owner-requested **Playwright CI omission**, expiry/review **2026-12-10**, manual compensating tests and outstanding issue creation.
- **Do not claim release-ready solely on this local verification.** Before merging/publishing: verify the workflow, triage first Gitleaks results, run manual browser checks in an authorised environment, complete external security/a11y review and obtain selected T2 human owner sign-off.
- No push, merge, tag, release or production deployment was performed.
