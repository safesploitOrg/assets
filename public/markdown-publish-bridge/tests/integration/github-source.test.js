'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { safeRawUrl, readMarkdown, fetchMarkdown, MAX_DOWNLOAD_BYTES } =
  require('../../public/assets/js/github-source.js');

const raw = 'https://raw.githubusercontent.com/safesploitOrg/docs/main/article.md';

function response(text, options = {}) {
  return new Response(text, {
    status: options.status || 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', ...options.headers }
  });
}

test('only direct trusted HTTPS GitHub Markdown fetch URLs are allowed', () => {
  assert.equal(safeRawUrl(raw), raw);
  for (const bad of [
    'https://raw.githubusercontent.com.evil.test/org/repo/main/file.md',
    'http://raw.githubusercontent.com/org/repo/main/file.md',
    'https://raw.githubusercontent.com@evil.test/org/repo/main/file.md',
    'https://raw.githubusercontent.com/org/repo/main/file.md?token=secret',
    'https://raw.githubusercontent.com/org/repo/main/file.txt',
    'https://github.com/org/repo/blob/main/file.md',
    'file:///etc/passwd'
  ]) assert.throws(() => safeRawUrl(bad), /Only direct HTTPS/);
});

test('fetch uses non-credentialed no-redirect transport', async () => {
  let observed = null;
  const result = await fetchMarkdown(raw, async (url, options) => {
    observed = { url, options };
    return response('# A test article\nHello');
  });
  assert.equal(result, '# A test article\nHello');
  assert.equal(observed.url, raw);
  assert.equal(observed.options.method, 'GET');
  assert.equal(observed.options.redirect, 'error');
  assert.equal(observed.options.credentials, 'omit');
  assert.equal(observed.options.referrerPolicy, 'no-referrer');
});

test('rejects HTML and unexpected content types', async () => {
  await assert.rejects(readMarkdown(response('<html></html>', { headers: { 'content-type': 'text/html' } })), /unexpected content type/);
  await assert.rejects(readMarkdown(response('{}', { headers: { 'content-type': 'application/json' } })), /unexpected content type/);
});

test('rejects inaccessible, redirected and empty responses', async () => {
  await assert.rejects(readMarkdown(response('missing', { status: 404 })), /HTTP 404/);
  await assert.rejects(readMarkdown(new Response(null, { status: 302, headers: { location: 'https://example.com' } })), /HTTP 302/);
  await assert.rejects(readMarkdown(response('   ')), /empty Markdown/);
});

test('rejects announced oversized responses before reading', async () => {
  const result = response('x', { headers: { 'content-length': String(MAX_DOWNLOAD_BYTES + 1) } });
  await assert.rejects(readMarkdown(result), /4 MB/);
});

test('rejects a stream exceeding the limit even when Content-Length lies', async () => {
  const tooLarge = new Uint8Array(MAX_DOWNLOAD_BYTES + 1);
  tooLarge.fill(65);
  const result = new Response(new ReadableStream({
    start(controller) { controller.enqueue(tooLarge); controller.close(); }
  }), { headers: { 'content-type': 'text/plain', 'content-length': '1' } });
  await assert.rejects(readMarkdown(result), /4 MB/);
});

test('rejects invalid UTF-8 instead of silently altering imported Markdown', async () => {
  const bytes = Uint8Array.from([0xc3, 0x28]);
  await assert.rejects(readMarkdown(new Response(bytes, { headers: { 'content-type': 'text/plain' } })), /encoded|valid|utf|fatal/i);
});

test('rejects browsers without streaming support', async () => {
  await assert.rejects(readMarkdown({
    ok: true,
    headers: { get: () => 'text/plain' },
    body: null
  }), /bounded streaming/);
});
