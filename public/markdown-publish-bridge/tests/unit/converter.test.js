'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { convertArticle, defaultMetadata, validateGithubUrl, splitFrontMatter } = require('../../public/assets/js/converter.js');

const source = 'https://github.com/safesploitOrg/docs/blob/main/articles/networking/guide.md';
const base = { title: 'My Article', tags: 'linux, devops', sourceUrl: source };

function output(markdown, extras = {}) {
  return convertArticle(markdown, { ...base, ...extras });
}

test('GitHub blob input resolves to raw URL and source context', () => {
  const parsed = validateGithubUrl(source);
  assert.equal(parsed.file, 'articles/networking/guide.md');
  assert.equal(parsed.rawUrl, 'https://raw.githubusercontent.com/safesploitOrg/docs/main/articles/networking/guide.md');
  assert.equal(parsed.blobUrl, source);
});

test('GitHub raw URL input is supported', () => {
  const parsed = validateGithubUrl('https://raw.githubusercontent.com/org/blog/main/articles/post.md');
  assert.equal(parsed.blobUrl, 'https://github.com/org/blog/blob/main/articles/post.md');
});

test('Reject unsupported URL and non-markdown path', () => {
  assert.throws(() => validateGithubUrl('https://evil.example.com/a.md'), /Supported sources/);
  assert.throws(() => validateGithubUrl('https://github.com/org/repo/blob/main/file.txt'), /Markdown file/);
  assert.throws(() => validateGithubUrl('http://github.com/org/repo/blob/main/file.md'), /HTTPS/);
});

