import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BPS_SCALE,
  DomainError,
  assertModelInvariants,
  calculatePayout,
  cancelAfterResolutionGrace,
  cancelBeforeResolution,
  claim,
  closeEpoch,
  commitSignal,
  createEpoch,
  deriveAllocation,
  finalizeAggregate,
  fundsLocation,
  refund,
  requestAggregate,
  scoreBps,
  settle,
  type EpochModel,
  type FeedRound,
  type ImmutableEpochConfig,
} from '../src/index.js';

function configuration(overrides: Partial<ImmutableEpochConfig> = {}): ImmutableEpochConfig {
  return {
    deadline: 100n,
    kMin: 2n,
    aggregateTimeout: 10n,
    resolutionGrace: 20n,
    observationNotBefore: 100n,
    maximumFeedAge: 10n,
    resolutionGreaterOrEqual: true,
    resolutionThreshold: 50n,
    ...overrides,
  };
}

function round(answer: bigint, updatedAt = 110n): FeedRound {
  return {
    roundId: 7n,
    answer,
    startedAt: updatedAt,
    updatedAt,
    answeredInRound: 7n,
  };
}

function expectCode(action: () => unknown, code: DomainError['code']): void {
  assert.throws(action, (error: unknown) => error instanceof DomainError && error.code === code);
}

function finalize(epoch: EpochModel, now = 105n): EpochModel {
  return finalizeAggregate(
    requestAggregate(epoch, 'aggregate-1'),
    { requestId: 'aggregate-1', publicYes: epoch.aggregateYes, publicNo: epoch.aggregateNo },
    now,
  );
}

test('T-DOMAIN-PK01-01: allocation and private score math retain floor semantics', () => {
  assert.deepEqual(deriveAllocation(101n, 5_000n), {
    probabilityBps: 5_000n,
    yesAllocation: 50n,
    noAllocation: 51n,
  });
  assert.equal(deriveAllocation(10n, 10_001n).probabilityBps, BPS_SCALE);
  expectCode(() => deriveAllocation(10n, -1n), 'NEGATIVE_PROBABILITY');
  assert.equal(scoreBps(0n, 'NO'), BPS_SCALE);
  assert.equal(scoreBps(BPS_SCALE, 'YES'), BPS_SCALE);
  assert.equal(scoreBps(0n, 'YES'), 0n);
  assert.equal(scoreBps(5_000n, 'YES'), 7_500n);
});

test('T-DOMAIN-PK01-02: configuration and commit-window boundaries reject invalid inputs', () => {
  expectCode(() => createEpoch(configuration({ deadline: 0n })), 'INVALID_CONFIGURATION');
  expectCode(
    () => createEpoch(configuration({ resolutionThreshold: 0n })),
    'INVALID_CONFIGURATION',
  );
  expectCode(
    () => createEpoch(configuration({ resolutionThreshold: -1n })),
    'INVALID_CONFIGURATION',
  );

  let epoch = createEpoch(configuration());
  expectCode(
    () => commitSignal(epoch, { owner: '', stake: 10n, probabilityBps: 5_000n, now: 1n }),
    'EMPTY_OWNER',
  );
  epoch = commitSignal(epoch, { owner: 'alice', stake: 10n, probabilityBps: 5_000n, now: 1n });
  expectCode(
    () => commitSignal(epoch, { owner: 'alice', stake: 10n, probabilityBps: 5_000n, now: 2n }),
    'ALREADY_COMMITTED',
  );
  expectCode(
    () => commitSignal(epoch, { owner: 'bob', stake: 10n, probabilityBps: 5_000n, now: 100n }),
    'COMMIT_WINDOW_CLOSED',
  );
  expectCode(() => closeEpoch(epoch, 99n), 'COMMIT_WINDOW_CLOSED');

  const emptyEpoch = closeEpoch(createEpoch(configuration({ kMin: 1n })), 100n);
  assert.equal(emptyEpoch.state, 'REFUNDABLE');
  expectCode(() => requestAggregate(emptyEpoch, 'unexpected'), 'INVALID_STATE');
});

test('T-DOMAIN-PK01-03: full lifecycle conserves allocations and bounds private claims', () => {
  let epoch = createEpoch(configuration());
  epoch = commitSignal(epoch, { owner: 'alice', stake: 101n, probabilityBps: 10_000n, now: 1n });
  epoch = commitSignal(epoch, { owner: 'bob', stake: 100n, probabilityBps: 5_000n, now: 2n });
  epoch = commitSignal(epoch, { owner: 'carol', stake: 99n, probabilityBps: 0n, now: 3n });
  epoch = closeEpoch(epoch, 100n);
  epoch = finalize(epoch);
  epoch = settle(epoch, round(60n), 110n);
  assert.equal(epoch.state, 'SETTLED');
  assert.equal(fundsLocation(epoch), 'CONFIDENTIAL_PAYOUT_POOL');
  const alicePayout = calculatePayout(epoch, 'alice');
  const bobPayout = calculatePayout(epoch, 'bob');
  const carolPayout = calculatePayout(epoch, 'carol');
  assert.equal(alicePayout + bobPayout + carolPayout, 299n);
  assert.ok(alicePayout + bobPayout + carolPayout <= 300n);
  ({ epoch } = claim(epoch, 'alice'));
  ({ epoch } = claim(epoch, 'bob'));
  ({ epoch } = claim(epoch, 'carol'));
  assert.equal(epoch.claimedCollateral, 299n);
  assertModelInvariants(epoch);
  expectCode(() => claim(epoch, 'alice'), 'ALREADY_CLAIMED');
});

