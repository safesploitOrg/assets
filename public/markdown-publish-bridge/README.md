# Markdown Publish Bridge

**Version:** 0.2.0 · **Standard:** SFW v1.1.0 · **Profile:** B · **Risk:** T2 for untrusted parsing/remote fetching

A GitHub-first static converter for Confluence Markdown exports. Produce copy-ready drafts for DEV Community and Hugging Face without accounts, publish APIs, analytics, automatic uploads or runtime JavaScript dependencies.

```text
Confluence Markdown exporter -> GitHub (source of truth)
                                   |
                              public/index.html
                                   |
                    +--------------+--------------+
                    |                             |
               DEV.to draft                 Hugging Face body
                    |                             |
                 Copy/paste                 Copy/paste
```

## Quick start

No Node/npm installation is required to **use** the page. Serve only the `public/` directory:

```bash
python3 -m http.server 8080 --bind 127.0.0.1 --directory public
# Open http://127.0.0.1:8080
```

1. Paste a **public** GitHub `.md` URL and press **Fetch**, or upload/paste the article locally.
2. Inspect the extracted title, description, series and up to four DEV tags.
3. Review link/image resolution, warning messages and privacy-sensitive attachments.
4. Select DEV.to (draft YAML + Markdown) or Hugging Face (Markdown body; title copied separately).
5. Copy or download the output and preview it in the target platform before publication.

**GitHub is the repository source of truth, not necessarily the canonical public article URL.** Set `canonical_url` only when an actual primary published webpage exists.

## Supported links and formats

```text
https://github.com/OWNER/REPO/blob/main/path/article.md
https://raw.githubusercontent.com/OWNER/REPO/main/path/article.md
```

Public source fetches support `.md`, `.markdown` and `.mdx` filenames; complex MDX/Confluence macros are not converted. A branch name containing `/` cannot be inferred from the URL: use a commit permalink, or import the Markdown manually.

Local files may be up to **4 MB**, remotely fetched files up to **4 MB**, and processed text up to **4 million characters**. GitHub downloads fail closed on redirects, unexpected content types and invalid UTF-8. The source and converted outputs are never sent to DEV.to or Hugging Face by this application.

**Private GitHub repos:** use the local import/paste option; host any article images on an appropriate public asset URL. The converter flags likely broken Confluence attachment references but cannot authenticate or prove asset accessibility.

## Project layout

```text
markdown-publish-bridge/
├── .github/workflows/ci.yml
├── AGENTS.md
├── ARCHITECTURE.md
├── SECURITY.md
├── CHANGELOG.md
├── docs/
│   ├── engineering/SFW_AI_ENGINEERING_STANDARD.md
│   ├── engineering/EXCEPTIONS.md
│   ├── threat-model.md
│   ├── testing.md
│   └── operations.md
├── examples/
├── public/                          # Deploy only this directory
│   ├── index.html
│   └── assets/
│       ├── css/styles.css
│       ├── js/{converter,github-source,app}.js
│       └── images/
├── scripts/                         # Offline check scripts
├── tests/{unit,integration,security,browser}/
├── package.json
└── package-lock.json
```

## Development and CI

Development checks require **Node.js 20+**; no npm runtime or development dependencies are installed.

```bash
npm ci --ignore-scripts --offline
npm run verify
npm audit --offline --audit-level=high
```

The GitHub Actions workflow on push/PR enforces syntax/structural checks, unit/integration/security negative tests, heuristic source checks, **independent Gitleaks secret scans** (working tree and Git history), and `npm audit --audit-level=high`. CI actions are pinned to reviewed commit SHAs, with read-only default permissions.

### ⚠️ Playwright intentionally disabled in CI

**Per project-owner instruction, there is no automatic Playwright CI job.** The tests are retained for local/manual use:

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
npm run test:browser
```

To test other engines after installation: `BRIDGE_BROWSER=firefox npm run test:browser` or `BRIDGE_BROWSER=webkit npm run test:browser`. Manual browser validation is expected before public release. The dated exception, expiry, compensating checks and incomplete assurance are recorded in [`docs/engineering/EXCEPTIONS.md`](docs/engineering/EXCEPTIONS.md). See [`docs/testing.md`](docs/testing.md) for the full matrix.

## Security and known limitations

- CSP restricts scripts, styles and remote connections. Pasted Markdown is displayed only in textareas/text nodes.
- Malicious Markdown, HTML, JavaScript links and secrets are **not sanitised** for publication. Warnings are advisory; review the actual destination preview.
- No backend, accounts, tokens, telemetry, persistent browser storage, GitHub writes or automatic deployment.
- Existing GitHub Pages deployments must change their publish root to `public/`; simply opening the repository root as a Pages site is not supported.
- Local offline scanners are **heuristics**, not independent SAST, full HTML/CSS conformance or an accessibility audit. CI additionally configures Gitleaks with a checksum-pinned binary, but its execution must be verified on the actual repository. Do not claim that a green CI run alone meets all SFW release requirements.
- Browser validation and selected T2 changes require recorded human owner release review. **No release/push/deploy action has been taken by this project package.**

See [`SECURITY.md`](SECURITY.md) and [`docs/threat-model.md`](docs/threat-model.md).

## Reference editors

- DEV.to editor guide: https://dev.to/p/editor_guide
- DEV.to new post: https://dev.to/new
- Hugging Face blog articles: https://huggingface.co/docs/hub/blog-articles
- Hugging Face new blog: https://huggingface.co/new-blog
