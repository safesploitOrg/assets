# Hosting, operations and rollback

## Hosting model

The application is a static page and can be hosted from the **`public/` directory** with no build system. Node and Python are only developer/test tools. There is no database, server-side session, AI API or background job.

Local preview:

```bash
python3 -m http.server 8080 --bind 127.0.0.1 --directory public
# Open http://127.0.0.1:8080
```

For GitHub Pages, deploy only the contents of `public/` from a reviewed/tested revision. Do not point a public document root at the repository root, which contains the canonical standard and internal engineering materials. This repository intentionally contains **no automatic Pages deployment workflow**.

## Deployment headers

The HTML includes a restrictive meta CSP, but response headers provide additional protections that meta tags cannot, including frame-ancestors. For configurable hosts, plan to send (after validating host-specific behaviour):

```text
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src https://raw.githubusercontent.com; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

GitHub Pages does not provide arbitrary user-configured response headers for every use case. Evaluate a fronting CDN or alternative host if headers are a production requirement. Serve over HTTPS. Do not weaken CSP merely to embed remote images or analytics.

## Monitoring and maintenance

- Periodically check site availability, editor links and one representative copy/paste conversion; no content logging is needed.
- Check GitHub raw-content CORS/availability and target publishing editor changes when regressions are reported.
- Review SFW policy and CI exception at least quarterly and on material incidents; the Playwright exception expires **2026-12-10**.
- No regular backups of user articles are needed: GitHub remains authoritative and the browser stores no article content.
- Do not log copied Markdown, authentication data or source article text.

## Incident and rollback

- Stop promoting new releases if a reachable security defect or disclosure is discovered.
- Revert hosting to the last known-good published `public/` tree associated with a tested Git revision; invalidate CDN cache when applicable.
- Confirm the site loads, private content is not exposed, CSP is enforced and a sample conversion works.
- Fix root causes and add security regression tests before re-release.

No production deployment, monitoring connection or hosting settings were changed during this local refactor.
