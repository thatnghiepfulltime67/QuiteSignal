import { DomainError, fail } from './errors.js';
import type {
  EpochModel,
  FeedRound,
  ImmutableEpochConfig,
  Position,
  PublicAggregateInput,
} from './schemas.js';
import { BPS_SCALE, type FundsLocation, type Outcome } from './state.js';

function assertNonNegative(value: bigint, message: string): void {
  if (value < 0n) fail('INVALID_CONFIGURATION', message);
}

function clonePositions(positions: ReadonlyMap<string, Position>): Map<string, Position> {
  return new Map([...positions].map(([owner, position]) => [owner, { ...position }]));
}

function cloneEpoch(epoch: EpochModel, overrides: Partial<EpochModel>): EpochModel {
  return {
    ...epoch,
    positions: clonePositions(epoch.positions),
    ...overrides,
  };
}

function requireState(epoch: EpochModel, expected: EpochModel['state']): void {
  if (epoch.state !== expected) {
    fail('INVALID_STATE', `Expected ${expected} but model state is ${epoch.state}.`);
  }
}

function requirePosition(epoch: EpochModel, owner: string): Position {
  const position = epoch.positions.get(owner);
  if (!position) fail('INVALID_STATE', 'The owner has not committed a signal.');
  return position;
}

function requireOptionalTimestamp(value: bigint | undefined, name: string): bigint {
  if (value === undefined) fail('INVALID_STATE', `${name} is unavailable in this state.`);
  return value;
}

function requireOptionalValue(value: bigint | undefined, name: string): bigint {
  if (value === undefined) fail('INVALID_STATE', `${name} is unavailable in this state.`);
  return value;
}

export function validateConfig(config: ImmutableEpochConfig): void {
  if (
    config.deadline <= 0n ||
    config.kMin <= 0n ||
    config.aggregateTimeout <= 0n ||
    config.resolutionGrace <= 0n ||
    config.observationNotBefore < config.deadline ||
    config.maximumFeedAge <= 0n ||
    config.resolutionThreshold <= 0n
  ) {
    fail('INVALID_CONFIGURATION', 'Immutable epoch timing or threshold configuration is invalid.');
  }
}

export function createEpoch(config: ImmutableEpochConfig): EpochModel {
  validateConfig(config);
  return {
    config: { ...config },
    state: 'OPEN',
    positions: new Map(),
    aggregateYes: 0n,
    aggregateNo: 0n,
    claimedCollateral: 0n,
    refundedCollateral: 0n,
  };
}

export function clampProbability(probabilityBps: bigint): bigint {
  if (probabilityBps < 0n) {
    fail('NEGATIVE_PROBABILITY', 'Probability basis points cannot be negative.');
  }
  return probabilityBps > BPS_SCALE ? BPS_SCALE : probabilityBps;
}

export function deriveAllocation(
  stake: bigint,
  probabilityBps: bigint,
): {
  probabilityBps: bigint;
  yesAllocation: bigint;
  noAllocation: bigint;
} {
  if (stake <= 0n) fail('NON_POSITIVE_STAKE', 'Stake must be positive.');
  const clampedProbability = clampProbability(probabilityBps);
  const yesAllocation = (stake * clampedProbability) / BPS_SCALE;
  return {
    probabilityBps: clampedProbability,
    yesAllocation,
    noAllocation: stake - yesAllocation,
  };
}

export function commitSignal(
  epoch: EpochModel,
  input: { owner: string; stake: bigint; probabilityBps: bigint; now: bigint },
): EpochModel {
  requireState(epoch, 'OPEN');
  if (input.now >= epoch.config.deadline) {
    fail('COMMIT_WINDOW_CLOSED', 'The commit window is closed.');
  }
  if (input.owner.length === 0) fail('EMPTY_OWNER', 'Owner cannot be empty.');
  if (epoch.positions.has(input.owner)) fail('ALREADY_COMMITTED', 'Owner already committed.');
  const allocation = deriveAllocation(input.stake, input.probabilityBps);
  const positions = clonePositions(epoch.positions);
  positions.set(input.owner, {
    owner: input.owner,
    stake: input.stake,
    probabilityBps: allocation.probabilityBps,
    yesAllocation: allocation.yesAllocation,
    noAllocation: allocation.noAllocation,
    claimed: false,
    refunded: false,
  });
  return cloneEpoch(epoch, {
    positions,
    aggregateYes: epoch.aggregateYes + allocation.yesAllocation,
    aggregateNo: epoch.aggregateNo + allocation.noAllocation,
  });
}

