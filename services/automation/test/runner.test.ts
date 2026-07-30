import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  EPOCH_STATE,
  encodePermissionlessAction,
  publicActionReport,
  readPublicPoolSnapshot,
  selectPublicPoolAction,
} from '../src/index.js';

const POOL = '0x0000000000000000000000000000000000000001' as const;
const ADAPTER = '0x0000000000000000000000000000000000000002' as const;
const ZERO_REQUEST = `0x${'0'.repeat(64)}` as const;

function client(options: { wrongChain?: boolean; missingCode?: boolean } = {}) {
  return {
    getChainId: async () => (options.wrongChain ? 1 : 11_155_111),
    getCode: async () => (options.missingCode ? '0x' : '0x60006000'),
    getBlock: async () => ({ number: 123n, timestamp: 100n }),
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName === 'epoch') {
        return {
          state: EPOCH_STATE.OPEN,
          deadline: 100n,
          aggregateRequestId: ZERO_REQUEST,
          aggregatePendingAt: 0n,
          resolutionPendingAt: 0n,
        };
      }
      if (functionName === 'config') {
        return {
          resolutionAdapter: ADAPTER,
          aggregateTimeout: 600n,
          resolutionGrace: 600n,
        };
      }
      if (functionName === 'pendingCommit') return [POOL, 0n, false];
      if (functionName === 'observationNotBefore') return 200n;
      throw new Error(`Unexpected read ${functionName}`);
    },
  };
}

test('T-AUT-01-04: public reader derives a close action and a sanitized dry-run report', async () => {
  const snapshot = await readPublicPoolSnapshot(client() as never, POOL);
  const action = selectPublicPoolAction(snapshot);
  assert.deepEqual(action, { kind: 'close-epoch' });
  assert.deepEqual(publicActionReport(snapshot, action), {
    pool: POOL,
    blockNumber: '123',
    state: '0',
    action: 'close-epoch',
  });
});

test('T-AUT-01-05: non-Sepolia, missing runtime, and finalization encoding boundaries reject', async () => {
  await assert.rejects(
    readPublicPoolSnapshot(client({ wrongChain: true }) as never, POOL),
    /Sepolia/,
  );
  await assert.rejects(
    readPublicPoolSnapshot(client({ missingCode: true }) as never, POOL),
    /runtime/,
  );
  const encoded = encodePermissionlessAction({ kind: 'close-epoch' });
  assert.match(encoded, /^0x[0-9a-f]+$/i);
  assert.throws(
    () => encodePermissionlessAction({ kind: 'finalize-aggregate', requestId: ZERO_REQUEST }),
    /public-result boundary/,
  );
});

test('T-AUT-01-06: runner source uses public state/action fields only', () => {
  for (const path of ['../src/runner.ts', '../scripts/run-sepolia.mts']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\b(stake|probability|position|payout|score|handle|proof)\b/i);
    assert.doesNotMatch(source, /\b(claim|refund|materializeScore|wrap|approve|transfer)\b/);
  }
});

test('T-AUT-01-07: write mode requires clean source, confirmation, re-read, gas estimate, and ledger recording', () => {
  const source = readFileSync(new URL('../scripts/run-sepolia.mts', import.meta.url), 'utf8');
  for (const required of [
    'CONFIRM_SEPOLIA_WRITE',
    'assertClean()',
    'JSON.stringify(first.action) !== JSON.stringify(second.action)',
    'estimateGas',
    'appendSpend(ledger',
    "status: 'race-retryable'",
  ]) {
    assert.ok(source.includes(required), `missing write guard: ${required}`);
  }
});
