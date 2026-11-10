# Changelog

All notable changes to **Markdown Publish Bridge** are recorded here. Versioning follows Semantic Versioning for this pre-1.0 project.

## [0.2.0] - 2026-11-10

### Changed
- Adopted **SFW v1.1.0** engineering documentation and Profile B/T2 classification.
- Moved public entry point and browser assets into `public/` and `public/assets/css|js|images` for a clean static hosting root. Existing conversion formats remain compatible.
- Added dedicated GitHub source transport, bounded streaming downloads, explicit redirect prohibition and source URL/path validation.
- Added a restrictive HTML Content Security Policy, input length bound, improved file-input focus and keyboard target-tab navigation.
- Clarified that automated publication diagnostics are limited checks rather than publication/security approval.

### Added
- `AGENTS.md`, canonical standard, `SECURITY.md`, threat model, testing plan, operations guide and recorded CI exception.
- Locked, dependency-free Node verification, unit/integration/security regression tests and limited source/secret scanning.
- GitHub Actions quality/security gates on pushes and PRs with read-only permissions and pinned action SHAs; Gitleaks working-tree and history checks using a SHA-256 pinned binary.
- **Local/manual** Python Playwright browser suite covering core journeys, focus, hostile content, CSP and responsive layouts.

### Security / operational status
- **Playwright deliberately absent from automatic CI** at owner request; documented as `SFW-EXC-001`, review due 2026-12-10.
- Independent SAST, verification of the proposed Gitleaks CI job, and a11y conformance remain outstanding; no release-readiness claim is made.
- This change is a local implementation package. No GitHub push, deployment, version tag or production release was performed.

## [0.1.0] - 2026-11-10

- Initial standalone HTML/CSS/JS converter for public GitHub or local Confluence Markdown input.
- DEV.to YAML draft output; Hugging Face Markdown body; title/summary copy helpers.
- Relative link/image rewriting, alerts/details transformations and diagnostics.
- 14 Node converter tests, responsive interface and example article.
