import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { presentLifecycle } from '../src/lifecycle.js';
import {
  presentEligibleLifecycleActions,
  presentLifecycleActionAvailability,
} from '../src/lifecycle-actions.js';

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

test('T-WEB-12-01: lifecycle controls expose only time- and state-eligible permissionless actions', () => {
  const base = {
    now: 100n,
    deadline: 100n,
    pendingAvailableAt: 100n,
    aggregateRequestId: `0x${'0'.repeat(64)}`,
    aggregatePendingAt: 50n,
    aggregateTimeout: 50n,
    resolutionPendingAt: 50n,
    resolutionGrace: 50n,
    observationNotBefore: 100n,
  };
  assert.deepEqual(
    presentEligibleLifecycleActions({ ...base, state: 0 }).map(({ action }) => action),
    ['close-epoch'],
  );
  assert.deepEqual(
    presentEligibleLifecycleActions({ ...base, state: 1 }).map(({ action }) => action),
    ['expire-pending-commit'],
  );
  assert.deepEqual(
    presentEligibleLifecycleActions({ ...base, state: 2 }).map(({ action }) => action),
    ['request-aggregate-decrypt'],
  );
  assert.deepEqual(
    presentEligibleLifecycleActions({
      ...base,
      state: 2,
      aggregateRequestId: `0x${'1'.repeat(64)}`,
    }).map(({ action }) => action),
    ['finalize-aggregate', 'cancel-before-resolution'],
  );
  assert.deepEqual(
    presentEligibleLifecycleActions({ ...base, state: 3 }).map(({ action }) => action),
    ['settle', 'cancel-after-resolution-grace'],
  );
  assert.deepEqual(presentEligibleLifecycleActions({ ...base, state: 5 }), []);

  const openActions = presentLifecycleActionAvailability({ ...base, state: 0, now: 99n });
  assert.equal(openActions.length, 7);
  assert.equal(openActions.find(({ action }) => action === 'close-epoch')?.eligible, false);
  assert.match(
    openActions.find(({ action }) => action === 'close-epoch')?.unavailableExplanation ?? '',
    /deadline/i,
  );
  const terminalActions = presentLifecycleActionAvailability({ ...base, state: 5 });
  assert.ok(terminalActions.every(({ eligible }) => !eligible));
  assert.ok(
    terminalActions.every(({ unavailableExplanation }) => /terminal/i.test(unavailableExplanation)),
  );
});

test('T-WEB-12-02: aggregate finalization uses transient public attestations and waits for receipt', () => {
  const wallet = readFileSync(resolve(root, 'src', 'wallet.ts'), 'utf8');
  const main = readFileSync(resolve(root, 'src', 'main.ts'), 'utf8');
  const styles = readFileSync(resolve(root, 'src', 'styles.css'), 'utf8');

  assert.match(wallet, /functionName: 'aggregateDisclosureHandles'/);
  assert.match(wallet, /nox\.publicDecrypt\(handles\[0\]/);
  assert.match(wallet, /functionName: 'finalizeAggregate'/);
  assert.match(wallet, /waitForConfirmedReceipt\(reader, transactionHash\)/);
  assert.match(main, /data-lifecycle-action/);
  assert.match(main, /lifecycle-action-tooltip/);
  assert.match(main, /Hover an unavailable action/);
  assert.match(wallet, /actionAvailability/);
  assert.match(styles, /\.lifecycle-action-tooltip::after/);
  assert.match(main, /submitPermissionlessLifecycleAction/);
  assert.doesNotMatch(`${wallet}\n${main}`, /localStorage|sessionStorage|console\./i);
});
