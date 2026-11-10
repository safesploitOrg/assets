# Security policy — Markdown Publish Bridge

## Supported version and scope

This security baseline applies to proposed **v0.2.0**. Prior v0.1.0 has fewer network-input and size checks. Only copy/paste conversion is supported; this tool is **not** a Markdown sanitiser or automatic publishing service.

## Disclosure

Do **not** post credentials, exploit payloads containing real secrets, or private article contents in public GitHub issues. Contact the repository maintainer using a private channel. If the repository supports GitHub **Private vulnerability reporting**, use its **Security > Report a vulnerability** route. If no private contact channel has been configured, the maintainer must establish one before public launch.

## Security boundaries

- **Inputs:** untrusted Markdown paste, uploaded Markdown, metadata, and GitHub source URLs.
- **Network:** only explicit user-triggered HTTPS `raw.githubusercontent.com` Markdown fetches. Never supply a personal access token.
- **Size/time:** up to 4 MB streaming public download, up to 4 MB uploaded file, up to 4 million characters pasted/processed; fetches have a 15-second abort timer.
- **Redirects:** fetch uses `redirect: error` to avoid third-party redirects; credentials and referrer are omitted.
- **Rendering:** untrusted source is placed in textareas and text nodes rather than injected as HTML. The app **does not execute** Markdown or publish it automatically.
- **Outputs:** potentially unsafe links and HTML may remain in the copied Markdown and are flagged for manual review. Users must inspect article previews and check linked/public assets.
- **Secrets/storage:** no persistent article content, API keys, cookies or telemetry.
- **CSP:** local meta policy blocks inline scripts and restricts browser network connection to GitHub's raw content host. Production hosting should add response headers in `docs/operations.md`.

## Vulnerability policy and CI gates

- Confirmed actively exploited flaws, reachable critical vulnerabilities or exposed credentials: **block release** and contain.
- Newly introduced reachable High: **block affected release** until mitigated.
- Medium/Low: owner triages exploitability, reachability and remediation dates; not automatically waived.
- `npm audit --audit-level=high` is a blocking dependency gate. With zero runtime/development dependencies, it currently has limited scope.
- `npm run scan:static` is a **narrow heuristic guard**, not independent full SAST. CI additionally installs a SHA-256 pinned Gitleaks v8.30.1 binary and runs blocking working-tree/history secret scans; these must be verified on the actual repository. Independent CodeQL/Semgrep SAST remains a planned release requirement.
- Local Playwright tests exist but are deliberately absent from automatic CI. This SFW exception is recorded in `docs/engineering/EXCEPTIONS.md` and **does not imply release readiness**.

## Security response

1. Isolate the affected deployment if there is a credible compromise; do not publish further content until containment.
2. Record affected revision, reproduction, impact, exposure and whether findings predate the change.
3. Fix and add negative tests, run local checks and obtain owner approval where required.
4. Release only the reviewed revision; roll back by redeploying the last known-good static `public/` tree.

This repository has no backend database or stored user content requiring recovery.
