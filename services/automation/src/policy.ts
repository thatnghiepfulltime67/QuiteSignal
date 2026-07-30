export const EPOCH_STATE = {
  OPEN: 0,
  COMMIT_PENDING: 1,
  AGGREGATE_PENDING: 2,
  RESOLUTION_PENDING: 3,
  SETTLED: 4,
  REFUNDABLE: 5,
} as const;

export type EpochState = (typeof EPOCH_STATE)[keyof typeof EPOCH_STATE];

export interface PublicEpochState {
  state: EpochState;
  deadline: bigint;
  aggregateRequestId: `0x${string}`;
  aggregatePendingAt: bigint;
  resolutionPendingAt: bigint;
}

export interface PublicTiming {
  pendingAvailableAt: bigint;
  aggregateTimeout: bigint;
  resolutionGrace: bigint;
  observationNotBefore: bigint;
}

export interface PublicReadiness {
  aggregateResultAvailable: boolean;
}

export type PermissionlessAction =
  | { kind: 'expire-pending-commit' }
  | { kind: 'close-epoch' }
  | { kind: 'request-aggregate-decrypt' }
  | { kind: 'finalize-aggregate'; requestId: `0x${string}` }
  | { kind: 'cancel-before-resolution' }
  | { kind: 'settle' }
  | { kind: 'cancel-after-resolution-grace' };

const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as const;

function isKnownState(state: number): state is EpochState {
  return Object.values(EPOCH_STATE).includes(state as EpochState);
}

function atOrAfter(now: bigint, eligibleAt: bigint): boolean {
  return now >= eligibleAt;
}

export function selectPermissionlessAction(input: {
  now: bigint;
  epoch: PublicEpochState;
  timing: PublicTiming;
  readiness: PublicReadiness;
}): PermissionlessAction | undefined {
  if (input.now < 0n || !isKnownState(input.epoch.state)) return undefined;
  switch (input.epoch.state) {
    case EPOCH_STATE.OPEN:
      return atOrAfter(input.now, input.epoch.deadline) ? { kind: 'close-epoch' } : undefined;
    case EPOCH_STATE.COMMIT_PENDING:
      return atOrAfter(input.now, input.timing.pendingAvailableAt)
        ? { kind: 'expire-pending-commit' }
        : undefined;
    case EPOCH_STATE.AGGREGATE_PENDING:
      if (input.epoch.aggregateRequestId === ZERO_BYTES32) {
        return { kind: 'request-aggregate-decrypt' };
      }
      if (input.readiness.aggregateResultAvailable) {
        return { kind: 'finalize-aggregate', requestId: input.epoch.aggregateRequestId };
      }
      return atOrAfter(input.now, input.epoch.aggregatePendingAt + input.timing.aggregateTimeout)
        ? { kind: 'cancel-before-resolution' }
        : undefined;
    case EPOCH_STATE.RESOLUTION_PENDING:
      if (atOrAfter(input.now, input.timing.observationNotBefore)) return { kind: 'settle' };
      return atOrAfter(input.now, input.epoch.resolutionPendingAt + input.timing.resolutionGrace)
        ? { kind: 'cancel-after-resolution-grace' }
        : undefined;
    case EPOCH_STATE.SETTLED:
    case EPOCH_STATE.REFUNDABLE:
      return undefined;
  }
}