export function closeEpoch(epoch: EpochModel, now: bigint): EpochModel {
  requireState(epoch, 'OPEN');
  if (now < epoch.config.deadline) fail('COMMIT_WINDOW_CLOSED', 'The epoch cannot close early.');
  if (BigInt(epoch.positions.size) < epoch.config.kMin) {
    return cloneEpoch(epoch, { state: 'REFUNDABLE' });
  }
  return cloneEpoch(epoch, { state: 'AGGREGATE_PENDING', aggregatePendingAt: now });
}

export function requestAggregate(epoch: EpochModel, requestId: string): EpochModel {
  requireState(epoch, 'AGGREGATE_PENDING');
  if (requestId.length === 0)
    fail('AGGREGATE_REQUEST_MISSING', 'Aggregate request id is required.');
  if (epoch.aggregateRequestId !== undefined) {
    fail('DUPLICATE_AGGREGATE_REQUEST', 'Aggregate request id is already set.');
  }
  return cloneEpoch(epoch, { aggregateRequestId: requestId });
}

export function finalizeAggregate(
  epoch: EpochModel,
  input: PublicAggregateInput,
  now: bigint,
): EpochModel {
  requireState(epoch, 'AGGREGATE_PENDING');
  if (epoch.aggregateRequestId === undefined) {
    fail('AGGREGATE_REQUEST_MISSING', 'Aggregate finalization needs a request id.');
  }
  if (input.requestId !== epoch.aggregateRequestId) {
    fail('AGGREGATE_REQUEST_MISMATCH', 'Aggregate proof request id does not match.');
  }
  assertNonNegative(input.publicYes, 'Public YES aggregate cannot be negative.');
  assertNonNegative(input.publicNo, 'Public NO aggregate cannot be negative.');
  if (input.publicYes !== epoch.aggregateYes || input.publicNo !== epoch.aggregateNo) {
    fail('AGGREGATE_MISMATCH', 'Public aggregate does not match the accepted allocations.');
  }
  return cloneEpoch(epoch, {
    state: 'RESOLUTION_PENDING',
    publicYes: input.publicYes,
    publicNo: input.publicNo,
    resolutionPendingAt: now,
  });
}

export function cancelBeforeResolution(epoch: EpochModel, now: bigint): EpochModel {
  requireState(epoch, 'AGGREGATE_PENDING');
  const aggregatePendingAt = requireOptionalTimestamp(epoch.aggregatePendingAt, 'Aggregate time');
  if (now < aggregatePendingAt + epoch.config.aggregateTimeout) {
    fail('AGGREGATE_TIMEOUT_NOT_REACHED', 'Aggregate timeout has not elapsed.');
  }
  return cloneEpoch(epoch, { state: 'REFUNDABLE' });
}

export function validateRound(
  config: ImmutableEpochConfig,
  round: FeedRound,
  now: bigint,
): Outcome {
  if (now < config.observationNotBefore) {
    fail('RESOLUTION_NOT_READY', 'The immutable resolution observation time has not been reached.');
  }
  if (
    round.roundId === 0n ||
    round.answer <= 0n ||
    round.startedAt === 0n ||
    round.updatedAt === 0n ||
    round.answeredInRound < round.roundId ||
    round.updatedAt > now ||
    now - round.updatedAt > config.maximumFeedAge
  ) {
    fail('STALE_OR_INVALID_ROUND', 'Feed round is premature, stale, incomplete, or invalid.');
  }
  const yes = config.resolutionGreaterOrEqual
    ? round.answer >= config.resolutionThreshold
    : round.answer <= config.resolutionThreshold;
  return yes ? 'YES' : 'NO';
}

export function settle(epoch: EpochModel, round: FeedRound, now: bigint): EpochModel {
  requireState(epoch, 'RESOLUTION_PENDING');
  const winner = validateRound(epoch.config, round, now);
  const publicYes = requireOptionalValue(epoch.publicYes, 'Public YES aggregate');
  const publicNo = requireOptionalValue(epoch.publicNo, 'Public NO aggregate');
  const winningAggregate = winner === 'YES' ? publicYes : publicNo;
  if (winningAggregate === 0n) {
    fail('ZERO_WINNING_POOL', 'The selected outcome has no winning aggregate.');
  }
  return cloneEpoch(epoch, {
    state: 'SETTLED',
    winner,
    settledRoundId: round.roundId,
    settledAnswer: round.answer,
  });
}

export function cancelAfterResolutionGrace(epoch: EpochModel, now: bigint): EpochModel {
  requireState(epoch, 'RESOLUTION_PENDING');
  const resolutionPendingAt = requireOptionalTimestamp(
    epoch.resolutionPendingAt,
    'Resolution time',
  );
  if (now < resolutionPendingAt + epoch.config.resolutionGrace) {
    fail('RESOLUTION_GRACE_NOT_REACHED', 'Resolution grace has not elapsed.');
  }
  return cloneEpoch(epoch, { state: 'REFUNDABLE' });
}

