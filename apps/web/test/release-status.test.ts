import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('T-WEB-01-UX-03: release loading and failure states block wallet actions', () => {
  const source = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
  const styles = readFileSync(resolve(root, 'src/styles.css'), 'utf8');

  assert.match(source, /let manifestPhase: 'loading' \| 'ready' \| 'unavailable'/);
  assert.match(source, /Checking the live deployment\./);
  assert.match(source, /Do not connect or submit yet\./);
  assert.match(source, /manifest \? walletState : 'Release check'/);
  assert.match(source, /manifestPhase = 'ready'/);
  assert.match(source, /manifestPhase = 'unavailable'/);
  assert.match(source, /render\('Checking the canonical Sepolia release/);
  assert.match(styles, /\.release-status/);
  assert.match(styles, /\.wallet:disabled/);
  assert.match(styles, /@keyframes status-rule/);
});
