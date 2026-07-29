export const BPS_SCALE = 10_000n;
export const MAX_UINT256 = (1n << 256n) - 1n;

export interface ArithmeticVector {
  id: bigint;
  stake: bigint;
  probabilityBps: bigint;
  outcomeBps: bigint;
}

export interface ArithmeticExpectation {
  clampedProbabilityBps: bigint;
  yesAllocation: bigint;
  noAllocation: bigint;
  scoreBps: bigint;
}

export function calculateExpectation(vector: ArithmeticVector): ArithmeticExpectation {
  const clampedProbabilityBps =
    vector.probabilityBps <= BPS_SCALE ? vector.probabilityBps : BPS_SCALE;
  const yesAllocation = (vector.stake * clampedProbabilityBps) / BPS_SCALE;
  const noAllocation = vector.stake - yesAllocation;
  const error =
    clampedProbabilityBps >= vector.outcomeBps
      ? clampedProbabilityBps - vector.outcomeBps
      : vector.outcomeBps - clampedProbabilityBps;
  const scoreBps = BPS_SCALE - (error * error) / BPS_SCALE;

  return { clampedProbabilityBps, yesAllocation, noAllocation, scoreBps };
}

export const REQUIRED_VECTORS: readonly ArithmeticVector[] = [
  { id: 1n, stake: 0n, probabilityBps: 0n, outcomeBps: 0n },
  { id: 2n, stake: 1n, probabilityBps: 1n, outcomeBps: BPS_SCALE },
  { id: 3n, stake: 10_001n, probabilityBps: 4_999n, outcomeBps: 0n },
  { id: 4n, stake: 2n, probabilityBps: 5_000n, outcomeBps: BPS_SCALE },
  { id: 5n, stake: 9_999n, probabilityBps: 9_999n, outcomeBps: 0n },
  { id: 6n, stake: 10_000n, probabilityBps: 10_000n, outcomeBps: BPS_SCALE },
  { id: 7n, stake: 100_000n, probabilityBps: 10_001n, outcomeBps: BPS_SCALE },
  { id: 8n, stake: 1n, probabilityBps: MAX_UINT256, outcomeBps: 0n },
  { id: 9n, stake: MAX_UINT256, probabilityBps: 0n, outcomeBps: BPS_SCALE },
  { id: 10n, stake: 1n, probabilityBps: 0n, outcomeBps: BPS_SCALE },
];
