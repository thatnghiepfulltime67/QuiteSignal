export const BPS_SCALE = 10_000n;

export type EpochState =
  'OPEN' | 'AGGREGATE_PENDING' | 'RESOLUTION_PENDING' | 'SETTLED' | 'REFUNDABLE';

export type Outcome = 'YES' | 'NO';

export type FundsLocation = 'CONFIDENTIAL_POOL' | 'CONFIDENTIAL_PAYOUT_POOL';
