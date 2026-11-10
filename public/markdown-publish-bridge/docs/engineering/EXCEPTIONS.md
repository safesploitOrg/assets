# SFW exceptions and outstanding compliance gaps

## SFW-EXC-001 — Playwright omitted from automatic CI

| Field | Decision / current status |
| --- | --- |
| Requirement | SFW v1.1.0 Sections 6, 7 and 12: browser/E2E verification for Profile B |
| Scope | Markdown Publish Bridge automatic GitHub Actions CI only |
| Owner/requestor | Repository project owner (explicit instruction in conversation on 2026-11-10) |
| Owner decision | Intentionally keep Playwright checks disabled in CI; maintain local/manual tests |
| Approval date | 2026-11-10 — owner instruction to implement local-only browser checks |
| Introduced | Proposed v0.2.0, 2026-11-10 |
| Review/expiry | 2026-12-10 (30 days); do not renew silently |
| Tracking | **SFW-EXC-001** here. **GitHub issue still required** before merging/releasing; repository target not supplied, so no issue was created |
| Severity / exposure | Moderate: PR CI does not detect browser-only regressions, accessibility breakage, CSP/browser discrepancies, or UI interaction failures |
| Compensating control | Keep `tests/browser/test_browser.py`; run `npm run test:browser` locally and record Chromium 390x844, 768x1024, 1440x900 plus major journeys; add Firefox/WebKit for significant changes/releases where supported; test clipboard/import manually |
| CI status | **DISABLED BY DESIGN**. The workflow has no Playwright job or step. Remaining CI jobs are not weakened by `continue-on-error` |
| Release effect | **Not release-ready by CI alone.** Human owner must review local browser results and selected T2 changes before public release; a formal exception ticket and acceptance are outstanding |
| Restoration | Enable an enforceable Chromium PR gate first, then Firefox/WebKit as risk warrants, once runtime/environment stability is verified; remove this exception after evidence-backed re-enablement |

The instruction to omit Playwright from CI authorises the requested configuration change; it is **not** permission for an AI to bypass remaining required controls or to push, deploy, merge or release.

## Additional gaps (not exceptions; not approved waivers)

- **Independent SAST:** the current dependency-free JS sink checker covers only selected unsafe patterns. This is not equivalent to a complete CodeQL/Semgrep scan. Configure an independent scanner appropriate for the public hosting plan before claiming full SFW assurance.
- **Independent secret scanner:** CI now configures checksum-pinned Gitleaks v8.30.1 scans of the working tree and Git history as blocking steps. **Execution on GitHub Actions has not been verified yet**; confirm first-run results and triage legacy findings before claiming enforcement.
- **HTML/CSS/accessibility:** the current local structural checks do not equal W3C HTML/CSS validation or an automated axe accessibility audit. Run these independently as part of release review.
- **Browser evidence:** current execution environment may block browser navigation. `NOT RUN` or `BLOCKED` is not `PASS`.

These are visible limitations, not findings asserted to be fixed or excused.
