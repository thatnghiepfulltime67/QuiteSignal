import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  http,
  type Address,
  type Hex,
} from 'viem';
import { sepolia } from 'viem/chains';
import { createViemHandleClient } from '@iexec-nox/handle';
import {
  createSepoliaConfidentialInputClient,
  createSepoliaProtocolTransactionClient,
  createViemProtocolPublicReader,
  prepareCommitSignal,
  publicAddress,
  quietSignalCollateralAbi,
  quietSignalPoolAbi,
  requestId,
} from '@quitesignal/confidential-client';
import type { ValidSignalDraft } from './signal.js';

const SEPOLIA_PUBLIC_READ_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

const testFaucetAbi = [
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const collateralSetupAbi = [
  {
    type: 'function',
    name: 'underlying',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'wrap',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'confidentialBalanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
] as const;

export interface BrowserProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}
export interface SignalSubmission {
  request: string;
  intentTransactionHash: string;
  callbackTransactionHash: string;
  finalizeTransactionHash: string;
}

export interface TestAssetState {
  account: string;
  publicBalance: bigint;
  allowance: bigint;
  confidentialBalance: bigint;
  nativeBalance: bigint;
}

export type OwnerTerminalAction = 'materializeScore' | 'claim' | 'refund';

type SignalJourneyStage =
  | 'preparing'
  | 'intent-submitted'
  | 'intent-confirmed'
  | 'callback-submitted'
  | 'callback-confirmed'
  | 'finalize-submitted'
  | 'complete';

export class SignalJourneyError extends Error {
  constructor(
    message: string,
    readonly allowsFinalizationRetry: boolean,
  ) {
    super(message);
  }
}

function stageFailure(stage: SignalJourneyStage): SignalJourneyError {
  const message = {
    preparing:
      'No transaction was confirmed. Verify the Sepolia wallet and canonical deployment, then retry safely.',
    'intent-submitted':
      'The signal intent may be pending. No collateral callback was finalized; read the public pool state before retrying.',
    'intent-confirmed':
      'The signal intent is confirmed. Collateral callback/finalization remains pending; read public pool state before retrying.',
    'callback-submitted':
      'The confidential collateral callback may be pending. No finalization was sent; read public pool state before retrying.',
    'callback-confirmed':
      'The collateral callback is confirmed but finalization remains pending. Read public pool state before retrying.',
    'finalize-submitted':
      'Finalization may be pending. Do not resubmit; read the public pool state for the authoritative outcome.',
    complete:
      'The signal journey ended unexpectedly. Read public pool state before taking another action.',
  }[stage];
  return new SignalJourneyError(
    message,
    stage === 'callback-submitted' ||
      stage === 'callback-confirmed' ||
      stage === 'finalize-submitted',
  );
}

async function connectedSepoliaWallet(provider: BrowserProvider): Promise<{
  account: Address;
  wallet: ReturnType<typeof createWalletClient>;
}> {
  const discovery = createWalletClient({ chain: sepolia, transport: custom(provider) });
  const [account] = await discovery.getAddresses();
  if (!account) throw new Error('A connected wallet account is required.');
  const wallet = createWalletClient({ account, chain: sepolia, transport: custom(provider) });
  if ((await wallet.getChainId()) !== 11_155_111)
    throw new Error('The connected wallet must use Ethereum Sepolia.');
  return { account, wallet };
}

async function waitForConfirmedReceipt(
  reader: ReturnType<typeof createPublicClient>,
  hash: Hex,
): Promise<void> {
  const receipt = await reader.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('The submitted transaction reverted.');
}

async function verifyTestAssetBinding(
  reader: ReturnType<typeof createPublicClient>,
  faucet: string,
  collateral: string,
): Promise<{ faucet: Address; collateral: Address }> {
  const faucetAddress = publicAddress(faucet) as Address;
  const collateralAddress = publicAddress(collateral) as Address;
  const underlying = (await reader.readContract({
    address: collateralAddress,
    abi: collateralSetupAbi,
    functionName: 'underlying',
  } as never)) as Address;
  if (underlying.toLowerCase() !== faucetAddress.toLowerCase())
    throw new Error('Canonical test-asset binding mismatch. No transaction was submitted.');
  return { faucet: faucetAddress, collateral: collateralAddress };
}

export async function readTestAssetState(
  provider: BrowserProvider,
  faucet: string,
  collateral: string,
): Promise<TestAssetState> {
  const { account, wallet } = await connectedSepoliaWallet(provider);
  const reader = createPublicClient({ chain: sepolia, transport: custom(provider) });
  const addresses = await verifyTestAssetBinding(reader, faucet, collateral);
  const [publicBalance, allowance, nativeBalance, encryptedBalance] = await Promise.all([
    reader.readContract({
      address: addresses.faucet,
      abi: testFaucetAbi,
      functionName: 'balanceOf',
      args: [account],
    } as never) as Promise<bigint>,
    reader.readContract({
      address: addresses.faucet,
      abi: testFaucetAbi,
      functionName: 'allowance',
      args: [account, addresses.collateral],
    } as never) as Promise<bigint>,
    reader.getBalance({ address: account }),
    reader.readContract({
      address: addresses.collateral,
      abi: collateralSetupAbi,
      functionName: 'confidentialBalanceOf',
      args: [account],
    } as never) as Promise<Hex>,
  ]);
  const handles = await createViemHandleClient(wallet);
  const decrypted = await handles.decrypt(encryptedBalance as never);
  return {
    account,
    publicBalance,
    allowance,
    confidentialBalance: decrypted.value as bigint,
    nativeBalance,
  };
}

export async function mintTestAsset(
  provider: BrowserProvider,
  faucet: string,
  collateral: string,
  amount: bigint,
): Promise<string> {
  if (amount <= 0n) throw new Error('Choose a test-token amount greater than zero.');
  const { account, wallet } = await connectedSepoliaWallet(provider);
  const reader = createPublicClient({ chain: sepolia, transport: custom(provider) });
  const { faucet: faucetAddress } = await verifyTestAssetBinding(reader, faucet, collateral);
  const transactionHash = await wallet.sendTransaction({
    account,
    chain: sepolia,
    to: faucetAddress,
    data: encodeFunctionData({
      abi: testFaucetAbi,
      functionName: 'mint',
      args: [account, amount],
    }),
  });
  await waitForConfirmedReceipt(reader, transactionHash);
  return transactionHash;
}

export async function approveTestAsset(
  provider: BrowserProvider,
  faucet: string,
  collateral: string,
  amount: bigint,
): Promise<string> {
  if (amount <= 0n) throw new Error('Choose an approval amount greater than zero.');
  const { account, wallet } = await connectedSepoliaWallet(provider);
  const reader = createPublicClient({ chain: sepolia, transport: custom(provider) });
  const addresses = await verifyTestAssetBinding(reader, faucet, collateral);
  const transactionHash = await wallet.sendTransaction({
    account,
    chain: sepolia,
    to: addresses.faucet,
    data: encodeFunctionData({
      abi: testFaucetAbi,
      functionName: 'approve',
      args: [addresses.collateral, amount],
    }),
  });
  await waitForConfirmedReceipt(reader, transactionHash);
  return transactionHash;
}

export async function wrapTestAsset(
  provider: BrowserProvider,
  faucet: string,
  collateral: string,
  amount: bigint,
): Promise<string> {
  if (amount <= 0n) throw new Error('Choose a wrapping amount greater than zero.');
  const { account, wallet } = await connectedSepoliaWallet(provider);
  const reader = createPublicClient({ chain: sepolia, transport: custom(provider) });
  const addresses = await verifyTestAssetBinding(reader, faucet, collateral);
  const [publicBalance, allowance] = await Promise.all([
    reader.readContract({
      address: addresses.faucet,
      abi: testFaucetAbi,
      functionName: 'balanceOf',
      args: [account],
    } as never) as Promise<bigint>,
    reader.readContract({
      address: addresses.faucet,
      abi: testFaucetAbi,
      functionName: 'allowance',
      args: [account, addresses.collateral],
    } as never) as Promise<bigint>,
  ]);
  if (publicBalance < amount)
    throw new Error('Your public test-token balance is too small. Mint more before wrapping.');
  if (allowance < amount)
    throw new Error('Approve this exact amount for the confidential wrapper before wrapping.');
  const transactionHash = await wallet.sendTransaction({
    account,
    chain: sepolia,
    to: addresses.collateral,
    data: encodeFunctionData({
      abi: collateralSetupAbi,
      functionName: 'wrap',
      args: [account, amount],
    }),
  });
  await waitForConfirmedReceipt(reader, transactionHash);
  return transactionHash;
}

export async function readPublicEpoch(pool: string): Promise<{
  state: number;
  deadline: bigint;
  observedAt: bigint;
  participantCount: number;
  publicYes: bigint;
  publicNo: bigint;
  kMin: number;
}> {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(SEPOLIA_PUBLIC_READ_RPC, { retryCount: 0, timeout: 10_000 }),
  });
  const publicReader = createViemProtocolPublicReader(client);
  const [epoch, block, config] = await Promise.all([
    publicReader.readEpoch(publicAddress(pool)),
    client.getBlock(),
    publicReader.readConfig(publicAddress(pool)),
  ]);
  return {
    state: epoch.state,
    deadline: epoch.deadline,
    observedAt: block.timestamp,
    participantCount: epoch.participantCount,
    publicYes: epoch.publicYes,
    publicNo: epoch.publicNo,
    kMin: config.kMin,
  };
}