test('T-DOMAIN-PK01-04: below-k and aggregate-timeout paths return confidential refunds', () => {
  let belowK = createEpoch(configuration({ kMin: 2n }));
  belowK = commitSignal(belowK, { owner: 'alice', stake: 11n, probabilityBps: 2_000n, now: 1n });
  belowK = closeEpoch(belowK, 100n);
  assert.equal(belowK.state, 'REFUNDABLE');
  assert.equal(fundsLocation(belowK), 'CONFIDENTIAL_POOL');
  const refunded = refund(belowK, 'alice');
  assert.equal(refunded.amount, 11n);
  expectCode(() => refund(refunded.epoch, 'alice'), 'ALREADY_REFUNDED');

  let pending = createEpoch(configuration());
  pending = commitSignal(pending, { owner: 'alice', stake: 11n, probabilityBps: 2_000n, now: 1n });
  pending = commitSignal(pending, { owner: 'bob', stake: 12n, probabilityBps: 8_000n, now: 2n });
  pending = closeEpoch(pending, 100n);
  expectCode(() => cancelBeforeResolution(pending, 109n), 'AGGREGATE_TIMEOUT_NOT_REACHED');
  pending = cancelBeforeResolution(pending, 110n);
  assert.equal(pending.state, 'REFUNDABLE');
  assertModelInvariants(pending);
});

test('T-DOMAIN-PK01-05: aggregate request and feed-resolution failures preserve recovery', () => {
  let epoch = createEpoch(configuration());
  epoch = commitSignal(epoch, { owner: 'alice', stake: 10n, probabilityBps: 0n, now: 1n });
  epoch = commitSignal(epoch, { owner: 'bob', stake: 10n, probabilityBps: 0n, now: 2n });
  epoch = closeEpoch(epoch, 100n);
  expectCode(
    () => finalizeAggregate(epoch, { requestId: 'missing', publicYes: 0n, publicNo: 20n }, 101n),
    'AGGREGATE_REQUEST_MISSING',
  );
  epoch = requestAggregate(epoch, 'aggregate-1');
  expectCode(() => requestAggregate(epoch, 'aggregate-2'), 'DUPLICATE_AGGREGATE_REQUEST');
  expectCode(
    () => finalizeAggregate(epoch, { requestId: 'other', publicYes: 0n, publicNo: 20n }, 101n),
    'AGGREGATE_REQUEST_MISMATCH',
  );
  expectCode(
    () =>
      finalizeAggregate(epoch, { requestId: 'aggregate-1', publicYes: 1n, publicNo: 19n }, 101n),
    'AGGREGATE_MISMATCH',
  );
  epoch = finalizeAggregate(
    epoch,
    { requestId: 'aggregate-1', publicYes: 0n, publicNo: 20n },
    101n,
  );
  expectCode(() => settle(epoch, round(60n, 101n), 99n), 'RESOLUTION_NOT_READY');
  expectCode(() => settle(epoch, { ...round(60n), answer: 0n }, 110n), 'STALE_OR_INVALID_ROUND');
  expectCode(
    () => settle(epoch, { ...round(60n), answeredInRound: 6n }, 110n),
    'STALE_OR_INVALID_ROUND',
  );
  expectCode(() => settle(epoch, round(60n, 99n), 110n), 'STALE_OR_INVALID_ROUND');
  expectCode(() => settle(epoch, round(60n, 110n), 110n), 'ZERO_WINNING_POOL');
  expectCode(() => cancelAfterResolutionGrace(epoch, 120n), 'RESOLUTION_GRACE_NOT_REACHED');
  epoch = cancelAfterResolutionGrace(epoch, 121n);
  assert.equal(epoch.state, 'REFUNDABLE');
  ({ epoch } = refund(epoch, 'alice'));
  expectCode(() => claim(epoch, 'alice'), 'INVALID_STATE');
  assertModelInvariants(epoch);
});

test('T-DOMAIN-PK01-06: one thousand deterministic model vectors preserve conservation and terminal bounds', () => {
  let seed = 0x1234_5678n;
  const next = (maximum: bigint): bigint => {
    seed = (seed * 1_103_515_245n + 12_345n) % 2_147_483_648n;
    return seed % maximum;
  };

  for (let vector = 0; vector < 1_000; vector += 1) {
    const count = Number(next(7n) + 1n);
    let epoch = createEpoch(configuration({ kMin: 1n }));
    for (let index = 0; index < count; index += 1) {
      epoch = commitSignal(epoch, {
        owner: `owner-${vector}-${index}`,
        stake: next(1_000n) + 1n,
        probabilityBps: next(12_001n),
        now: BigInt(index + 1),
      });
    }
    epoch = closeEpoch(epoch, 100n);
    epoch = finalize(epoch);
    const feedAnswer = next(2n) === 0n ? 40n : 60n;
    try {
      epoch = settle(epoch, round(feedAnswer), 110n);
      let claimed = 0n;
      for (const owner of epoch.positions.keys()) {
        const result = claim(epoch, owner);
        epoch = result.epoch;
        claimed += result.payout;
      }
      assert.equal(claimed, epoch.claimedCollateral);
      assert.ok(claimed <= epoch.aggregateYes + epoch.aggregateNo);
    } catch (error) {
      assert.ok(error instanceof DomainError && error.code === 'ZERO_WINNING_POOL');
      epoch = cancelAfterResolutionGrace(epoch, 125n);
      let refunded = 0n;
      for (const owner of epoch.positions.keys()) {
        const result = refund(epoch, owner);
        epoch = result.epoch;
        refunded += result.amount;
      }
      assert.equal(refunded, epoch.refundedCollateral);
      assert.equal(refunded, epoch.aggregateYes + epoch.aggregateNo);
    }
    assertModelInvariants(epoch);
  }
});
