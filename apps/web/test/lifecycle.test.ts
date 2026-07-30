import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { presentLifecycle } from '../src/lifecycle.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('T-WEB-04-01: every public epoch state has explicit recovery copy', () => {
  for (let state = 0; state <= 5; state += 1) assert.notEqual(presentLifecycle(state).recovery, '');
});
test('T-WEB-04-02: unknown public state never implies success', () => {
  assert.equal(presentLifecycle(99).tone, 'warning');
});

test('T-WEB-04-DEADLINE-01: elapsed OPEN deadline fails closed before a close transaction', () => {
  const active = presentLifecycle(0, { deadline: 100n, observedAt: 99n });
  const elapsed = presentLifecycle(0, { deadline: 100n, observedAt: 100n });

  assert.equal(active.label, 'Open');
  assert.equal(elapsed.label, 'Commit deadline reached');
  assert.match(elapsed.explanation, /deadline has passed/i);
  assert.match(elapsed.recovery, /Do not submit a new signal/i);
});

test('T-WEB-04-03: public lifecycle reads use the documented wallet-free Sepolia transport', () => {
  const wallet = readFileSync(resolve(root, 'src', 'wallet.ts'), 'utf8');
  const main = readFileSync(resolve(root, 'src', 'main.ts'), 'utf8');

  assert.match(
    wallet,
    /SEPOLIA_PUBLIC_READ_RPC = 'https:\/\/ethereum-sepolia-rpc\.publicnode\.com'/,
  );
  assert.match(wallet, /transport: http\(SEPOLIA_PUBLIC_READ_RPC/);
  assert.match(wallet, /client\.getBlock\(\)/);
  assert.match(wallet, /deadline: epoch\.deadline/);
  assert.match(wallet, /observedAt: block\.timestamp/);
  assert.match(main, /void refreshLifecycle\(\);/);
  assert.match(main, /Direct public read is degraded/);
});