export function scoreBps(probabilityBps: bigint, winner: Outcome): bigint {
  const outcomeBps = winner === 'YES' ? BPS_SCALE : 0n;
  const error =
    probabilityBps >= outcomeBps ? probabilityBps - outcomeBps : outcomeBps - probabilityBps;
  return BPS_SCALE - (error * error) / BPS_SCALE;
}

export function totalCollateral(epoch: EpochModel): bigint {
  return epoch.aggregateYes + epoch.aggregateNo;
}

export function calculatePayout(epoch: EpochModel, owner: string): bigint {
  requireState(epoch, 'SETTLED');
  const position = requirePosition(epoch, owner);
  const winner = epoch.winner;
  if (winner === undefined) fail('INVALID_STATE', 'Winner is unavailable after settlement.');
  const publicYes = requireOptionalValue(epoch.publicYes, 'Public YES aggregate');
  const publicNo = requireOptionalValue(epoch.publicNo, 'Public NO aggregate');
  const winningAggregate = winner === 'YES' ? publicYes : publicNo;
  if (winningAggregate === 0n) fail('ZERO_WINNING_POOL', 'Winning aggregate cannot be zero.');
  const winningAllocation = winner === 'YES' ? position.yesAllocation : position.noAllocation;
  return (winningAllocation * totalCollateral(epoch)) / winningAggregate;
}

export function claim(
  epoch: EpochModel,
  owner: string,
): { epoch: EpochModel; payout: bigint; score: bigint } {
  requireState(epoch, 'SETTLED');
  const position = requirePosition(epoch, owner);
  if (position.refunded) fail('TERMINAL_CONFLICT', 'A refunded position cannot claim.');
  if (position.claimed) fail('ALREADY_CLAIMED', 'Position already claimed.');
  const payout = calculatePayout(epoch, owner);
  const nextClaimedCollateral = epoch.claimedCollateral + payout;
  if (nextClaimedCollateral > totalCollateral(epoch)) {
    fail('INVALID_STATE', 'Claim would exceed confidential pool collateral.');
  }
  const positions = clonePositions(epoch.positions);
  positions.set(owner, { ...position, claimed: true });
  return {
    epoch: cloneEpoch(epoch, { positions, claimedCollateral: nextClaimedCollateral }),
    payout,
    score: scoreBps(position.probabilityBps, epoch.winner!),
  };
}

export function refund(epoch: EpochModel, owner: string): { epoch: EpochModel; amount: bigint } {
  requireState(epoch, 'REFUNDABLE');
  const position = requirePosition(epoch, owner);
  if (position.claimed) fail('TERMINAL_CONFLICT', 'A claimed position cannot refund.');
  if (position.refunded) fail('ALREADY_REFUNDED', 'Position already refunded.');
  const nextRefundedCollateral = epoch.refundedCollateral + position.stake;
  if (nextRefundedCollateral > totalCollateral(epoch)) {
    fail('INVALID_STATE', 'Refund would exceed confidential pool collateral.');
  }
  const positions = clonePositions(epoch.positions);
  positions.set(owner, { ...position, refunded: true });
  return {
    epoch: cloneEpoch(epoch, { positions, refundedCollateral: nextRefundedCollateral }),
    amount: position.stake,
  };
}

export function fundsLocation(epoch: EpochModel): FundsLocation {
  return epoch.state === 'SETTLED' ? 'CONFIDENTIAL_PAYOUT_POOL' : 'CONFIDENTIAL_POOL';
}

export function assertModelInvariants(epoch: EpochModel): void {
  let yes = 0n;
  let no = 0n;
  for (const position of epoch.positions.values()) {
    if (position.yesAllocation + position.noAllocation !== position.stake) {
      fail('INVALID_STATE', 'Position allocation does not conserve stake.');
    }
    if (position.claimed && position.refunded) {
      fail('TERMINAL_CONFLICT', 'Position cannot be claimed and refunded.');
    }
    yes += position.yesAllocation;
    no += position.noAllocation;
  }
  if (yes !== epoch.aggregateYes || no !== epoch.aggregateNo) {
    fail('INVALID_STATE', 'Epoch aggregate does not match positions.');
  }
  if (
    epoch.claimedCollateral > totalCollateral(epoch) ||
    epoch.refundedCollateral > totalCollateral(epoch)
  ) {
    fail('INVALID_STATE', 'Terminal total exceeds confidential pool collateral.');
  }
}

export function isDomainError(error: unknown, code: DomainError['code']): boolean {
  return error instanceof DomainError && error.code === code;
}
