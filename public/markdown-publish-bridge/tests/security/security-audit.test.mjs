import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSecrets, detectUnsafeSource } from '../../scripts/security-audit.mjs';

test('detects representative secrets in source text', () => {
  assert.ok(detectSecrets('-----BEGIN ' + 'PRIVATE KEY-----').length);
  assert.ok(detectSecrets('AKIA' + 'A'.repeat(16)).length);
  assert.ok(detectSecrets('ghp_' + 'A'.repeat(35)).length);
  assert.deepEqual(detectSecrets('Nothing sensitive here'), []);
});

test('detects dangerous DOM/code sinks in production JavaScript', () => {
  assert.ok(detectUnsafeSource('element.innerHTML = userText;').length);
  assert.ok(detectUnsafeSource('eval(userCode);').length);
  assert.ok(detectUnsafeSource('document.write(source);').length);
  assert.deepEqual(detectUnsafeSource('element.textContent = userText;'), []);
});
