/** Dependency-free security guardrails. Heuristic by design; not a substitute for independent SAST/secrets tools. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IGNORED = new Set(['.git', 'node_modules', 'test-results', 'playwright-report', '.DS_Store']);
const TEXT_EXT = new Set(['.md', '.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.css', '.html', '.txt']);
const SOURCE = ['converter.js', 'github-source.js', 'app.js'];

export function detectSecrets(input) {
  const rules = [
    ['GitHub token', /\bgh[pousr]_[A-Za-z0-9_]{25,}\b/g],
    ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
    ['Private key material', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
    ['Likely credential assignment', /(?:api[_-]?key|secret|access[_-]?token)\s*[:=]\s*['"][A-Za-z0-9\/_+\-=]{20,}['"]/gi]
  ];
  return rules.filter(([, expression]) => expression.test(input)).map(([label]) => label);
}

export function detectUnsafeSource(input) {
  const rules = [
    ['dynamic HTML injection sink', /\.(?:innerHTML|outerHTML)\s*=|\.insertAdjacentHTML\s*\(/],
    ['dynamic code evaluation', /\beval\s*\(|\bnew\s+Function\s*\(/],
    ['document.write', /\bdocument\.write\s*\(/],
    ['unscoped credentials-enabled fetch', /\bcredentials\s*:\s*['"]include['"]/],
    ['insecure HTTP fetch', /\bfetch\s*\(\s*['"]http:\/\//]
  ];
  return rules.filter(([, expression]) => expression.test(input)).map(([label]) => label);
}

function enumerate(directory) {
  const found = [];
  for (const name of readdirSync(directory)) {
    if (IGNORED.has(name)) continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) found.push(...enumerate(path));
    else if (TEXT_EXT.has(name.slice(name.lastIndexOf('.')))) found.push(path);
  }
  return found;
}

function main() {
  const issues = [];
  for (const file of enumerate(ROOT)) {
    const content = readFileSync(file, 'utf8');
    for (const issue of detectSecrets(content)) issues.push(`${relative(ROOT, file)}: ${issue}`);
  }
  for (const name of SOURCE) {
    const path = join(ROOT, 'public/assets/js', name);
    for (const issue of detectUnsafeSource(readFileSync(path, 'utf8'))) {
      issues.push(`${relative(ROOT, path)}: ${issue}`);
    }
  }
  if (issues.length) {
    issues.forEach(issue => console.error('FAIL: ' + issue));
    process.exitCode = 1;
  } else console.log('PASS: scoped heuristic secrets and dangerous JavaScript sink checks');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
