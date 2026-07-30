import { createViemHandleClient } from '@iexec-nox/handle';
import {
  createPublicClient,
  encodeFunctionData,
  http,
  isAddress,
  isHex,
  type Abi,
  type Address,
  type Hex,
  type WalletClient,
} from 'viem';
import { sepolia } from 'viem/chains';

import {
  selectPermissionlessAction,
  type PermissionlessAction,
  type PublicEpochState,
} from './policy.js';

export const SEPOLIA_CHAIN_ID = 11_155_111;

const POOL_ABI = [
  {
    type: 'function',
    name: 'epoch',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
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
  {
    type: 'function',
    name: 'pendingCommit',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }, { type: 'uint64' }, { type: 'bool' }],
  },
  {
    type: 'function',
    name: 'expirePendingCommit',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  { type: 'function', name: 'closeEpoch', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  {
    type: 'function',
    name: 'requestAggregateDecrypt',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [{ type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'aggregateDisclosureHandles',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bytes32' }, { type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'finalizeAggregate',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'bytes32' }, { type: 'bytes' }, { type: 'bytes' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancelBeforeResolution',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  { type: 'function', name: 'settle', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  {
    type: 'function',
    name: 'cancelAfterResolutionGrace',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
] as const satisfies Abi;

const ADAPTER_ABI = [
  {
    type: 'function',
    name: 'observationNotBefore',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const satisfies Abi;

export interface PublicPoolSnapshot {
  pool: Address;
  blockNumber: bigint;
  timestamp: bigint;
  epoch: PublicEpochState;
  pendingAvailableAt: bigint;
  aggregateTimeout: bigint;
  resolutionGrace: bigint;
  observationNotBefore: bigint;
}

export interface PublicAggregateGateway {
  publicDecrypt(input: Hex): Promise<{ attestation: Hex }>;
}

export interface PublicAggregateAttestations {
  readonly yes: Hex;
  readonly no: Hex;
}

function fail(message: string): never {
  throw new Error(`Automation runner failed: ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} is malformed.`);
  return value as Record<string, unknown>;
}

function bigint(value: unknown, path: string): bigint {
  if (typeof value !== 'bigint') fail(`${path} is malformed.`);
  return value;
}

function number(value: unknown, path: string): number {
  if (typeof value !== 'number') fail(`${path} is malformed.`);
  return value;
}

function hash(value: unknown, path: string): `0x${string}` {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/i.test(value)) fail(`${path} is malformed.`);
  return value as `0x${string}`;
}

function attestation(value: unknown, path: string): Hex {
  if (typeof value !== 'string' || !isHex(value) || value.length <= 2)
    fail(`${path} is malformed.`);
  return value as Hex;
}

function pendingAvailableAt(value: unknown): bigint {
  if (!Array.isArray(value) || typeof value[1] !== 'bigint') fail('pendingCommit is malformed.');
  return value[1];
}

export function createSepoliaReadClient(rpcUrl: string) {
  return createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
  });
}

export async function readPublicPoolSnapshot(
  client: ReturnType<typeof createSepoliaReadClient>,
  pool: Address,
): Promise<PublicPoolSnapshot> {
  if ((await client.getChainId()) !== SEPOLIA_CHAIN_ID)
    fail('the configured RPC is not Ethereum Sepolia.');
  const runtime = await client.getCode({ address: pool });
  if (!runtime || runtime === '0x') fail('the requested pool has no runtime code.');
  const [block, epochRaw, configRaw, pendingRaw] = await Promise.all([
    client.getBlock(),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: 'epoch' }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: 'config' }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: 'pendingCommit' }),
  ]);
  const epoch = record(epochRaw, 'epoch');
  const config = record(configRaw, 'config');
  const adapter = config.resolutionAdapter;
  if (!isAddress(adapter)) fail('pool configuration has no valid adapter address.');
  const observationNotBefore = await client.readContract({
    address: adapter,
    abi: ADAPTER_ABI,
    functionName: 'observationNotBefore',
  });
  return {
    pool,
    blockNumber: block.number,
    timestamp: block.timestamp,
    epoch: {
      state: number(epoch.state, 'epoch.state') as PublicEpochState['state'],
      deadline: bigint(epoch.deadline, 'epoch.deadline'),
      aggregateRequestId: hash(epoch.aggregateRequestId, 'epoch.aggregateRequestId'),
      aggregatePendingAt: bigint(epoch.aggregatePendingAt, 'epoch.aggregatePendingAt'),
      resolutionPendingAt: bigint(epoch.resolutionPendingAt, 'epoch.resolutionPendingAt'),
    },
    pendingAvailableAt: pendingAvailableAt(pendingRaw),
    aggregateTimeout: bigint(config.aggregateTimeout, 'config.aggregateTimeout'),
    resolutionGrace: bigint(config.resolutionGrace, 'config.resolutionGrace'),
    observationNotBefore: bigint(observationNotBefore, 'adapter.observationNotBefore'),
  };
}

export function selectPublicPoolAction(
  snapshot: PublicPoolSnapshot,
  aggregateResultAvailable = false,
): PermissionlessAction | undefined {
  return selectPermissionlessAction({
    now: snapshot.timestamp,
    epoch: snapshot.epoch,
    timing: {
      pendingAvailableAt: snapshot.pendingAvailableAt,
      aggregateTimeout: snapshot.aggregateTimeout,
      resolutionGrace: snapshot.resolutionGrace,
      observationNotBefore: snapshot.observationNotBefore,
    },
    readiness: { aggregateResultAvailable },
  });
}

export async function createPublicAggregateGateway(
  wallet: WalletClient,
): Promise<PublicAggregateGateway> {
  const client = await createViemHandleClient(wallet);
  return {
    async publicDecrypt(input: Hex): Promise<{ attestation: Hex }> {
      const result = await client.publicDecrypt(input);
      return { attestation: attestation(result.decryptionProof, 'public aggregate attestation') };
    },
  };
}

export async function readPublicAggregateAttestations(
  client: ReturnType<typeof createSepoliaReadClient>,
  pool: Address,
  requestId: Hex,
  gateway: PublicAggregateGateway,
): Promise<PublicAggregateAttestations> {
  const raw = await client.readContract({
    address: pool,
    abi: POOL_ABI,
    functionName: 'aggregateDisclosureHandles',
  });
  if (!Array.isArray(raw) || raw.length !== 2) fail('aggregate disclosure response is malformed.');
  const [yes, no] = await Promise.all([
    gateway.publicDecrypt(hash(raw[0], 'aggregate yes input')),
    gateway.publicDecrypt(hash(raw[1], 'aggregate no input')),
  ]);
  if (!/^0x[0-9a-f]{64}$/i.test(requestId)) fail('aggregate request id is malformed.');
  return {
    yes: attestation(yes.attestation, 'aggregate yes attestation'),
    no: attestation(no.attestation, 'aggregate no attestation'),
  };
}

export function encodePermissionlessAction(
  action: Exclude<PermissionlessAction, { kind: 'finalize-aggregate' }>,
): Hex {
  if ((action as PermissionlessAction).kind === 'finalize-aggregate') {
    fail('aggregate finalization requires the separately verified public-result boundary.');
  }
  const functionName = {
    'expire-pending-commit': 'expirePendingCommit',
    'close-epoch': 'closeEpoch',
    'request-aggregate-decrypt': 'requestAggregateDecrypt',
    'cancel-before-resolution': 'cancelBeforeResolution',
    settle: 'settle',
    'cancel-after-resolution-grace': 'cancelAfterResolutionGrace',
  }[action.kind];
  return encodeFunctionData({ abi: POOL_ABI, functionName } as never);
}

export function encodePublicAggregateFinalization(
  action: Extract<PermissionlessAction, { kind: 'finalize-aggregate' }>,
  values: PublicAggregateAttestations,
): Hex {
  return encodeFunctionData({
    abi: POOL_ABI,
    functionName: 'finalizeAggregate',
    args: [action.requestId, values.yes, values.no],
  });
}

export function publicActionReport(
  snapshot: PublicPoolSnapshot,
  action: PermissionlessAction | undefined,
): Record<string, string | null> {
  return {
    pool: snapshot.pool,
    blockNumber: snapshot.blockNumber.toString(),
    state: snapshot.epoch.state.toString(),
    action: action?.kind ?? null,
  };
}
