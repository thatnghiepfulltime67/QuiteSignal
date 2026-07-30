export type PermissionlessLifecycleAction =
  | 'expire-pending-commit'
  | 'close-epoch'
  | 'request-aggregate-decrypt'
  | 'finalize-aggregate'
  | 'cancel-before-resolution'
  | 'settle'
  | 'cancel-after-resolution-grace';

export interface LifecycleActionInput {
  state: number;
  now: bigint;
  deadline: bigint;
  pendingAvailableAt: bigint;
  aggregateRequestId: string;
  aggregatePendingAt: bigint;
  aggregateTimeout: bigint;
  resolutionPendingAt: bigint;
  resolutionGrace: bigint;
  observationNotBefore: bigint;
}

export interface LifecycleActionPresentation {
  action: PermissionlessLifecycleAction;
  label: string;
  explanation: string;
}

const ZERO_REQUEST = `0x${'0'.repeat(64)}`;

const presentations: Record<
  PermissionlessLifecycleAction,
  Omit<LifecycleActionPresentation, 'action'>
> = {
  'expire-pending-commit': {
    label: 'Expire stalled commit',
    explanation: 'Clears the timed-out pending intent through the contract recovery path.',
  },
  'close-epoch': {
    label: 'Close commit window',
    explanation: 'Applies the immutable cohort rule after the public deadline.',
  },
  'request-aggregate-decrypt': {
    label: 'Request aggregate proof',
    explanation: 'Enables public proof retrieval only for the two k-gated aggregate handles.',
  },
  'finalize-aggregate': {
    label: 'Finalize public aggregate',
    explanation:
      'Requests two transient Nox public attestations, then stores only verified totals.',
  },
  'cancel-before-resolution': {
    label: 'Enter aggregate refund path',
    explanation: 'The aggregate request timed out; the contract can make each owner refundable.',
  },
  settle: {
    label: 'Settle from price feed',
    explanation: 'Reads the immutable adapter; this action accepts no caller-selected outcome.',
  },
  'cancel-after-resolution-grace': {
    label: 'Enter feed-grace refund path',
    explanation: 'The resolution grace elapsed; the contract can make each owner refundable.',
  },
};

function presentation(action: PermissionlessLifecycleAction): LifecycleActionPresentation {
  return { action, ...presentations[action] };
}

export function presentEligibleLifecycleActions(
  input: LifecycleActionInput,
): LifecycleActionPresentation[] {
  if (input.now < 0n) return [];
  if (input.state === 0) return input.now >= input.deadline ? [presentation('close-epoch')] : [];
  if (input.state === 1)
    return input.now >= input.pendingAvailableAt ? [presentation('expire-pending-commit')] : [];
  if (input.state === 2) {
    if (input.aggregateRequestId.toLowerCase() === ZERO_REQUEST)
      return [presentation('request-aggregate-decrypt')];
    const actions: LifecycleActionPresentation[] = [presentation('finalize-aggregate')];
    if (input.now >= input.aggregatePendingAt + input.aggregateTimeout)
      actions.push(presentation('cancel-before-resolution'));
    return actions;
  }
  if (input.state === 3) {
    const actions: LifecycleActionPresentation[] = [];
    if (input.now >= input.observationNotBefore) actions.push(presentation('settle'));
    if (input.now >= input.resolutionPendingAt + input.resolutionGrace)
      actions.push(presentation('cancel-after-resolution-grace'));
    return actions;
  }
  return [];
}
