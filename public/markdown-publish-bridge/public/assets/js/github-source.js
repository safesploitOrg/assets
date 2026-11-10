/* Dedicated, bounded, read-only GitHub transport. Untrusted responses are never rendered as HTML. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GithubSource = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const MAX_DOWNLOAD_BYTES = 4_000_000;

  function safeRawUrl(value) {
    let url;
    try { url = new URL(String(value)); }
    catch (_) { throw new Error('Invalid GitHub raw-content URL.'); }
    const segments = url.pathname.split('/').filter(Boolean);
    if (url.protocol !== 'https:' || url.hostname !== 'raw.githubusercontent.com' ||
      url.username || url.password || url.port || url.search || url.hash ||
      segments.length < 4 || !/\.(?:md|markdown|mdx)$/i.test(segments.at(-1))) {
      throw new Error('Only direct HTTPS Markdown downloads from raw.githubusercontent.com are permitted.');
    }
    return url.href;
  }

  async function readMarkdown(response) {
    if (!response.ok) {
      throw new Error(`GitHub returned HTTP ${response.status}. The file may be private, missing or rate-limited.`);
    }
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html') || (contentType &&
      !contentType.includes('text/plain') && !contentType.includes('application/octet-stream') &&
      !contentType.includes('text/markdown'))) {
      throw new Error('GitHub returned an unexpected content type instead of Markdown.');
    }
    const indicated = response.headers.get('content-length');
    if (indicated !== null && Number(indicated) > MAX_DOWNLOAD_BYTES) {
      throw new Error('Markdown file exceeds the 4 MB download limit.');
    }
    if (!response.body || typeof response.body.getReader !== 'function') {
      throw new Error('This browser does not support bounded streaming downloads. Paste the Markdown instead.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let downloaded = 0;
    let markdown = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        downloaded += value.byteLength;
        if (downloaded > MAX_DOWNLOAD_BYTES) {
          await reader.cancel();
          throw new Error('Markdown file exceeds the 4 MB download limit.');
        }
        markdown += decoder.decode(value, { stream: true });
      }
      markdown += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    if (!markdown.trim()) throw new Error('GitHub returned an empty Markdown file.');
    return markdown;
  }

  async function fetchMarkdown(rawUrl, fetchImpl, signal) {
    const url = safeRawUrl(rawUrl);
    const transport = fetchImpl || fetch;
    const response = await transport(url, {
      method: 'GET',
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'text/plain' },
      signal
    });
    return readMarkdown(response);
  }

  return { MAX_DOWNLOAD_BYTES, safeRawUrl, readMarkdown, fetchMarkdown };
});
