import {
  encodeFunctionData,
  keccak256,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';

import {
  contractEncryptedInput,
  type EncryptionContext,
  type SealedUint256,
} from './confidential.js';
import {
  publicAddress,
  requestId,
  type PublicAddress,
  type RequestId,
  type TransactionHash,
} from './public.js';

const SEPOLIA_CHAIN_ID = 11_155_111;

export const quietSignalPoolAbi = [
  {
    type: 'function',
    name: 'commitSignal',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'encryptedStake', type: 'bytes32' },
      { name: 'stakeProof', type: 'bytes' },
      { name: 'encryptedProbabilityBps', type: 'bytes32' },
      { name: 'probabilityProof', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'epoch',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'state', type: 'uint8' },
          { name: 'winner', type: 'uint8' },
          { name: 'deadline', type: 'uint64' },
          { name: 'participantCount', type: 'uint32' },
          { name: 'aggregateRequestId', type: 'bytes32' },
          { name: 'aggregatePendingAt', type: 'uint64' },
          { name: 'resolutionPendingAt', type: 'uint64' },
          { name: 'publicYes', type: 'uint256' },
          { name: 'publicNo', type: 'uint256' },
          { name: 'settledRoundId', type: 'uint80' },
          { name: 'settledAnswer', type: 'int256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'config',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'confidentialCollateral', type: 'address' },
          { name: 'resolutionAdapter', type: 'address' },
          { name: 'deadline', type: 'uint64' },
          { name: 'commitTimeout', type: 'uint64' },
          { name: 'kMin', type: 'uint32' },
          { name: 'aggregateTimeout', type: 'uint64' },
          { name: 'resolutionGrace', type: 'uint64' },
        ],
      },
    ],
  },
] as const;

export interface PublicEpoch {
  readonly state: number;
  readonly winner: number;
  readonly deadline: bigint;
  readonly participantCount: number;
  readonly aggregateRequestId: RequestId;
  readonly aggregatePendingAt: bigint;
  readonly resolutionPendingAt: bigint;
  readonly publicYes: bigint;
  readonly publicNo: bigint;
  readonly settledRoundId: bigint;
  readonly settledAnswer: bigint;
}

export interface PublicPoolConfig {
  readonly confidentialCollateral: PublicAddress;
  readonly resolutionAdapter: PublicAddress;
  readonly deadline: bigint;
  readonly commitTimeout: bigint;
  readonly kMin: number;
  readonly aggregateTimeout: bigint;
  readonly resolutionGrace: bigint;
}

export interface ProtocolPublicReader {
  readEpoch(pool: PublicAddress): Promise<PublicEpoch>;
  readConfig(pool: PublicAddress): Promise<PublicPoolConfig>;
}

export interface ProtocolTransactionSender {
  sendTransaction(input: { to: Address; data: Hex }): Promise<Hex>;
}

interface RawPreparedTransaction {
  pool: Address;
  data: Hex;
  fingerprint: Hex;
}

interface Operation {
  fingerprint: Hex;
  hash: Promise<TransactionHash>;
}

const rawTransactions = new WeakMap<PreparedCommit, RawPreparedTransaction>();

function fail(message: string): never {
  throw new Error(`Protocol client rejected: ${message}`);
}

function requireNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail(`${name} is not a public unsigned integer.`);
  return value;
}

