import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { EPOCH_STATE, selectPermissionlessAction, type PublicEpochState } from '../src/index.js';

const ZERO_REQUEST = `0x${'0'.repeat(64)}` as const;
const REQUEST = `0x${'1'.repeat(64)}` as const;

function epoch(
  state: PublicEpochState['state'],
  overrides: Partial<PublicEpochState> = {},
): PublicEpochState {
  return {
    state,
    deadline: 100n,
    aggregateRequestId: ZERO_REQUEST,
    aggregatePendingAt: 200n,
    resolutionPendingAt: 300n,
    ...overrides,
  };
}

const timing = {
  pendingAvailableAt: 50n,
  aggregateTimeout: 40n,
  resolutionGrace: 40n,
  observationNotBefore: 350n,
};

test('T-AUT-01-01: every public lifecycle state selects at most one safe permissionless action', () => {
  const scenarios = [
    [99n, epoch(EPOCH_STATE.OPEN), undefined],
    [100n, epoch(EPOCH_STATE.OPEN), { kind: 'close-epoch' }],
    [49n, epoch(EPOCH_STATE.COMMIT_PENDING), undefined],
    [50n, epoch(EPOCH_STATE.COMMIT_PENDING), { kind: 'expire-pending-commit' }],
    [201n, epoch(EPOCH_STATE.AGGREGATE_PENDING), { kind: 'request-aggregate-decrypt' }],
    [201n, epoch(EPOCH_STATE.AGGREGATE_PENDING, { aggregateRequestId: REQUEST }), undefined],
    [
      201n,
      epoch(EPOCH_STATE.AGGREGATE_PENDING, { aggregateRequestId: REQUEST }),
      { kind: 'finalize-aggregate', requestId: REQUEST },
    ],
    [
      240n,
      epoch(EPOCH_STATE.AGGREGATE_PENDING, { aggregateRequestId: REQUEST }),
      { kind: 'cancel-before-resolution' },
    ],
    [349n, epoch(EPOCH_STATE.RESOLUTION_PENDING), { kind: 'cancel-after-resolution-grace' }],
    [350n, epoch(EPOCH_STATE.RESOLUTION_PENDING), { kind: 'settle' }],
    [1_000n, epoch(EPOCH_STATE.SETTLED), undefined],
    [1_000n, epoch(EPOCH_STATE.REFUNDABLE), undefined],
  ] as const;
  for (const [now, current, expected] of scenarios) {
    const result = selectPermissionlessAction({
      now,
      epoch: current,
      timing,
      readiness: { aggregateResultAvailable: expected?.kind === 'finalize-aggregate' },
    });
    assert.deepEqual(result, expected);
  }
});

test('T-AUT-01-02: invalid state/time never creates a transaction candidate', () => {
  assert.equal(
    selectPermissionlessAction({
      now: -1n,
      epoch: epoch(EPOCH_STATE.OPEN),
      timing,
      readiness: { aggregateResultAvailable: false },
    }),
    undefined,
  );
  assert.equal(
    selectPermissionlessAction({
      now: 1_000n,
      epoch: { ...epoch(EPOCH_STATE.OPEN), state: 99 as PublicEpochState['state'] },
      timing,
      readiness: { aggregateResultAvailable: false },
    }),
    undefined,
  );
});

test('T-AUT-01-03: policy source has no owner-action or confidential-data schema', () => {
  const source = readFileSync(new URL('../src/policy.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(claim|refund|materializeScore|wrap|approve|transfer)\b/);
  assert.doesNotMatch(source, /\b(stake|probability|position|payout|score|handle|proof)\b/i);
});
