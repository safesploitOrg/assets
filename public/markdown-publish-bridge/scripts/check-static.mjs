/** Offline, dependency-free checks for the static publish root. Not a substitute for W3C/axe validation. */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const HTML = readFileSync(join(PUBLIC, 'index.html'), 'utf8');
const STYLES = readFileSync(join(PUBLIC, 'assets/css/styles.css'), 'utf8');
const ERRORS = [];

function requireMatch(pattern, message) {
  if (!pattern.test(HTML)) ERRORS.push(message);
}

function validateStructure() {
  requireMatch(/<html\s+lang="en-GB"/, 'Missing document language');
  requireMatch(/<main\b/, 'Missing main landmark');
  requireMatch(/<meta\s+http-equiv="Content-Security-Policy"/, 'Missing CSP');
  requireMatch(/<textarea[^>]+id="sourceMarkdown"[^>]+maxlength="4000000"/, 'Source input size limit missing');
  requireMatch(/<div\s+id="toast"[^>]+role="status"[^>]+aria-live="polite"/, 'Accessible status area missing');
  if (/\bon\w+\s*=/.test(HTML)) ERRORS.push('Inline event handler prohibited by CSP');
  if (/<script\b(?![^>]*\bsrc=)/i.test(HTML)) ERRORS.push('Inline scripts prohibited by CSP');
  if (/unsafe-inline|unsafe-eval/i.test(HTML)) ERRORS.push('Unsafe CSP exception');
  const ids = [...HTML.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) ERRORS.push('Duplicate HTML id detected');
  for (const match of HTML.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)) {
    if (!uniqueIds.has(match[1])) ERRORS.push('HTML label references missing input: ' + match[1]);
  }
  for (const match of HTML.matchAll(/<button\b[^>]*\baria-controls="([^"]+)"/g)) {
    if (!uniqueIds.has(match[1])) ERRORS.push('ARIA tab controls missing element: ' + match[1]);
  }
  const csp = HTML.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  if (!csp || !csp[1].includes("connect-src https://raw.githubusercontent.com")) ERRORS.push('GitHub-only fetch CSP missing');

  for (const attr of HTML.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"[^>]*>/g)) {
    const target = attr[1];
    if (target.startsWith('http')) ERRORS.push('Third-party script or stylesheet not permitted: ' + target);
    else if (!existsSync(join(PUBLIC, target))) ERRORS.push('Missing public asset: ' + target);
  }
  if (/@import\b/i.test(STYLES)) ERRORS.push('CSS @import is not permitted');
  if (/url\s*\(\s*['"]?https?:/i.test(STYLES)) ERRORS.push('Remote styles/assets not permitted');
}

function checkCssBraces(source) {
  let depth = 0, quote = '', blockComment = false;
  for (let i = 0; i < source.length; i++) {
    const a = source[i], b = source[i + 1];
    if (blockComment) { if (a === '*' && b === '/') { blockComment = false; i++; } continue; }
    if (quote) { if (a === '\\') { i++; continue; } if (a === quote) quote = ''; continue; }
    if (a === '/' && b === '*') { blockComment = true; i++; continue; }
    if (a === '"' || a === "'") { quote = a; continue; }
    if (a === '{') depth++;
    if (a === '}' && --depth < 0) { ERRORS.push('CSS has an unexpected closing brace'); return; }
  }
  if (depth !== 0 || quote || blockComment) ERRORS.push('CSS has unbalanced blocks or unterminated strings/comments');
}

function main() {
  validateStructure();
  checkCssBraces(STYLES);
  for (const name of ['converter.js', 'github-source.js', 'app.js']) {
    const path = join(PUBLIC, 'assets/js', name);
    const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    if (result.status !== 0) ERRORS.push(`JavaScript syntax: ${name}: ${result.stderr.trim()}`);
  }
  if (ERRORS.length) {
    for (const message of ERRORS) console.error('FAIL: ' + message);
    process.exitCode = 1;
  } else console.log('PASS: static HTML references, limited CSS validation, JavaScript syntax and CSP checks');
}
main();
