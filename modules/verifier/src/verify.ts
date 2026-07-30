import { keccak256, type Abi, type Address, type Hash, type Hex } from 'viem';

import { type EpochExpectation, type ProtocolManifest } from './manifest.js';

const POOL_ABI = [
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
] as const satisfies Abi;

export interface ReadOnlyClient {
  getChainId(): Promise<number>;
  getCode(parameters: { address: Address }): Promise<Hex | undefined>;
  getTransactionReceipt(parameters: { hash: Hash }): Promise<{ status: string }>;
  readContract(parameters: unknown): Promise<unknown>;
  getBlockNumber(): Promise<bigint>;
}

export interface VerificationReport {
  schemaVersion: 1;
  chainId: number;
  verificationBlock: string;
  contractCount: number;
  poolCount: number;
  receiptCount: number;
  checks: {
    runtimeCodeHashes: true;
    immutablePoolBindings: true;
    publicEpochFacts: true;
    receiptStatuses: true;
  };
  status: 'passed';
}

function fail(message: string): never {
  throw new Error(`Protocol verification failed: ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} is malformed.`);
  return value as Record<string, unknown>;
}

function bigint(value: unknown, path: string): bigint {
  if (typeof value !== 'bigint') fail(`${path} is not bigint.`);
  return value;
}

function number(value: unknown, path: string): number {
  if (typeof value !== 'number') fail(`${path} is not number.`);
  return value;
}

function address(value: unknown, path: string): Address {
  if (typeof value !== 'string') fail(`${path} is not an address.`);
  return value as Address;
}

function matchesEpoch(actual: Record<string, unknown>, expected: EpochExpectation): boolean {
  return (
    number(actual.state, 'epoch.state') === expected.state &&
    number(actual.winner, 'epoch.winner') === expected.winner &&
    number(actual.participantCount, 'epoch.participantCount') === expected.participantCount &&
    bigint(actual.publicYes, 'epoch.publicYes').toString() === expected.publicYes &&
    bigint(actual.publicNo, 'epoch.publicNo').toString() === expected.publicNo &&
    bigint(actual.settledRoundId, 'epoch.settledRoundId').toString() === expected.settledRoundId &&
    bigint(actual.settledAnswer, 'epoch.settledAnswer').toString() === expected.settledAnswer
  );
}

export async function verifyManifest(
  client: ReadOnlyClient,
  manifest: ProtocolManifest,
): Promise<VerificationReport> {
  if ((await client.getChainId()) !== manifest.chainId)
    fail('RPC chain id does not match manifest.');
  await Promise.all(
    manifest.contracts.map(async (binding) => {
      const runtime = await client.getCode({ address: binding.address });
      if (!runtime || runtime === '0x') fail(`Missing runtime at ${binding.id}.`);
      if (keccak256(runtime).toLowerCase() !== binding.runtimeCodeHash.toLowerCase())
        fail(`Runtime code hash mismatch at ${binding.id}.`);
    }),
  );
  await Promise.all(
    manifest.pools.map(async (pool) => {
      const [configRaw, epochRaw] = await Promise.all([
        client.readContract({ address: pool.address, abi: POOL_ABI, functionName: 'config' }),
        client.readContract({ address: pool.address, abi: POOL_ABI, functionName: 'epoch' }),
      ]);
      const config = record(configRaw, `${pool.contractId}.config`);
      if (
        address(config.confidentialCollateral, 'config.confidentialCollateral').toLowerCase() !==
          pool.confidentialCollateral.toLowerCase() ||
        address(config.resolutionAdapter, 'config.resolutionAdapter').toLowerCase() !==
          pool.resolutionAdapter.toLowerCase()
      ) {
        fail(`Immutable pool binding mismatch at ${pool.contractId}.`);
      }
      if (!matchesEpoch(record(epochRaw, `${pool.contractId}.epoch`), pool.epoch))
        fail(`Public epoch mismatch at ${pool.contractId}.`);
    }),
  );
  const receipts = await Promise.all(
    manifest.receipts.map((receipt) =>
      client.getTransactionReceipt({ hash: receipt.transactionHash }),
    ),
  );
  if (receipts.some((receipt) => receipt.status !== 'success')) fail('A manifest receipt failed.');
  return {
    schemaVersion: 1,
    chainId: manifest.chainId,
    verificationBlock: (await client.getBlockNumber()).toString(),
    contractCount: manifest.contracts.length,
    poolCount: manifest.pools.length,
    receiptCount: manifest.receipts.length,
    checks: {
      runtimeCodeHashes: true,
      immutablePoolBindings: true,
      publicEpochFacts: true,
      receiptStatuses: true,
    },
    status: 'passed',
  };
}