function requireBigint(value: unknown, name: string): bigint {
  if (typeof value !== 'bigint') fail(`${name} is not a public bigint.`);
  return value;
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} is malformed.`);
  return value as Record<string, unknown>;
}

function contextOf(stake: SealedUint256, probability: SealedUint256): EncryptionContext {
  const stakeContext = stake.context;
  const probabilityContext = probability.context;
  if (
    stakeContext.chainId !== SEPOLIA_CHAIN_ID ||
    stakeContext.chainId !== probabilityContext.chainId ||
    stakeContext.pool !== probabilityContext.pool ||
    stakeContext.request !== probabilityContext.request
  ) {
    fail('sealed commit inputs must share one Sepolia pool and request context.');
  }
  return stakeContext;
}

export class PreparedCommit {
  readonly context: EncryptionContext;

  private constructor(context: EncryptionContext, raw: RawPreparedTransaction) {
    this.context = context;
    rawTransactions.set(this, raw);
  }

  static create(context: EncryptionContext, raw: RawPreparedTransaction): PreparedCommit {
    return new PreparedCommit(context, raw);
  }

  toJSON(): never {
    fail('prepared confidential transaction cannot be serialized.');
  }
}

export function prepareCommitSignal(
  encryptedStake: SealedUint256,
  encryptedProbabilityBps: SealedUint256,
): PreparedCommit {
  const context = contextOf(encryptedStake, encryptedProbabilityBps);
  const stake = contractEncryptedInput(encryptedStake, context);
  const probability = contractEncryptedInput(encryptedProbabilityBps, context);
  const data = encodeFunctionData({
    abi: quietSignalPoolAbi,
    functionName: 'commitSignal',
    args: [stake.handle, stake.handleProof, probability.handle, probability.handleProof],
  });
  return PreparedCommit.create(context, {
    pool: context.pool as Address,
    data,
    fingerprint: keccak256(data),
  });
}

export class ProtocolTransactionClient {
  private readonly operations = new Map<RequestId, Operation>();

  constructor(
    readonly chainId: number,
    private readonly sender: ProtocolTransactionSender,
  ) {
    if (chainId !== SEPOLIA_CHAIN_ID)
      fail(`the transaction client must target Ethereum Sepolia (${SEPOLIA_CHAIN_ID}).`);
  }

  sendCommit(prepared: PreparedCommit): Promise<TransactionHash> {
    const raw = rawTransactions.get(prepared);
    if (!raw) fail('prepared transaction is unavailable.');
    if (prepared.context.chainId !== this.chainId)
      fail('prepared transaction targets another chain.');
    const existing = this.operations.get(prepared.context.request);
    if (existing) {
      if (existing.fingerprint !== raw.fingerprint)
        fail('request ID is already bound to another operation.');
      return existing.hash;
    }
    const hash = this.sender
      .sendTransaction({ to: raw.pool, data: raw.data })
      .then((value) => value.toLowerCase() as TransactionHash)
      .catch(() => fail('wallet submission failed; inspect public chain state before retrying.'));
    this.operations.set(prepared.context.request, { fingerprint: raw.fingerprint, hash });
    return hash;
  }
}

export function createViemProtocolPublicReader(client: PublicClient): ProtocolPublicReader {
  return {
    async readEpoch(pool: PublicAddress): Promise<PublicEpoch> {
      const value = record(
        await client.readContract({
          address: pool as Address,
          abi: quietSignalPoolAbi,
          functionName: 'epoch',
        } as never),
        'epoch',
      );
      return {
        state: requireNumber(value.state, 'epoch state'),
        winner: requireNumber(value.winner, 'epoch winner'),
        deadline: requireBigint(value.deadline, 'epoch deadline'),
        participantCount: requireNumber(value.participantCount, 'epoch participant count'),
        aggregateRequestId: requestId(value.aggregateRequestId),
        aggregatePendingAt: requireBigint(value.aggregatePendingAt, 'aggregate pending timestamp'),
        resolutionPendingAt: requireBigint(
          value.resolutionPendingAt,
          'resolution pending timestamp',
        ),
        publicYes: requireBigint(value.publicYes, 'public yes aggregate'),
        publicNo: requireBigint(value.publicNo, 'public no aggregate'),
        settledRoundId: requireBigint(value.settledRoundId, 'settled round'),
        settledAnswer: requireBigint(value.settledAnswer, 'settled answer'),
      };
    },
    async readConfig(pool: PublicAddress): Promise<PublicPoolConfig> {
      const value = record(
        await client.readContract({
          address: pool as Address,
          abi: quietSignalPoolAbi,
          functionName: 'config',
        } as never),
        'pool config',
      );
      return {
        confidentialCollateral: publicAddress(value.confidentialCollateral),
        resolutionAdapter: publicAddress(value.resolutionAdapter),
        deadline: requireBigint(value.deadline, 'config deadline'),
        commitTimeout: requireBigint(value.commitTimeout, 'config commit timeout'),
        kMin: requireNumber(value.kMin, 'config k minimum'),
        aggregateTimeout: requireBigint(value.aggregateTimeout, 'config aggregate timeout'),
        resolutionGrace: requireBigint(value.resolutionGrace, 'config resolution grace'),
      };
    },
  };
}

export async function createSepoliaProtocolTransactionClient(
  wallet: WalletClient,
): Promise<ProtocolTransactionClient> {
  const chainId = await wallet.getChainId();
  const account = wallet.account;
  if (!account) fail('the connected wallet account is required.');
  return new ProtocolTransactionClient(chainId, {
    sendTransaction: ({ to, data }) =>
      wallet.sendTransaction({ account, chain: wallet.chain, to, data }),
  });
}