export async function decryptOwnerPosition(
  provider: BrowserProvider,
  pool: string,
): Promise<{
  committed: boolean;
  claimed: boolean;
  refunded: boolean;
  stake: bigint;
  probabilityBps: bigint;
  scoreBps: bigint;
  scoreAvailable: boolean;
}> {
  const { account, wallet } = await connectedSepoliaWallet(provider);
  const reader = createPublicClient({ chain: sepolia, transport: custom(provider) });
  const position = (await reader.readContract({
    address: publicAddress(pool),
    account,
    abi: quietSignalPoolAbi,
    functionName: 'ownerPosition',
  } as never)) as {
    committed: boolean;
    claimed: boolean;
    refunded: boolean;
    stake: string;
    probabilityBps: string;
    scoreBps: string;
  };
  if (!position.committed)
    return {
      committed: false,
      claimed: false,
      refunded: false,
      stake: 0n,
      probabilityBps: 0n,
      scoreBps: 0n,
      scoreAvailable: false,
    };
  const nox = await createViemHandleClient(wallet);
  const [stake, probabilityBps] = await Promise.all([
    nox.decrypt(position.stake as never),
    nox.decrypt(position.probabilityBps as never),
  ]);
  const scoreAvailable = position.scoreBps !== `0x${'00'.repeat(32)}`;
  const scoreBps = scoreAvailable ? await nox.decrypt(position.scoreBps as never) : undefined;
  return {
    committed: true,
    claimed: position.claimed,
    refunded: position.refunded,
    stake: stake.value as bigint,
    probabilityBps: probabilityBps.value as bigint,
    scoreBps: (scoreBps?.value as bigint | undefined) ?? 0n,
    scoreAvailable,
  };
}

