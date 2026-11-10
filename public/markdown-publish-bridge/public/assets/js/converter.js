/* Markdown Publish Bridge: dependency-free conversion core.
 * All transformations happen in the browser. No content is transmitted by this code.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ArticleConverter = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const MAX_MARKDOWN_CHARS = 4_000_000;
  const DEV_TAG_RE = /^[a-z0-9]+$/;
  const CODE_FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
  const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|avif|svg|bmp)(?:[?#]|$)/i;
  const DOCUMENT_EXT = /\.(?:md|markdown|mdx)(?:[?#]|$)/i;

  function normaliseLineEndings(value) {
    return String(value || '').replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  }

  function yamlText(value) {
    return JSON.stringify(String(value == null ? '' : value));
  }

  function splitFrontMatter(markdown) {
    const text = normaliseLineEndings(markdown);
    if (!text.startsWith('---\n')) return { body: text, metadata: {}, detected: false };
    const match = text.match(/^---\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/);
    if (!match || !/^\s*[a-zA-Z_][\w-]*\s*:/m.test(match[1])) {
      return { body: text, metadata: {}, detected: false };
    }
    const metadata = {};
    const lines = match[1].split('\n');
    for (let i = 0; i < lines.length; i++) {
      const item = lines[i].match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
      if (!item) continue;
      let value = item[2].trim();
      if (/^[>|][-+]?\s*$/.test(value)) {
        const joined = [];
        while (i + 1 < lines.length && (lines[i + 1].startsWith('  ') || lines[i + 1] === '')) {
          joined.push(lines[++i].trim());
        }
        value = joined.join(' ').trim();
      } else if (/^\[.*\]$/.test(value)) {
        value = value.slice(1, -1).split(',').map(item => stripQuotes(item.trim()));
      } else {
        value = stripQuotes(value);
      }
      metadata[item[1].toLowerCase()] = value;
    }
    return { body: text.slice(match[0].length), metadata, detected: true };
  }

  function stripQuotes(value) {
    if (typeof value !== 'string') return value;
    if (value.length < 2) return value;
    const first = value[0];
    if (!((first === '"' || first === "'") && value.at(-1) === first)) return value;
    if (first === '"') {
      try { return JSON.parse(value); } catch (_) { return value.slice(1, -1).replace(/\\"/g, '"'); }
    }
    return value.slice(1, -1).replace(/''/g, "'");
  }

  function sourceTitle(body) {
    const segments = splitMarkdownBlocks(body);
    const head = segments.filter(s => !s.protected).map(s => s.text).join('\n');
    const match = head.match(/^\s*# (.+?)(?:\s+#+)?\s*$/m);
    return match ? match[1].trim() : '';
  }

  function defaultMetadata(markdown, fileName) {
    const data = splitFrontMatter(markdown);
    const meta = data.metadata;
    const tags = Array.isArray(meta.tags) ? meta.tags.join(', ') : String(meta.tags || '');
    const baseName = String(fileName || '').replace(/\.(md|markdown|mdx)$/i, '').replace(/[-_]/g, ' ').trim();
    return {
      title: String(meta.title || sourceTitle(data.body) || baseName || ''),
      description: String(meta.description || meta.summary || ''),
      tags,
      series: String(meta.series || ''),
      canonicalUrl: String(meta.canonical_url || ''),
      coverImage: String(meta.cover_image || meta.image || '')
    };
  }

  function validateGithubUrl(value) {
    const input = String(value || '').trim();
    if (!input) throw new Error('Enter a GitHub Markdown file URL first.');
    let parsed;
    try { parsed = new URL(input); } catch (_) { throw new Error('That is not a valid URL.'); }
    if (parsed.protocol !== 'https:') throw new Error('Use an HTTPS GitHub URL.');
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.port) {
      throw new Error('GitHub source URLs must not include credentials, queries, fragments or custom ports.');
    }
    const host = parsed.hostname.toLowerCase();
    let pieces = parsed.pathname.split('/').filter(Boolean);
    try { pieces = pieces.map(decodeURIComponent); }
    catch (_) { throw new Error('The URL has malformed encoding.'); }
    let owner, repo, ref, file;
    if (host === 'github.com' && pieces.length >= 5 && ['blob', 'raw'].includes(pieces[2])) {
      [owner, repo] = pieces;
      ref = pieces[3];
      file = pieces.slice(4).join('/');
    } else if (host === 'raw.githubusercontent.com' && pieces.length >= 4) {
      [owner, repo, ref] = pieces;
      file = pieces.slice(3).join('/');
    } else {
      throw new Error('Supported sources: github.com/.../blob/<ref>/file.md or raw.githubusercontent.com/...');
    }
    if (!owner || !repo || !ref || !file || !/\.(md|markdown|mdx)$/i.test(file)) {
      throw new Error('The GitHub URL must point to a Markdown file (.md, .markdown or .mdx).');
    }
    const simpleSegment = /^[A-Za-z0-9_.-]+$/;
    if (![owner, repo, ref].every(segment => simpleSegment.test(segment)) ||
      file.split('/').some(segment => !segment || segment === '.' || segment === '..' ||
        /[\\/\u0000-\u001f\u007f]/.test(segment))) {
      throw new Error('The source contains unsupported or unsafe GitHub path segments.');
    }
    const encodeSegments = str => str.split('/').map(encodeURIComponent).join('/');
    const encodedOwner = encodeURIComponent(owner);
    const encodedRepo = encodeURIComponent(repo);
    const encodedRef = encodeURIComponent(ref);
    const encodedFile = encodeSegments(file);
    const rootRaw = `https://raw.githubusercontent.com/${encodedOwner}/${encodedRepo}/${encodedRef}/`;
    const rootBlob = `https://github.com/${encodedOwner}/${encodedRepo}/blob/${encodedRef}/`;
    return {
      owner, repo, ref, file,
      rawUrl: rootRaw + encodedFile,
      blobUrl: rootBlob + encodedFile,
      rootRaw,
      rootBlob,
      fileName: file.split('/').at(-1)
    };
  }

  function splitMarkdownBlocks(markdown) {
    const lines = normaliseLineEndings(markdown).split(/(?<=\n)/);
    const chunks = [];
    let buffer = '', protect = false, fenceChar = '', fenceSize = 0;
    function push() {
      if (buffer) chunks.push({ text: buffer, protected: protect });
      buffer = '';
    }
    for (const line of lines) {
      const token = line.replace(/\n$/, '');
      const match = token.match(CODE_FENCE);
      if (!protect && match) {
        push(); protect = true; fenceChar = match[1][0]; fenceSize = match[1].length;
        buffer += line;
        continue;
      }
      if (protect && match && match[1][0] === fenceChar && match[1].length >= fenceSize && !match[2].trim()) {
        buffer += line; push(); protect = false; fenceChar = ''; fenceSize = 0;
        continue;
      }
      if (!protect && /^(?: {4}|\t)\S/.test(token)) {
        push(); chunks.push({ text: line, protected: true });
        continue;
      }
      buffer += line;
    }
    push();
    return chunks;
  }

  function protectInlineCode(text, transform) {
    const tokens = [];
    const protectedText = text.replace(/(`+)([\s\S]*?)\1/g, full => {
      const key = `\uE000INLINE${tokens.length}\uE001`;
      tokens.push(full);
      return key;
    });
    return transform(protectedText).replace(/\uE000INLINE(\d+)\uE001/g, (_, n) => tokens[Number(n)]);
  }

  function parseMarkdownDestination(raw) {
    const original = raw.trim();
    if (!original) return null;
    if (original[0] === '<') {
      const end = original.indexOf('>');
      if (end < 1) return null;
      return { url: original.slice(1, end), trailing: original.slice(end + 1), angled: true };
    }
    const titled = original.match(/^(.*?)(\s+(?:"[^"]*"|'[^']*'|\([^()]*\)))$/);
    return {
      url: titled ? titled[1] : original,
      trailing: titled ? titled[2] : '',
      angled: false
    };
  }

  function matchingSquare(text, pos) {
    let depth = 1;
    for (let i = pos + 1; i < text.length; i++) {
      if (text[i] === '\\') { i++; continue; }
      if (text[i] === '[') depth++;
      if (text[i] === ']' && --depth === 0) return i;
    }
    return -1;
  }

  function matchingParen(text, pos) {
    let depth = 1;
    let inAngle = false;
    for (let i = pos + 1; i < text.length; i++) {
      if (text[i] === '\\') { i++; continue; }
      if (text[i] === '<') inAngle = true;
      else if (text[i] === '>') inAngle = false;
      if (!inAngle) {
        if (text[i] === '(') depth++;
        if (text[i] === ')' && --depth === 0) return i;
      }
    }
    return -1;
  }

  function rewriteInlineDestinations(text, rewrite) {
    let out = '';
    for (let i = 0; i < text.length;) {
      const image = text[i] === '!' && text[i + 1] === '[';
      const open = image ? i + 1 : i;
      if ((image || text[i] === '[') && (i === 0 || text[i - 1] !== '\\')) {
        const close = matchingSquare(text, open);
        if (close > open && text[close + 1] === '(') {
          const end = matchingParen(text, close + 1);
          if (end > close) {
            const inside = text.slice(close + 2, end);
            const parsed = parseMarkdownDestination(inside);
            if (parsed && parsed.url) {
              const replacement = rewrite(parsed.url, image);
              if (replacement) {
                const dest = parsed.angled ? `<${replacement}>${parsed.trailing}` : `${replacement}${parsed.trailing}`;
                out += text.slice(i, close + 2) + dest + ')';
                i = end + 1;
                continue;
              }
            }
          }
        }
      }
      out += text[i++];
    }
    return out;
  }

  function rewriteReferenceDefinitions(text, rewrite, warn) {
    const imageRefs = new Set();
    const linkRefs = new Set();
    for (const m of text.matchAll(/(!?)\[[^\]\n]+\]\[([^\]\n]+)\]/g)) {
      (m[1] ? imageRefs : linkRefs).add(m[2].toLowerCase().trim());
    }
    return text.replace(/^( {0,3}\[[^\]\n]+\]:\s*)(<[^>]+>|\S+)([^\n]*)$/gm, (whole, prefix, rawUrl, tail) => {
      const label = prefix.match(/\[([^\]]+)\]/)[1].toLowerCase().trim();
      const image = imageRefs.has(label);
      if (image && linkRefs.has(label)) warn('mixed-reference', `Reference [${label}] is used as both an image and a link. Review its destination manually.`);
      const angled = rawUrl.startsWith('<') && rawUrl.endsWith('>');
      const dest = angled ? rawUrl.slice(1, -1) : rawUrl;
      const next = rewrite(dest, image);
      if (!next) return whole;
      return prefix + (angled ? `<${next}>` : next) + tail;
    });
  }

  function rewriteHtmlDestinations(text, rewrite) {
    return text.replace(/<(img|a)\b[^>]*>/gi, tag => {
      const image = /^<img\b/i.test(tag);
      return tag.replace(/\b(src|href)\s*=\s*(["'])([^"']+)\2/gi, (whole, attr, quote, url) => {
        if ((image && attr.toLowerCase() !== 'src') || (!image && attr.toLowerCase() !== 'href')) return whole;
        const next = rewrite(url, image);
        return next ? `${attr}=${quote}${next}${quote}` : whole;
      });
    });
  }

  function stripMatchingHeading(text, title) {
    const lines = text.split('\n');
    let pos = 0;
    while (pos < lines.length && pos < 6 && !lines[pos].trim()) pos++;
    if (pos >= lines.length) return text;
    const m = lines[pos].match(/^# (.+?)(?:\s+#+)?\s*$/);
    if (m && (!title || m[1].trim().toLowerCase() === String(title).trim().toLowerCase())) {
      lines.splice(pos, 1);
      return lines.join('\n').replace(/^\n+/, '');
    }
    return text;
  }

  function normaliseUrl(value) {
    const input = String(value || '').trim();
    if (!input) return '';
    try {
      const parsed = new URL(input);
      return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : '';
    } catch (_) { return ''; }
  }

  function convertArticle(inputMarkdown, settings) {
    const s = Object.assign({
      title: '', description: '', tags: '', series: '', canonicalUrl: '', coverImage: '',
      sourceUrl: '', publicAssetBase: '', removeDevHeading: true,
      removeHfHeading: true, convertAlerts: true, expandHfDetails: true
    }, settings || {});
    const findings = [];
    const findingKeys = new Set();
    const stats = { links: 0, images: 0, rewritten: 0, fences: 0, words: 0 };
    function warn(code, message, level = 'warning') {
      const key = code + ':' + message;
      if (findingKeys.has(key)) return;
      findingKeys.add(key);
      if (findings.length < 60) findings.push({ code, message, level });
    }

    const provided = String(inputMarkdown == null ? '' : inputMarkdown);
    if (provided.length > MAX_MARKDOWN_CHARS) {
      throw new RangeError('Markdown input exceeds the 4 million character safety limit.');
    }
    const original = normaliseLineEndings(provided);
    const front = splitFrontMatter(original);
    let body = front.body.trim();
    let context = null;
    if (s.sourceUrl.trim()) {
      try { context = validateGithubUrl(s.sourceUrl); }
      catch (error) { warn('invalid-source', `GitHub source URL: ${error.message}`); }
    }
    if (!body) warn('empty', 'Paste or load a Markdown document first.', 'info');
    if (front.detected) warn('metadata', 'Source YAML front matter was removed. Target metadata is generated separately.', 'info');
    if (context) warn('public-assets', 'Images and linked files must be publicly accessible to readers. Private GitHub repositories and authenticated Confluence attachments will not work.', 'info');
    let customAssets = '';
    if (String(s.publicAssetBase).trim()) {
      customAssets = normaliseUrl(s.publicAssetBase);
      if (!customAssets) warn('asset-base', 'The public asset base must be an absolute HTTPS URL.');
      else if (!customAssets.endsWith('/')) {
        customAssets += '/';
        warn('asset-trailing', 'A trailing slash was added to the image base, treating it as a directory.', 'info');
      }
    }

    function rewrite(url, isImage) {
      const dest = String(url).trim();
      if (!dest) return null;
      if (isImage) stats.images++;
      else stats.links++;
      if (/^(?:https?:)?\/\//i.test(dest)) {
        if (/atlassian\.net|\/download\/attachments\//i.test(dest)) warn('confluence-link', 'A Confluence-hosted URL may require login. Check that readers can access it.');
        if (isImage && /\.svg(?:[?#]|$)/i.test(dest)) warn('svg', 'SVG images may not render consistently on publishing platforms; prefer PNG or WebP.');
        return null;
      }
      if (/^(?:#|mailto:|tel:)/i.test(dest)) return null;
      if (/^(?:javascript:|data:|file:)/i.test(dest)) {
        warn('unsafe-url', `Potentially unsafe or non-portable URL detected: ${dest.slice(0, 70)}`);
        return null;
      }
      if (dest.startsWith('attachment://')) {
        warn('attachment-uri', 'Found an attachment:// link. Upload or host the attachment and replace the placeholder URL.');
        return null;
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(dest)) {
        warn('special-protocol', `Custom link protocol requires review: ${dest.slice(0, 70)}`);
        return null;
      }

      if (isImage && /\.svg(?:[?#]|$)/i.test(dest)) warn('svg', 'SVG images may not render consistently on publishing platforms; prefer PNG or WebP.');
      let base;
      let rootAbsolute = false;
      if (isImage && customAssets) base = customAssets;
      else if (context) {
        rootAbsolute = dest.startsWith('/');
        base = rootAbsolute ? context.rootRaw : context.rawUrl;
      }
      if (!base) {
        warn('unresolved', 'Relative links/images found without a valid GitHub source URL or public image base. They will need manual fixes.');
        return null;
      }
      try {
        const targetPath = rootAbsolute ? dest.slice(1) : dest;
        const absolute = new URL(targetPath, base);
        if (context && !customAssets && !absolute.href.startsWith(context.rootRaw)) {
          warn('outside-repo', `Relative path escapes the GitHub repository: ${dest.slice(0, 90)}`);
          return null;
        }
        let result = absolute.href;
        if (!isImage && context && absolute.href.startsWith(context.rootRaw)) {
          result = context.rootBlob + absolute.href.slice(context.rootRaw.length);
        }
        if (isImage && customAssets && dest.startsWith('/')) result = new URL(dest.slice(1), customAssets).href;
        stats.rewritten++;
        return result;
      } catch (_) {
        warn('bad-relative', `Could not resolve a relative path: ${dest.slice(0, 90)}`);
        return null;
      }
    }

    const segments = splitMarkdownBlocks(body);
    stats.fences = segments.filter(chunk => chunk.protected && /^[ \t]*(`{3,}|~{3,})/.test(chunk.text)).length;
    const convertChunk = text => protectInlineCode(text, unprotected => {
      let value = unprotected;
      if (s.convertAlerts) {
        value = value.replace(/^([ \t]*>\s*)\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/gmi,
          (_, prefix, kind) => prefix + `**${kind[0].toUpperCase() + kind.slice(1).toLowerCase()}**`);
      }
      value = rewriteInlineDestinations(value, rewrite);
      value = rewriteReferenceDefinitions(value, rewrite, warn);
      value = rewriteHtmlDestinations(value, rewrite);
      return value;
    });
    body = segments.map(chunk => chunk.protected ? chunk.text : convertChunk(chunk.text)).join('').trim();
    if (/!\[\[|(?<!!)\[\[[^\]]+\]\]/.test(body)) warn('wiki-links', 'Obsidian-style [[wiki links]] cannot reliably map to GitHub files without the exporter path mapping. Convert these manually.');
    if (/\{\{[<%]|\{%\s*(?:figure|ref|relref)/.test(body)) warn('hugo', 'Hugo shortcodes detected. Convert to standard Markdown before publishing.');
    if (/<(?:script|iframe|style)\b/i.test(body)) warn('html-embed', 'Embedded HTML/script content is potentially unsafe or unsupported. Remove it before publishing.');
    if (/\b(?:srcset)\s*=/.test(body)) warn('srcset', 'HTML srcset attributes are not rewritten; check each image URL.');
    if (/\[[^\]]+\]\(attachment:\/\//.test(body)) warn('attachment-url', 'One or more attachment:// URLs require manual hosting.');

    const title = String(s.title || front.metadata.title || sourceTitle(front.body) || 'Untitled article').trim();
    const originalHeading = sourceTitle(front.body);
    if (originalHeading && title.toLowerCase() !== originalHeading.toLowerCase()) {
      warn('heading-mismatch', 'The first H1 differs from the publication title. Review whether the article will show a duplicate heading.', 'info');
    }
    const description = String(s.description || front.metadata.description || '').trim();
    const series = String(s.series || '').trim();
    const rawTags = Array.isArray(s.tags) ? s.tags : String(s.tags || '').split(',');
    const tags = [...new Set(rawTags.map(t => String(t).toLowerCase().trim()).filter(Boolean))];
    const validTags = tags.filter(tag => DEV_TAG_RE.test(tag));
    if (validTags.length !== tags.length) warn('tags', 'DEV tags must be simple lowercase alphanumeric strings. Invalid tags were omitted.');
    if (validTags.length > 4) warn('tags-limit', 'DEV allows a maximum of four tags. Only the first four were included.');
    if (description.length > 160) warn('description', 'Description exceeds 160 characters. Consider shortening it for previews.', 'info');
    if (title.length > 120) warn('title-length', 'This title is very long. Consider making it more concise.', 'info');

    const canonical = normaliseUrl(s.canonicalUrl);
    if (s.canonicalUrl.trim() && !canonical) warn('canonical', 'Canonical URL must be an absolute HTTP(S) URL; it was omitted.');
    if (canonical && /(?:github\.com|raw\.githubusercontent\.com)\//i.test(canonical)) {
      warn('canonical-github', 'A GitHub source file is not necessarily the original published article. Use a canonical URL only when it truly represents the primary public article.');
    }
    const cover = s.coverImage.trim();
    let coverAbsolute = normaliseUrl(cover);
    if (cover && !coverAbsolute) {
      coverAbsolute = rewrite(cover, true) || '';
      if (!coverAbsolute) warn('cover', 'Cover image must have a public absolute URL or a resolvable relative path.');
    }
    if (coverAbsolute && !/^https?:\/\//i.test(coverAbsolute)) coverAbsolute = '';
    if (s.removeDevHeading) {
      var devBody = stripMatchingHeading(body, title);
    } else { var devBody = body; }
    let hfBody = s.removeHfHeading ? stripMatchingHeading(body, title) : body;
    if (s.expandHfDetails) {
      hfBody = hfBody.replace(/<details\b[^>]*>\s*<summary>([\s\S]*?)<\/summary>\s*([\s\S]*?)<\/details>/gi,
        (_, summary, content) => `**${summary.replace(/<[^>]*>/g, '').trim()}**\n\n${content.trim()}\n`);
    }
    if (/<details\b/i.test(hfBody)) warn('details', 'Some <details> blocks remain (possibly nested). Verify their rendering in Hugging Face.');
    if (/<(?:details|div|table|video|iframe)\b/i.test(hfBody)) warn('html-hf', 'Hugging Face may handle raw HTML differently. Inspect the preview before publishing.', 'info');

    const metaLines = [
      '---',
      `title: ${yamlText(title)}`,
      'published: false',
      ...(description ? [`description: ${yamlText(description)}`] : []),
      `tags: ${validTags.slice(0, 4).join(', ')}`,
      ...(series ? [`series: ${yamlText(series)}`] : []),
      ...(canonical ? [`canonical_url: ${yamlText(canonical)}`] : []),
      ...(coverAbsolute ? [`cover_image: ${yamlText(coverAbsolute)}`] : []),
      '---'
    ];
    const devto = metaLines.join('\n') + '\n\n' + devBody.trim() + '\n';
    const huggingface = hfBody.trim() + '\n';
    stats.words = (body.match(/\b[\w'-]+\b/g) || []).length;
    return {
      devto, huggingface,
      title, description, coverImage: coverAbsolute,
      source: context, stats, findings,
      sourceHadFrontMatter: front.detected
    };
  }

  return { MAX_MARKDOWN_CHARS, validateGithubUrl, splitFrontMatter, defaultMetadata, convertArticle,
    splitMarkdownBlocks, stripMatchingHeading, normaliseUrl };
});
