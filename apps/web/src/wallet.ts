import { createPublicClient, createWalletClient, custom } from 'viem';
import { sepolia } from 'viem/chains';
import {
  createSepoliaConfidentialInputClient,
  createSepoliaProtocolTransactionClient,
  createViemProtocolPublicReader,
  prepareCommitSignal,
  publicAddress,
  requestId,
} from '@quitesignal/confidential-client';
import type { ValidSignalDraft } from './signal.js';

export interface BrowserProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}
export interface SignalSubmission {
  request: string;
  transactionHash: string;
}

export async function readPublicEpoch(
  provider: BrowserProvider,
  pool: string,
): Promise<{ state: number; participantCount: number; publicYes: bigint; publicNo: bigint }> {
  const client = createPublicClient({ chain: sepolia, transport: custom(provider) });
  const epoch = await createViemProtocolPublicReader(client).readEpoch(publicAddress(pool));
  return {
    state: epoch.state,
    participantCount: epoch.participantCount,
    publicYes: epoch.publicYes,
    publicNo: epoch.publicNo,
  };
}

export async function submitSignalIntent(
  provider: BrowserProvider,
  pool: string,
  values: ValidSignalDraft,
): Promise<SignalSubmission> {
  const wallet = createWalletClient({ chain: sepolia, transport: custom(provider) });
  const [account] = await wallet.getAddresses();
  if (!account) throw new Error('A connected wallet account is required.');
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  const request = requestId(
    `0x${Array.from(nonce, (byte) => byte.toString(16).padStart(2, '0')).join('')}`,
  );
  const context = { chainId: 11155111, pool: publicAddress(pool), request };
  const nox = await createSepoliaConfidentialInputClient(wallet);
  const [stake, probability] = await Promise.all([
    nox.sealUint256(values.stakeBaseUnits, context),
    nox.sealUint256(values.probabilityBps, context),
  ]);
  const prepared = prepareCommitSignal(stake, probability);
  const transactions = await createSepoliaProtocolTransactionClient(wallet);
  const transactionHash = await transactions.sendCommit(prepared);
  return { request, transactionHash };
}
