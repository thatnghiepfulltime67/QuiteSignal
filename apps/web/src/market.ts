import type { PublicManifest } from './manifest.js';

export interface MarketOverview {
  poolAddress: string;
  chainLabel: 'Ethereum Sepolia';
  condition: string;
  cohortGate: string;
  publicNotice: string;
  privateNotice: string;
}

function formatPriceThreshold(value: string): string {
  const raw = BigInt(value);
  const dollars = raw / 100_000_000n;
  const cents = ((raw % 100_000_000n) / 1_000_000n).toString().padStart(2, '0');
  return `$${dollars.toLocaleString('en-US')}.${cents}`;
}

export function presentMarket(
  manifest: PublicManifest,
  cohortGate = 'Loading public cohort rule…',
): MarketOverview {
  const comparison = manifest.comparison === 'greater-or-equal' ? '≥' : '<';
  return {
    poolAddress: manifest.poolAddress,
    chainLabel: 'Ethereum Sepolia',
    condition: `ETH/USD ${comparison} ${formatPriceThreshold(manifest.threshold)}`,
    cohortGate,
    publicNotice: 'Wallet addresses, transaction timing, and the final aggregate are public.',
    privateNotice:
      'Your forecast and collateral amount stay encrypted until the protocol permits an aggregate.',
  };
}
