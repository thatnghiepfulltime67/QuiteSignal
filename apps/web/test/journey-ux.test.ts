import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('T-WEB-03-UX-02: high-intent routes explain safe sequence and wallet boundaries', () => {
  const source = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
  const styles = readFileSync(resolve(root, 'src/styles.css'), 'utf8');

  for (const phrase of [
    'Check the active release',
    'Validate locally',
    'Encrypt in browser',
    'Confirm in wallet',
    'Nothing is revealed or moved by opening the page.',
    'The independent verifier command is the source of invariant conclusions.',
  ]) {
    assert.match(source, new RegExp(phrase.replace(/[.?]/g, '\\$&')));
  }
  for (const selector of [
    '.market-path',
    '.journey-steps',
    '.owner-guidance',
    '.route-callout',
    '.route-actions',
  ]) {
    assert.match(styles, new RegExp(selector.replace('.', '\\.')));
  }
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*\.journey-steps/);
});

test('T-WEB-03-UX-03: one wallet interaction locks competing controls and reports its outcome', () => {
  const source = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
  const styles = readFileSync(resolve(root, 'src/styles.css'), 'utf8');

  assert.match(source, /function beginWalletInteraction/);
  assert.match(source, /function reportWalletInteraction/);
  assert.match(source, /function endWalletInteraction/);
  assert.match(source, /interactionBusy \? ' aria-busy="true"'/);
  assert.match(source, /querySelectorAll<HTMLButtonElement>\('button'\)/);
  assert.match(source, /operation-toast/);
  assert.match(styles, /\.operation-toast \{/);
  assert.match(styles, /\.operation-toast \{[^}]*bottom: 20px/);
  assert.doesNotMatch(styles, /\.operation-toast \{[^}]*top:/);
  assert.match(styles, /\.app-shell\[aria-busy='true'\] a\[aria-disabled='true'\]/);
});
