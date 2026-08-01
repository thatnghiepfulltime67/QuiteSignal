import { decimalInput, parseBaseUnits } from '@quitesignal/confidential-client';

export interface SignalDraft {
  stake: string;
  probability: string;
}

export interface ValidSignalDraft {
  stakeBaseUnits: bigint;
  probabilityBps: bigint;
}

export function probabilityPercentToBps(input: string): string {
  if (!/^\d{1,3}$/.test(input))
    throw new Error('Probability must be a whole percentage from 0 to 100.');
  const percent = BigInt(input);
  if (percent > 100n)
    throw new Error('Probability must be between 0 and 100 percent.');
  return (percent * 100n).toString();
}

export function formatProbabilityPercent(probabilityBps: bigint): string {
  if (probabilityBps < 0n || probabilityBps > 10_000n)
    throw new Error('Probability must be between 0 and 10,000 basis points.');
  const wholePercent = probabilityBps / 100n;
  const remainder = probabilityBps % 100n;
  if (remainder === 0n) return `${wholePercent}%`;
  const fractionalPercent = remainder.toString().padStart(2, '0').replace(/0+$/, '');
  return `${wholePercent}.${fractionalPercent}%`;
}

export function validateSignalDraft(draft: SignalDraft): ValidSignalDraft {
  const stake = parseBaseUnits(decimalInput(draft.stake, 18), 18);
  if (stake === 0n) throw new Error('Collateral must be greater than zero.');
  if (!/^\d{1,5}$/.test(draft.probability))
    throw new Error('Probability must be whole basis points.');
  const probabilityBps = BigInt(draft.probability);
  if (probabilityBps > 10_000n)
    throw new Error('Probability must be between 0 and 10,000 basis points.');
  return { stakeBaseUnits: stake, probabilityBps };
}
