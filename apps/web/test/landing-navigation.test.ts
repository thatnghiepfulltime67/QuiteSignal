import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('T-WEB-02-LANDING-01: landing and navigation orient users before wallet use', () => {
  const source = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
  const styles = readFileSync(resolve(root, 'src/styles.css'), 'utf8');

  for (const phrase of [
    'A forecasting market that reveals only what the lifecycle needs.',
    'Clear privacy promises are part of the product.',
    'Built to be checked, not merely trusted.',
    'Questions a careful participant should ask.',
    'Inspect first. Connect only when you are ready.',
  ]) {
    assert.match(source, new RegExp(phrase.replace(/[.?]/g, '\\$&')));
  }
  assert.match(source, /href="#main-content"/);
  assert.match(source, /aria-current="page"/);
  assert.match(source, /navigationLink\('\/how-it-works', 'How it works'/);
  assert.match(source, /navigationLink\('\/position', 'Position'/);
  assert.match(styles, /\.skip-link/);
  assert.match(styles, /\.site-nav a\[aria-current='page'\]/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*\.action-guide/);
  assert.doesNotMatch(source, /VeilBid/i);
});