test('read YAML source metadata and omit source front matter', () => {
  const md = [
    '---',
    'title: "A: test"',
    'tags: [devops, linux]',
    'description: >-',
    '  One useful line',
    '  of description',
    '---',
    '# A: test',
    'A paragraph.'
  ].join('\n');
  const defaults = defaultMetadata(md, 'post.md');
  assert.equal(defaults.title, 'A: test');
  assert.equal(defaults.tags, 'devops, linux');
  assert.equal(defaults.description, 'One useful line of description');
  const result = convertArticle(md, { tags: defaults.tags });
  assert.match(result.devto, /title: "A: test"/);
  assert.match(result.devto, /published: false/);
  assert.doesNotMatch(result.devto, /description: >-/);
  assert.equal((result.devto.match(/^---$/gm) || []).length, 2);
  assert.doesNotMatch(result.devto, /# A: test/);
  assert.equal(splitFrontMatter(md).detected, true);
});

test('Rewrites relative image paths to GitHub raw and links to GitHub blob', () => {
  const md = [
    '# My Article',
    '![A diagram](./assets/topology.png "Network")',
    '[Sibling](../intro.md)',
    '[Root](/docs/index.md)',
    '[External](https://example.com/file.md)',
    '[Same page](#section)'
  ].join('\n');
  const { devto, stats } = output(md);
  assert.match(devto, /raw\.githubusercontent\.com\/safesploitOrg\/docs\/main\/articles\/networking\/assets\/topology\.png "Network"/);
  assert.match(devto, /github\.com\/safesploitOrg\/docs\/blob\/main\/articles\/intro\.md/);
  assert.match(devto, /github\.com\/safesploitOrg\/docs\/blob\/main\/docs\/index\.md/);
  assert.match(devto, /\[External\]\(https:\/\/example\.com\/file\.md\)/);
  assert.match(devto, /\[Same page\]\(#section\)/);
  assert.equal(stats.rewritten, 3);
});

test('Never rewrite fenced code, indented code or inline code', () => {
  const md = [
    '# My Article',
    'Here is `![leave](./inline.png)` and a real ![change](./image.png).',
    '```markdown',
    '![leave](./literal.png)',
    '```',
    '    ![leave](./indented.png)'
  ].join('\n');
  const { devto, stats } = output(md);
  assert.match(devto, /`!\[leave\]\(\.\/inline\.png\)`/);
  assert.match(devto, /!\[leave\]\(\.\/literal\.png\)/);
  assert.match(devto, /!\[leave\]\(\.\/indented\.png\)/);
  assert.match(devto, /raw\.githubusercontent\.com.*\/image\.png/);
  assert.equal(stats.rewritten, 1);
  assert.equal(stats.fences, 1);
});

test('Preserves fenced code containing backticks and GitHub links', () => {
  const md = '# My Article\n\n~~~bash\necho "[docs](docs/readme.md)"\n~~~';
  const { devto } = output(md);
  assert.match(devto, /echo "\[docs\]\(docs\/readme\.md\)"/);
});

test('DEV receives safe draft front matter; HF receives body only', () => {
  const result = output('# My Article\n\n## Introduction\nHello.', {
    canonicalUrl: 'https://blog.example.com/my-article',
    series: 'My series', description: 'Explains something useful.',
    tags: 'devops, linux, security, automation, fifth'
  });
  assert.match(result.devto, /^---\ntitle: "My Article"\npublished: false/m);
  assert.match(result.devto, /canonical_url: "https:\/\/blog\.example\.com\/my-article"/);
  assert.match(result.devto, /series: "My series"/);
  assert.match(result.devto, /tags: devops, linux, security, automation/);
  assert.doesNotMatch(result.devto, /fifth/);
  assert.equal(result.huggingface, '## Introduction\nHello.\n');
  assert.ok(result.findings.some(f => f.code === 'tags-limit'));
});

test('Converts GitHub alerts and simple HF collapsible blocks without losing DEV block', () => {
  const md = '# My Article\n\n> [!IMPORTANT]\n> Protect privileged identities.\n\n<details>\n<summary>More information</summary>\nDetails here.\n</details>';
  const result = output(md);
  assert.match(result.devto, /> \*\*Important\*\*/);
  assert.match(result.devto, /<details>/);
  assert.doesNotMatch(result.huggingface, /<details>/);
  assert.match(result.huggingface, /\*\*More information\*\*\n\nDetails here/);
});

test('Reference images, relative HTML images and anchors are rewritten', () => {
  const md = '# My Article\n\n![diagram][d]\n\n[d]: ../../assets/plot.png\n\n<img src="./images/b.png"> <a href="./more.md">More</a>';
  const { devto } = output(md);
  assert.match(devto, /\[d\]: https:\/\/raw\.githubusercontent\.com\/safesploitOrg\/docs\/main\/assets\/plot\.png/);
  assert.match(devto, /src="https:\/\/raw\.githubusercontent\.com\/safesploitOrg\/docs\/main\/articles\/networking\/images\/b\.png"/);
  assert.match(devto, /href="https:\/\/github\.com\/safesploitOrg\/docs\/blob\/main\/articles\/networking\/more\.md"/);
});

test('Private/confluence paths trigger review and custom asset base can override', () => {
  const result = output('![Diagram](./network.png)\n\n![Private](https://tenant.atlassian.net/download/attachments/32/a.png)', {
    publicAssetBase: 'https://public.example.org/assets/'
  });
  assert.match(result.devto, /https:\/\/public\.example\.org\/assets\/network\.png/);
  assert.ok(result.findings.some(f => f.code === 'confluence-link'));
});

test('Invalid tags, unsafe protocol, wiki links, and shortcodes are flagged', () => {
  const result = output('[[Page title]]\n\n![bad](data:image/png;base64,AAAA)\n\n{{< figure src="x.png" >}}', {
    tags: 'dev ops, security'
  });
  for (const key of ['tags', 'wiki-links', 'hugo', 'unsafe-url']) {
    assert.ok(result.findings.some(f => f.code === key), `${key} should be flagged`);
  }
});

test('Heading is only removed when it matches the selected title', () => {
  const result = output('# A different heading\n\nBody', { title: 'My Article' });
  assert.match(result.devto, /^# A different heading$/m);
});

test('YAML value is quoted safely, not executable front matter', () => {
  const result = output('Hello', { title: 'A: "quoted"\nmalicious: true' });
  assert.match(result.devto, /title: "A: \\"quoted\\"\\nmalicious: true"/);
  assert.doesNotMatch(result.devto, /^malicious: true$/m);
});
