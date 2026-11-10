'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateGithubUrl, normaliseUrl, convertArticle, MAX_MARKDOWN_CHARS } =
  require('../../public/assets/js/converter.js');

const sourceUrl = 'https://github.com/safesploitOrg/docs/blob/main/articles/example.md';

test('GitHub source validation rejects encoded slash, backslash, credentials and ambiguous refs', () => {
  for (const url of [
    'https://github.com/user:pass@github.com/org/repo/blob/main/a.md',
    'https://github.com/org/repo/blob/main/a.md?raw=1',
    'https://github.com/org/repo/blob/main/a.md#fragment',
    'https://github.com/org/repo/blob/main/%2fetc.md',
    'https://github.com/org/repo/blob/main/%5cetc.md',
    'https://github.com/org/repo/blob/feature%2Fbranch/article.md',
    'https://github.com/org/repo/blob/main/%00article.md',
    'https://github.com/org/repo/blob/main/%GG.md'
  ]) assert.throws(() => validateGithubUrl(url), /credential|unsafe|malformed|unsupported|encoding|Supported/i, url);
});

test('absolute metadata URLs use HTTPS only', () => {
  assert.equal(normaliseUrl('javascript:alert(1)'), '');
  assert.equal(normaliseUrl('http://example.test/image.png'), '');
  assert.equal(normaliseUrl('https://example.test/article'), 'https://example.test/article');
  assert.equal(normaliseUrl('https://user:password@example.test/article'), '');
});

test('converter rejects oversized pasted Markdown before expensive transformations', () => {
  assert.throws(() => convertArticle('a'.repeat(MAX_MARKDOWN_CHARS + 1)), RangeError);
});

test('potentially unsafe links are identified and retained for human review only', () => {
  const result = convertArticle('Hello [click](javascript:alert(1)) and ![image](data:image/png;base64,a)', {
    sourceUrl
  });
  assert.ok(result.findings.some(x => x.code === 'unsafe-url'));
  assert.match(result.devto, /javascript:alert/);
});

test('script tags are flagged but are never executed/rendered by converter', () => {
  const injected = '<script>alert("owned")</script>';
  const result = convertArticle('# Title\n\n' + injected, { sourceUrl });
  assert.ok(result.findings.some(x => x.code === 'html-embed'));
  assert.match(result.devto, /<script>alert/);
});

test('frontmatter injection cannot introduce a published true flag', () => {
  const result = convertArticle('Body', {
    title: 'A title\npublished: true\nmalicious: "yes"', sourceUrl
  });
  assert.match(result.devto, /^published: false$/m);
  assert.doesNotMatch(result.devto, /^published: true$/m);
});

test('out-of-repository traversal does not rewrite links outside known repo root', () => {
  const result = convertArticle('![image](../../../../../../outside.png)', { sourceUrl });
  assert.ok(result.findings.some(x => x.code === 'outside-repo'));
  assert.match(result.devto, /\.\.\/\.\.\/\.\.\/outside\.png/);
});
