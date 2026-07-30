import type { EpochState, Outcome } from './state.js';

export interface ImmutableEpochConfig {
  deadline: bigint;
  kMin: bigint;
  aggregateTimeout: bigint;
  resolutionGrace: bigint;
  observationNotBefore: bigint;
  maximumFeedAge: bigint;
  resolutionGreaterOrEqual: boolean;
  resolutionThreshold: bigint;
}

export interface FeedRound {
  roundId: bigint;
  answer: bigint;
  startedAt: bigint;
  updatedAt: bigint;
  answeredInRound: bigint;
}

export interface PublicAggregateInput {
  requestId: string;
  publicYes: bigint;
  publicNo: bigint;
}

export interface Position {
  owner: string;
  stake: bigint;
  probabilityBps: bigint;
  yesAllocation: bigint;
  noAllocation: bigint;
  claimed: boolean;
  refunded: boolean;
}

export interface EpochModel {
  config: ImmutableEpochConfig;
  state: EpochState;
  positions: ReadonlyMap<string, Position>;
  aggregateYes: bigint;
  aggregateNo: bigint;
  aggregatePendingAt?: bigint;
  aggregateRequestId?: string;
  resolutionPendingAt?: bigint;
  publicYes?: bigint;
  publicNo?: bigint;
  winner?: Outcome;
  settledRoundId?: bigint;
  settledAnswer?: bigint;
  claimedCollateral: bigint;
  refundedCollateral: bigint;
}