export async function submitOwnerTerminalAction(
  provider: BrowserProvider,
  pool: string,
  action: OwnerTerminalAction,
): Promise<string> {
  try {
    const { account, wallet } = await connectedSepoliaWallet(provider);
    const reader = createPublicClient({ chain: sepolia, transport: custom(provider) });
    const transactionHash = await wallet.sendTransaction({
      account,
      chain: sepolia,
      to: publicAddress(pool) as Address,
      data: encodeFunctionData({ abi: quietSignalPoolAbi, functionName: action }),
    });
    await waitForConfirmedReceipt(reader, transactionHash);
    return transactionHash;
  } catch {
    throw new Error(
      'The owner action was not confirmed. Read the public pool state before retrying; no application-controlled transfer occurred.',
    );
  }
}

export async function submitSignalJourney(
  provider: BrowserProvider,
  pool: string,
  expectedCollateral: string,
  values: ValidSignalDraft,
  reportProgress: (message: string) => void,
): Promise<SignalSubmission> {
  let stage: SignalJourneyStage = 'preparing';
  try {
    const { account, wallet } = await connectedSepoliaWallet(provider);
    const reader = createPublicClient({ chain: sepolia, transport: custom(provider) });
    const poolAddress = publicAddress(pool);
    const manifestCollateral = publicAddress(expectedCollateral);
    const config = await createViemProtocolPublicReader(reader).readConfig(poolAddress);
    if (config.confidentialCollateral.toLowerCase() !== manifestCollateral.toLowerCase())
      throw new SignalJourneyError(
        'Canonical collateral binding mismatch. No transaction was submitted; do not continue.',
        false,
      );
    const [epoch, block, encryptedBalance] = await Promise.all([
      createViemProtocolPublicReader(reader).readEpoch(poolAddress),
      reader.getBlock(),
      reader.readContract({
        address: manifestCollateral as Address,
        abi: collateralSetupAbi,
        functionName: 'confidentialBalanceOf',
        args: [account],
      } as never) as Promise<Hex>,
    ]);
    if (epoch.state !== 0 || block.timestamp >= epoch.deadline)
      throw new SignalJourneyError(
        'This market is no longer accepting signals. No encryption or transaction was submitted; read the public lifecycle for the safe next action.',
        false,
      );
    const handles = await createViemHandleClient(wallet);
    const balance = await handles.decrypt(encryptedBalance as never);
    if ((balance.value as bigint) < values.stakeBaseUnits)
      throw new SignalJourneyError(
        'Confidential collateral is insufficient for this signal. Mint, approve, and wrap more valueless test collateral before retrying.',
        false,
      );

    reportProgress(
      'Encrypting the signal locally. Your wallet will request the signal intent next.',
    );
    const nonce = crypto.getRandomValues(new Uint8Array(32));
    const request = requestId(
      `0x${Array.from(nonce, (byte) => byte.toString(16).padStart(2, '0')).join('')}`,
    );
    const context = { chainId: 11_155_111, pool: poolAddress, request };
    const nox = await createSepoliaConfidentialInputClient(wallet);
    const [stake, probability] = await Promise.all([
      nox.sealUint256(values.stakeBaseUnits, context),
      nox.sealUint256(values.probabilityBps, context),
    ]);
    const intent = await createSepoliaProtocolTransactionClient(wallet).then((transactions) =>
      transactions.sendCommit(prepareCommitSignal(stake, probability)),
    );
    stage = 'intent-submitted';
    reportProgress('Signal intent submitted. Waiting for its public Sepolia receipt.');
    await waitForConfirmedReceipt(reader, intent as Hex);
    stage = 'intent-confirmed';

    reportProgress(
      'Intent confirmed. Encrypting fresh collateral input for the immutable wrapper.',
    );
    const collateral = await handles.encryptInput(
      values.stakeBaseUnits,
      'uint256',
      config.confidentialCollateral as Address,
    );
    const callback = await wallet.sendTransaction({
      account,
      chain: sepolia,
      to: config.confidentialCollateral as Address,
      data: encodeFunctionData({
        abi: quietSignalCollateralAbi,
        functionName: 'confidentialTransferAndCall',
        args: [
          poolAddress as Address,
          collateral.handle as Hex,
          collateral.handleProof as Hex,
          '0x',
        ],
      }),
    });
    stage = 'callback-submitted';
    reportProgress(
      'Confidential collateral callback submitted. Waiting for its public Sepolia receipt.',
    );
    await waitForConfirmedReceipt(reader, callback);
    stage = 'callback-confirmed';

    reportProgress('Callback confirmed. Requesting the public acceptance proof for finalization.');
    const acceptanceHandle = (await reader.readContract({
      address: poolAddress as Address,
      abi: quietSignalPoolAbi,
      functionName: 'pendingAcceptanceHandle',
    } as never)) as Hex;
    const acceptance = await handles.publicDecrypt(acceptanceHandle as never);
    if (acceptance.value !== true)
      throw new SignalJourneyError(
        'The callback was not accepted. No finalization was submitted; read public pool state for the recovery path.',
        true,
      );
    const finalize = await wallet.sendTransaction({
      account,
      chain: sepolia,
      to: poolAddress as Address,
      data: encodeFunctionData({
        abi: quietSignalPoolAbi,
        functionName: 'finalizeCommit',
        args: [acceptance.decryptionProof as Hex],
      }),
    });
    stage = 'finalize-submitted';
    reportProgress('Finalization submitted. Waiting for its public Sepolia receipt.');
    await waitForConfirmedReceipt(reader, finalize);
    stage = 'complete';
    return {
      request,
      intentTransactionHash: intent,
      callbackTransactionHash: callback,
      finalizeTransactionHash: finalize,
    };
  } catch (error) {
    if (error instanceof SignalJourneyError) throw error;
    throw stageFailure(stage);
  }
}

