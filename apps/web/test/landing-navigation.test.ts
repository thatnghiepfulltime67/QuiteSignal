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
  assert.match(source, /navigationLink\('\/', 'Overview'/);
  for (const task of ['Markets', 'Portfolio', 'Create']) {
    assert.match(source, new RegExp(`navigationLink\\([^\\n]+, '${task}'`));
  }
  assert.match(source, /aria-label="Primary tasks"/);
  assert.match(source, /function marketDirectoryContent/);
  assert.match(source, /id="refresh-selected-market"/);
  assert.match(source, /aria-label="Refresh selected market"/);
  assert.match(source, /function marketSurfaceContent/);
  assert.match(source, /function portfolioContent/);
  assert.match(source, /portfolio-balances/);
  assert.match(source, /reveal-collateral-qscc/);
  assert.match(source, /market-workspace/);
  assert.match(source, /data-select-self-test-pool/);
  assert.match(source, /Verify this market/);
  assert.match(source, /Make forecast/);
  assert.match(source, /class="market-disclosure"/);
  assert.match(source, /without leaving this page/);
  assert.doesNotMatch(source, /workspaceSubnavigation|Workspace functions/);
  assert.doesNotMatch(source, /SELF-TEST POOL|Back to canonical/);
  assert.match(
    source,
    /location\.pathname === '\/how-it-works'\) history\.replaceState\(\{\}, '', '\/'\)/,
  );
  assert.match(source, /function lifecycleContent\(/);
  assert.match(styles, /\.skip-link/);
  assert.match(styles, /\.site-nav a\[aria-current='page'\]/);
  assert.match(styles, /\.site-nav \{[\s\S]*?flex-wrap: wrap;/);
  assert.match(styles, /\.site-nav \{[\s\S]*?position: sticky;[\s\S]*?top: 0;/);
  assert.match(
    styles,
    /\.site-nav::before \{[\s\S]*?width: 100vw;[\s\S]*?background: var\(--cocoa\);/,
  );
  assert.match(styles, /\.market-disclosures \{[\s\S]*?border-top: 1px solid var\(--walnut\);/);
  assert.match(styles, /\.market-directory \{[\s\S]*?overflow: visible;/);
  assert.match(styles, /\.market-refresh-icon \{/);
  assert.match(styles, /\.market-list \{[\s\S]*?position: sticky;/);
  assert.match(styles, /\.pool-directory \{[\s\S]*?grid-template-columns:/);
  assert.match(styles, /\.app-shell \{[\s\S]*?overflow: clip;/);
  assert.match(styles, /\.wallet,[\s\S]*?\.text-button \{[\s\S]*?background: var\(--orchid\);/);
});
