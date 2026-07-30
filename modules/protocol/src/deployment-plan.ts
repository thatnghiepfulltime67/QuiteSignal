import {
  encodeAbiParameters,
  encodeDeployData,
  getContractAddress,
  getCreate2Address,
  keccak256,
  toHex,
  type Abi,
  type Address,
  type Hex,
} from 'viem';

export const SEPOLIA_CHAIN_ID = 11_155_111;
export const CHAINLINK_ETH_USD_SEPOLIA = '0x694AA1769357215DE4FAC081bf1f309aDC325306' as const;
export const CANONICAL_OBSERVATION_LEAD_SECONDS = 2_100n;
export const CANONICAL_COMMIT_WINDOW_SECONDS = 1_500n;
// A pool is created only after its factory exists, so the read-only plan cannot
// estimate it at the predicted canonical factory address. This conservative bound
// is checked against the committed budget before any write and against the live
// estimate immediately before the factory call.
export const CANONICAL_POOL_CREATE_GAS_LIMIT = 5_000_000n;

export interface DeploymentArtifact {
  abi: Abi;
  bytecode: Hex;
}

export interface DeploymentArtifacts {
  fixture: DeploymentArtifact;
  wrapper: DeploymentArtifact;
  adapter: DeploymentArtifact;
  factory: DeploymentArtifact;
  pool: DeploymentArtifact;
}

export interface CanonicalPoolConfig {
  confidentialCollateral: Address;
  resolutionAdapter: Address;
  deadline: bigint;
  commitTimeout: bigint;
  kMin: number;
  aggregateTimeout: bigint;
  resolutionGrace: bigint;
}

export interface CanonicalDeploymentPlan {
  chainId: number;
  deployer: Address;
  startingNonce: bigint;
  feed: Address;
  threshold: bigint;
  greaterOrEqual: boolean;
  observationNotBefore: bigint;
  maximumFeedAge: bigint;
  poolConfig: CanonicalPoolConfig;
  deploymentSalt: Hex;
  poolId: Hex;
  actions: ReadonlyArray<{ id: string; nonce?: bigint; address: Address; data: Hex }>;
}

function fail(message: string): never {
  throw new Error(`Invalid canonical deployment plan: ${message}`);
}

function predictedCreateAddress(deployer: Address, nonce: bigint): Address {
  return getContractAddress({ from: deployer, nonce });
}

export function buildCanonicalDeploymentPlan(input: {
  deployer: Address;
  startingNonce: bigint;
  timestamp: bigint;
  threshold: bigint;
  artifacts: DeploymentArtifacts;
  feed?: Address;
  greaterOrEqual?: boolean;
  maximumFeedAge?: bigint;
}): CanonicalDeploymentPlan {
  if (input.timestamp <= 0n || input.threshold <= 0n)
    fail('timestamp and threshold must be positive.');
  if (input.startingNonce < 0n) fail('starting nonce cannot be negative.');
  const feed = input.feed ?? CHAINLINK_ETH_USD_SEPOLIA;
  const greaterOrEqual = input.greaterOrEqual ?? true;
  const maximumFeedAge = input.maximumFeedAge ?? 86_400n;
  if (maximumFeedAge === 0n) fail('maximum feed age must be positive.');
  const fixture = predictedCreateAddress(input.deployer, input.startingNonce);
  const wrapper = predictedCreateAddress(input.deployer, input.startingNonce + 1n);
  const adapter = predictedCreateAddress(input.deployer, input.startingNonce + 2n);
  const factory = predictedCreateAddress(input.deployer, input.startingNonce + 3n);
  const observationNotBefore = input.timestamp + CANONICAL_OBSERVATION_LEAD_SECONDS;
  const poolConfig: CanonicalPoolConfig = {
    confidentialCollateral: wrapper,
    resolutionAdapter: adapter,
    deadline:
      observationNotBefore - (CANONICAL_OBSERVATION_LEAD_SECONDS - CANONICAL_COMMIT_WINDOW_SECONDS),
    commitTimeout: 60n,
    kMin: 2,
    aggregateTimeout: 600n,
    resolutionGrace: 600n,
  };
  const deploymentSalt = keccak256(toHex('quitesignal/canonical-sepolia/v1'));
  const configHash = keccak256(
    encodeAbiParameters(
      [
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
      [poolConfig],
    ),
  );
  const poolId = keccak256(
    encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }, { type: 'bytes32' }],
      [BigInt(SEPOLIA_CHAIN_ID), factory, configHash, deploymentSalt],
    ),
  );
  const fixtureData = encodeDeployData({
    abi: input.artifacts.fixture.abi,
    bytecode: input.artifacts.fixture.bytecode,
  });
  const wrapperData = encodeDeployData({
    abi: input.artifacts.wrapper.abi,
    bytecode: input.artifacts.wrapper.bytecode,
    args: [fixture],
  });
  const adapterData = encodeDeployData({
    abi: input.artifacts.adapter.abi,
    bytecode: input.artifacts.adapter.bytecode,
    args: [feed, greaterOrEqual, input.threshold, observationNotBefore, maximumFeedAge],
  });
  const factoryData = encodeDeployData({
    abi: input.artifacts.factory.abi,
    bytecode: input.artifacts.factory.bytecode,
  });
  const poolData = encodeDeployData({
    abi: input.artifacts.pool.abi,
    bytecode: input.artifacts.pool.bytecode,
    args: [poolId, poolConfig],
  });
  const pool = getCreate2Address({
    from: factory,
    salt: poolId,
    bytecodeHash: keccak256(poolData),
  });
  return {
    chainId: SEPOLIA_CHAIN_ID,
    deployer: input.deployer,
    startingNonce: input.startingNonce,
    feed,
    threshold: input.threshold,
    greaterOrEqual,
    observationNotBefore,
    maximumFeedAge,
    poolConfig,
    deploymentSalt,
    poolId,
    actions: [
      { id: 'fixture', nonce: input.startingNonce, address: fixture, data: fixtureData },
      { id: 'wrapper', nonce: input.startingNonce + 1n, address: wrapper, data: wrapperData },
      { id: 'adapter', nonce: input.startingNonce + 2n, address: adapter, data: adapterData },
      { id: 'factory', nonce: input.startingNonce + 3n, address: factory, data: factoryData },
      { id: 'pool', address: pool, data: poolData },
    ],
  };
}
