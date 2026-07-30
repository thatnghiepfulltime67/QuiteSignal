export interface PublicLifecycle {
  label: string;
  tone: 'public' | 'pending' | 'compute' | 'signal' | 'warning';
  explanation: string;
  recovery: string;
}

export function presentLifecycle(
  state: number,
  timing?: { deadline: bigint; observedAt: bigint },
): PublicLifecycle {
  if (state === 0 && timing && timing.observedAt >= timing.deadline) {
    return {
      label: 'Commit deadline reached',
      tone: 'pending',
      explanation:
        'The immutable commit deadline has passed. The public state remains OPEN until a permissionless close action advances it.',
      recovery: 'Do not submit a new signal. Anyone may use the documented on-chain close path.',
    };
  }
  const states: Record<number, PublicLifecycle> = {
    0: {
      label: 'Open',
      tone: 'public',
      explanation: 'The cohort is accepting encrypted signals.',
      recovery: 'No recovery action is needed.',
    },
    1: {
      label: 'Closed below threshold',
      tone: 'warning',
      explanation: 'The cohort did not reach its public participant gate.',
      recovery: 'Each owner can use the pool refund path.',
    },
    2: {
      label: 'Aggregate pending',
      tone: 'compute',
      explanation: 'The aggregate decryption request is waiting for its proof.',
      recovery: 'Anyone may use the documented timeout path after eligibility.',
    },
    3: {
      label: 'Resolution pending',
      tone: 'pending',
      explanation:
        'The aggregate is public; the immutable price-feed condition is awaiting settlement.',
      recovery: 'Anyone may use the resolution grace recovery path if the feed remains invalid.',
    },
    4: {
      label: 'Settled',
      tone: 'signal',
      explanation: 'The immutable public condition settled this epoch.',
      recovery: 'Eligible owners can use their on-chain claim path.',
    },
    5: {
      label: 'Refundable',
      tone: 'warning',
      explanation: 'This epoch reached its documented terminal recovery state.',
      recovery: 'Each owner can use the on-chain refund path.',
    },
  };
  return (
    states[state] ?? {
      label: 'Unknown public state',
      tone: 'warning',
      explanation: 'The public state could not be interpreted safely.',
      recovery: 'Verify the pool directly before taking action.',
    }
  );
}
