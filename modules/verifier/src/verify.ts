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

const FACTORY_ABI = [
  {
    type: 'function',
    name: 'poolIdFor',
    stateMutability: 'view',
    inputs: [
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
      { type: 'bytes32' },
    ],
    outputs: [{ type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'poolOf',
    stateMutability: 'view',
    inputs: [{ type: 'bytes32' }],
    outputs: [{ type: 'address' }],
  },
] as const satisfies Abi;

const ERC165_ABI = [
  {
    type: 'function',
    name: 'supportsInterface',
    stateMutability: 'view',
    inputs: [{ type: 'bytes4' }],
    outputs: [{ type: 'bool' }],
  },
] as const satisfies Abi;

const ADAPTER_ABI = [
  {
    type: 'function',
    name: 'target',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'targetRuntimeCodeHash',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'greaterOrEqual',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'threshold',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'int256' }],
  },
  {
    type: 'function',
    name: 'observationNotBefore',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'maximumFeedAge',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const satisfies Abi;

const FEED_ABI = [
  {
    type: 'function',
    name: 'latestRoundData',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { type: 'uint80' },
      { type: 'int256' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint80' },
    ],
  },
] as const satisfies Abi;

export const IERC7984_INTERFACE_ID = '0x4958f2a4' as const;

export interface ReadOnlyClient {
  getChainId(): Promise<number>;
  getCode(parameters: { address: Address }): Promise<Hex | undefined>;
  getTransactionReceipt(parameters: { hash: Hash }): Promise<{ status: string }>;
  readContract(parameters: unknown): Promise<unknown>;
  getBlockNumber(): Promise<bigint>;
}

export interface ReleaseReadOnlyClient extends ReadOnlyClient {
  getBalance(parameters: { address: Address }): Promise<bigint>;
  getBlock(): Promise<{ timestamp: bigint }>;
}

export interface VerificationReport {
  schemaVersion: 1;
  chainId: number;
  verificationBlock: string;
  epochVerificationBlock: string | null;
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

export interface ReleaseVerificationReport extends VerificationReport {
  checks: VerificationReport['checks'] & {
    factoryPoolBinding: true;
    collateralInterface: true;
    adapterConfiguration: true;
    feedRuntimeAndRound: true;
    adapterZeroNativeCustody: true;
  };
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

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(`${path} is not boolean.`);
  return value;
}

function hash(value: unknown, path: string): Hash {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/i.test(value)) fail(`${path} is not hash.`);
  return value as Hash;
}

function tuple(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length !== 5) fail(`${path} is malformed.`);
  return value;
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
        client.readContract(
          manifest.epochVerificationBlock === undefined
            ? { address: pool.address, abi: POOL_ABI, functionName: 'epoch' }
            : {
                address: pool.address,
                abi: POOL_ABI,
                functionName: 'epoch',
                blockNumber: manifest.epochVerificationBlock,
              },
        ),
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
    epochVerificationBlock: manifest.epochVerificationBlock?.toString() ?? null,
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

export async function verifyReleaseManifest(
  client: ReleaseReadOnlyClient,
  manifest: ProtocolManifest,
): Promise<ReleaseVerificationReport> {
  const deployment = manifest.canonicalDeployment;
  if (!deployment) fail('The manifest has no canonical DEP-01 configuration.');
  const contracts = new Map(manifest.contracts.map((item) => [item.id, item]));
  const fixture = contracts.get('fixture');
  const wrapper = contracts.get('wrapper');
  const adapter = contracts.get('adapter');
  const factory = contracts.get('factory');
  const pool = contracts.get('pool');
  if (!fixture || !wrapper || !adapter || !factory || !pool || manifest.pools.length !== 1) {
    fail('Canonical manifest contract bindings are incomplete.');
  }
  const poolBinding = manifest.pools[0];
  if (
    !poolBinding ||
    poolBinding.contractId !== 'pool' ||
    poolBinding.address.toLowerCase() !== pool.address.toLowerCase()
  ) {
    fail('Canonical manifest pool binding is malformed.');
  }
  const baseline = await verifyManifest(client, manifest);
  const configRaw = await client.readContract({
    address: pool.address,
    abi: POOL_ABI,
    functionName: 'config',
  });
  const config = record(configRaw, 'pool.config');
  const [
    expectedPoolId,
    factoryPool,
    collateralInterface,
    adapterFacts,
    feedRuntime,
    feedRound,
    adapterBalance,
    latestBlock,
  ] = await Promise.all([
    client.readContract({
      address: factory.address,
      abi: FACTORY_ABI,
      functionName: 'poolIdFor',
      args: [config, deployment.deploymentSalt],
    }),
    client.readContract({
      address: factory.address,
      abi: FACTORY_ABI,
      functionName: 'poolOf',
      args: [deployment.poolId],
    }),
    client.readContract({
      address: wrapper.address,
      abi: ERC165_ABI,
      functionName: 'supportsInterface',
      args: [IERC7984_INTERFACE_ID],
    }),
    Promise.all([
      client.readContract({ address: adapter.address, abi: ADAPTER_ABI, functionName: 'target' }),
      client.readContract({
        address: adapter.address,
        abi: ADAPTER_ABI,
        functionName: 'targetRuntimeCodeHash',
      }),
      client.readContract({
        address: adapter.address,
        abi: ADAPTER_ABI,
        functionName: 'greaterOrEqual',
      }),
      client.readContract({
        address: adapter.address,
        abi: ADAPTER_ABI,
        functionName: 'threshold',
      }),
      client.readContract({
        address: adapter.address,
        abi: ADAPTER_ABI,
        functionName: 'observationNotBefore',
      }),
      client.readContract({
        address: adapter.address,
        abi: ADAPTER_ABI,
        functionName: 'maximumFeedAge',
      }),
    ]),
    client.getCode({ address: deployment.feed }),
    client.readContract({
      address: deployment.feed,
      abi: FEED_ABI,
      functionName: 'latestRoundData',
    }),
    client.getBalance({ address: adapter.address }),
    client.getBlock(),
  ]);
  const adapterTarget = address(adapterFacts[0], 'adapter.target');
  const adapterTargetHash = hash(adapterFacts[1], 'adapter.targetRuntimeCodeHash');
  const adapterDirection = boolean(adapterFacts[2], 'adapter.greaterOrEqual');
  const adapterThreshold = bigint(adapterFacts[3], 'adapter.threshold');
  const adapterObservation = bigint(adapterFacts[4], 'adapter.observationNotBefore');
  const adapterMaximumAge = bigint(adapterFacts[5], 'adapter.maximumFeedAge');
  const [roundId, answer, startedAt, updatedAt, answeredInRound] = tuple(
    feedRound,
    'feed.latestRoundData',
  );
  if (
    address(config.confidentialCollateral, 'pool.config.confidentialCollateral').toLowerCase() !==
      wrapper.address.toLowerCase() ||
    address(config.resolutionAdapter, 'pool.config.resolutionAdapter').toLowerCase() !==
      adapter.address.toLowerCase()
  ) {
    fail('Canonical pool configuration does not bind the canonical wrapper and adapter.');
  }
  if (
    hash(expectedPoolId, 'factory.poolIdFor').toLowerCase() !== deployment.poolId.toLowerCase() ||
    address(factoryPool, 'factory.poolOf').toLowerCase() !== pool.address.toLowerCase()
  ) {
    fail('Canonical factory pool binding does not match the manifest.');
  }
  if (!boolean(collateralInterface, 'collateral.supportsInterface')) {
    fail('Canonical collateral does not support IERC7984.');
  }
  if (
    adapterTarget.toLowerCase() !== deployment.feed.toLowerCase() ||
    adapterTargetHash.toLowerCase() !== deployment.feedRuntimeCodeHash.toLowerCase() ||
    adapterDirection !== (deployment.comparison === 'greater-or-equal') ||
    adapterThreshold !== deployment.threshold ||
    adapterObservation !== deployment.observationNotBefore ||
    adapterMaximumAge !== deployment.maximumFeedAgeSeconds
  ) {
    fail('Canonical adapter configuration does not match the manifest.');
  }
  if (
    !feedRuntime ||
    feedRuntime === '0x' ||
    keccak256(feedRuntime).toLowerCase() !== deployment.feedRuntimeCodeHash.toLowerCase()
  ) {
    fail('Canonical feed runtime does not match the manifest.');
  }
  if (
    bigint(roundId, 'feed.roundId') === 0n ||
    bigint(answer, 'feed.answer') <= 0n ||
    bigint(startedAt, 'feed.startedAt') === 0n ||
    bigint(updatedAt, 'feed.updatedAt') === 0n ||
    bigint(updatedAt, 'feed.updatedAt') > latestBlock.timestamp ||
    bigint(answeredInRound, 'feed.answeredInRound') < bigint(roundId, 'feed.roundId') ||
    latestBlock.timestamp - bigint(updatedAt, 'feed.updatedAt') > deployment.maximumFeedAgeSeconds
  ) {
    fail('Canonical feed latest round is invalid or stale.');
  }
  if (adapterBalance !== 0n) fail('Canonical adapter unexpectedly holds native currency.');
  return {
    ...baseline,
    checks: {
      ...baseline.checks,
      factoryPoolBinding: true,
      collateralInterface: true,
      adapterConfiguration: true,
      feedRuntimeAndRound: true,
      adapterZeroNativeCustody: true,
    },
    status: 'passed',
  };
}
