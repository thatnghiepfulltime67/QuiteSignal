import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('T-WEB-07-01: browser source has no console, analytics, or durable browser store', () => {
  const source = ['main.ts', 'wallet.ts', 'signal.ts']
    .map((file) => readFileSync(resolve(root, 'src', file), 'utf8'))
    .join('\n');
  assert.doesNotMatch(source, /\bconsole\.|localStorage|sessionStorage|analytics\b/i);
});

test('T-WEB-07-02: stylesheet preserves keyboard focus and reduced-motion support', () => {
  const source = readFileSync(resolve(root, 'src/styles.css'), 'utf8');
  assert.match(source, /:focus-visible/);
  assert.match(source, /prefers-reduced-motion/);
});

test('T-WEB-07-TARGETS-01: primary navigation and utility actions meet the target-size contract', () => {
  const source = readFileSync(resolve(root, 'src/styles.css'), 'utf8');

  for (const selector of [
    '.site-nav a',
    '.wordmark',
    '.skip-link',
    '.text-action',
    '.text-button',
    '.faq-list summary',
    '.deployment-link',
  ]) {
    const escaped = selector.replace(/[. ]/g, (character) => (character === '.' ? '\\.' : '\\s+'));
    assert.match(source, new RegExp(`${escaped}\\s*\\{[\\s\\S]*?min-height: 44px;`));
  }
});
