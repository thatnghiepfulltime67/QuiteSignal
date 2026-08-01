import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  calculateOwnerPayout,
  parseTestAssetAmount,
  presentAssetReadiness,
  presentMarketReadiness,
} from '../src/participant.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('T-WEB-09-01: market readiness fails closed for elapsed and terminal epochs', () => {
  assert.equal(
    presentMarketReadiness({ state: 0, deadline: 100n, observedAt: 99n }).actionable,
    true,
  );
  assert.equal(
    presentMarketReadiness({ state: 0, deadline: 100n, observedAt: 100n }).actionable,
    false,
  );
  assert.equal(
    presentMarketReadiness({ state: 4, deadline: 100n, observedAt: 99n }).actionable,
    false,
  );
});

test('T-WEB-09-02: asset readiness distinguishes gas, public test asset, and confidential collateral', () => {
  assert.match(
    presentAssetReadiness({
      nativeBalance: 0n,
      publicBalance: 100n,
      allowance: 100n,
      confidentialBalance: 100n,
    }).label,
    /gas/i,
  );
  assert.match(
    presentAssetReadiness({
      nativeBalance: 100_000_000_000_000n,
      publicBalance: 100n,
      allowance: 0n,
      confidentialBalance: 0n,
    }).label,
    /approve/i,
  );
  assert.equal(
    presentAssetReadiness({
      nativeBalance: 100_000_000_000_000n,
      publicBalance: 0n,
      allowance: 0n,
      confidentialBalance: 1n,
    }).readyToSignal,
    true,
  );
});

test('T-WEB-09-03: test-asset amounts are strict positive base-unit decimals', () => {
  assert.equal(parseTestAssetAmount('1.25'), 1250000000000000000n);
  assert.throws(() => parseTestAssetAmount('0'));
  assert.throws(() => parseTestAssetAmount('1e2'));
});

test('T-WEB-09-04: asset setup binds the faucet to the immutable wrapper and uses exact approvals', () => {
  const wallet = readFileSync(resolve(root, 'src', 'wallet.ts'), 'utf8');
  const main = readFileSync(resolve(root, 'src', 'main.ts'), 'utf8');

  assert.match(wallet, /async function verifyTestAssetBinding/);
  assert.match(wallet, /functionName: 'underlying'/);
  assert.match(wallet, /functionName: 'mint'/);
  assert.match(wallet, /functionName: 'approve'/);
  assert.match(wallet, /functionName: 'wrap'/);
  assert.match(wallet, /if \(allowance < amount\)/);
  assert.match(wallet, /waitForConfirmedReceipt\(reader, transactionHash\)/);
  assert.match(
    main,
    /Mint valueless QSFC, approve only the chosen amount, then wrap it into confidential QSCC/,
  );
  assert.match(main, /Mint QSFC/);
  assert.match(main, /data-asset-action="mint"/);
  assert.match(main, /data-asset-action="wrap"/);
  assert.doesNotMatch(main, /data-asset-action="approve"/);
  assert.match(main, /approvalHash = await approveTestAsset/);
});

test('T-WEB-09-05: signal submission is blocked before encryption when the market or collateral is not ready', () => {
  const wallet = readFileSync(resolve(root, 'src', 'wallet.ts'), 'utf8');
  const main = readFileSync(resolve(root, 'src', 'main.ts'), 'utf8');

  assert.match(wallet, /epoch\.state !== 0 \|\| block\.timestamp >= epoch\.deadline/);
  assert.match(wallet, /Confidential collateral is insufficient/);
  assert.match(main, /if \(!marketActionable\)/);
  assert.match(main, /Await a fresh market release/);
  assert.match(main, /Prepare test collateral/);
});

test('T-WEB-15-PAYOUT-01: owner payout mirrors allocation rounding and pool floor division', () => {
  const settledYes = calculateOwnerPayout({
    state: 4,
    winner: 1,
    stake: 1_000_000_000_000_000_000n,
    probabilityBps: 6_000n,
    publicYes: 1_300_000_000_000_000_000n,
    publicNo: 700_000_000_000_000_000n,
  });
  assert.deepEqual(settledYes, {
    yesAllocation: 600_000_000_000_000_000n,
    noAllocation: 400_000_000_000_000_000n,
    winningAllocation: 600_000_000_000_000_000n,
    winningAggregate: 1_300_000_000_000_000_000n,
    totalCollateral: 2_000_000_000_000_000_000n,
    payout: 923_076_923_076_923_076n,
  });

  assert.equal(
    calculateOwnerPayout({
      state: 3,
      winner: 0,
      stake: 1_000_000_000_000_000_000n,
      probabilityBps: 6_000n,
      publicYes: 1_300_000_000_000_000_000n,
      publicNo: 700_000_000_000_000_000n,
    }),
    undefined,
  );
});

test('T-WEB-15-PAYOUT-02: payout UI stays owner-gated and explains the exact contract formula', () => {
  const main = readFileSync(resolve(root, 'src', 'main.ts'), 'utf8');
  const styles = readFileSync(resolve(root, 'src', 'styles.css'), 'utf8');

  assert.match(main, /Estimated payout/);
  assert.match(main, /CONTRACT FORMULA/);
  assert.match(
    main,
    /floor\(your winning allocation × total collateral ÷ public winning allocation\)/,
  );
  assert.match(main, /function ownerPayoutContent/);
  assert.match(main, /ownerPayoutContent\(\)/);
  assert.match(styles, /\.owner-payout-summary/);
});
