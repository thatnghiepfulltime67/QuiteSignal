import type { PublicManifest } from './manifest.js';

export interface VerificationView {
  chain: 'Ethereum Sepolia';
  pool: string;
  manifest: 'canonical';
  evidence: 'G6 protocol evidence passed';
}

export function presentVerification(manifest: PublicManifest, address: string): VerificationView {
  if (address.toLowerCase() !== manifest.poolAddress.toLowerCase())
    throw new Error('The requested pool is not the canonical manifest pool.');
  return {
    chain: 'Ethereum Sepolia',
    pool: manifest.poolAddress,
    manifest: 'canonical',
    evidence: 'G6 protocol evidence passed',
  };
}
