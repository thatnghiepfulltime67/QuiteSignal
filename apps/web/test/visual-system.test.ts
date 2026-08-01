import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('T-WEB-03-UI-01: application source uses the closed poster palette and band system', () => {
  const styles = readFileSync(resolve(root, 'src/styles.css'), 'utf8');
  const source = readFileSync(resolve(root, 'src/main.ts'), 'utf8');

  for (const token of ['--cocoa', '--orchid', '--petal', '--plum', '--blush', '--lavender']) {
    assert.match(styles, new RegExp(token));
  }
  assert.match(source, /band cocoa-band hero/);
  assert.match(source, /band blush-band market/);
  assert.match(source, /band plum-band signal-card/);
  assert.match(source, /band petal-band verification/);
  assert.match(
    styles,
    /\.wallet,[\s\S]*?background: var\(--orchid\);[\s\S]*?color: var\(--cocoa\);/,
  );
  assert.doesNotMatch(styles, /box-shadow\s*:/i);
  assert.doesNotMatch(styles, /(?:linear|radial)-gradient/i);
  assert.doesNotMatch(styles, /url\s*\(/i);
});

test('T-WEB-03-UI-02: account and chain changes re-mask the owner-only screen', () => {
  const source = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
  const reset =
    /ownerMessage = 'Owner values are masked\. Reveal requires your connected owner wallet\.';/;

  assert.match(source, /accountsChanged[\s\S]*ownerMessage/);
  assert.match(source, /chainChanged[\s\S]*ownerMessage/);
  assert.match(source, reset);
});
