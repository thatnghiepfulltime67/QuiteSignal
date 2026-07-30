import type { PublicManifest } from './manifest.js';

export interface MarketOverview {
  poolAddress: string;
  chainLabel: 'Ethereum Sepolia';
  condition: 'ETH/USD ≥ $2,000.00';
  cohortGate: 'At least 2 participants';
  publicNotice: string;
  privateNotice: string;
}

export function presentMarket(manifest: PublicManifest): MarketOverview {
  return {
    poolAddress: manifest.poolAddress,
    chainLabel: 'Ethereum Sepolia',
    condition: 'ETH/USD ≥ $2,000.00',
    cohortGate: 'At least 2 participants',
    publicNotice: 'Wallet addresses, transaction timing, and the final aggregate are public.',
    privateNotice:
      'Your forecast and collateral amount stay encrypted until the protocol permits an aggregate.',
  };
}