export async function finalizePendingSignal(
  provider: BrowserProvider,
  pool: string,
  reportProgress: (message: string) => void,
): Promise<string> {
  try {
    const { account, wallet } = await connectedSepoliaWallet(provider);
    const reader = createPublicClient({ chain: sepolia, transport: custom(provider) });
    const poolAddress = publicAddress(pool);
    const handles = await createViemHandleClient(wallet);
    reportProgress(
      'Reading the public pending acceptance state. No new collateral transfer is requested.',
    );
    const acceptanceHandle = (await reader.readContract({
      address: poolAddress as Address,
      abi: quietSignalPoolAbi,
      functionName: 'pendingAcceptanceHandle',
    } as never)) as Hex;
    const acceptance = await handles.publicDecrypt(acceptanceHandle as never);
    if (acceptance.value !== true)
      throw new SignalJourneyError(
        'The pending callback is not accepted. No finalization was submitted; use the public pool recovery path.',
        false,
      );
    reportProgress(
      'Acceptance proof is available. Requesting permissionless finalization from your wallet.',
    );
    const transactionHash = await wallet.sendTransaction({
      account,
      chain: sepolia,
      to: poolAddress as Address,
      data: encodeFunctionData({
        abi: quietSignalPoolAbi,
        functionName: 'finalizeCommit',
        args: [acceptance.decryptionProof as Hex],
      }),
    });
    reportProgress('Finalization submitted. Waiting for its public Sepolia receipt.');
    await waitForConfirmedReceipt(reader, transactionHash);
    return transactionHash;
  } catch (error) {
    if (error instanceof SignalJourneyError) throw error;
    throw new SignalJourneyError(
      'Pending finalization is unavailable. No new collateral transfer was requested; read public pool state before retrying.',
      true,
    );
  }
}
