# Threat model (Profile B, T2)

## Assets and actors

- **Assets:** authored Markdown, private Confluence information, local clipboard contents, metadata, repository/account integrity, device/browser execution context.
- **Actors:** legitimate author, accidental user error, untrusted Markdown contributor, malicious source URL submitter, compromised remote Markdown, third-party publishing sites.
- **Excluded by design:** API keys, credentials, automatic GitHub writes, DEV/Hugging Face publishing APIs, server-side state.

## Trust boundaries and abuse cases

| Threat | Exposure/impact | Control | Negative test | Residual risk |
| --- | --- | --- | --- | --- |
| Arbitrary URL/SSRF or redirect to unexpected host | Browser network/exfiltration | Exact host and HTTPS validation, `redirect: error`, credential omission, CSP restricted connect-src | `tests/security/converter-security.test.js`, `tests/integration/github-source.test.js` | Browser/extension/network policies outside app; CDN availability |
| Oversized/invalid remote content | Memory/CPU pressure or corrupted Markdown | 4 MB streamed response limit, UTF-8 decoding, 15s timeout, file and textarea limits | Integration size/UTF-8 tests | CPU pressure possible near limit; malicious Markdown patterns are not fuzz-tested |
| Markdown/Confluence HTML XSS | Author browser compromise if rendered as HTML | Use textarea `.value`, DOM `.textContent`, no `innerHTML`, CSP | Security sink scan and browser test | Copied HTML might be unsafe on third-party renderer; warnings not sanitisation |
| YAML front matter injection | Article accidentally published or metadata contaminated | JSON-encoded YAML values, hard-coded `published: false` | Frontmatter injection test | Target editor behaviour could differ; manual preview required |
| Private attachment URLs in public post | Confidentiality/privacy | Warnings for Confluence/private links, manual review, no automatic upload | Existing converter tests | Tool cannot verify remote permissions/authentication |
| Escaping the GitHub repository via relative links | Incorrect/malicious asset URLs | Resolve against base, check repository root | Path traversal tests | Complex exporter mappings need manual review |
| Accidentally sending article data to platform | Privacy | No automatic publication or telemetry, explicit user copy/download | Source inspection and manual browser checks | Clipboard remains available to OS/extensions |
| Compromised CI dependencies/actions | Supply chain | No JS runtime/dev packages, npm lockfile, pinned reviewed GitHub Actions, minimal permissions | YAML review, npm audit | Host/runtime compromise and heuristic scanner limitations remain |

## Decision and release policy

A manual review gate is essential because the converter preserves much of the user's original Markdown and embedded HTML. It **does not claim to sanitise all content**. Document new security findings with exposure, reachability, severity, owner and due date. A selected T2 release requires human owner sign-off; CI Playwright exception is not release permission.
