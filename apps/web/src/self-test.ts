import adapterArtifact from '../../../modules/protocol/artifacts/contracts/adapters/ChainlinkPriceFeedResolutionAdapter.sol/ChainlinkPriceFeedResolutionAdapter.json';
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeDeployData,
  encodeFunctionData,
  http,
  keccak256,
  type Address,
  type Hex,
} from 'viem';
import { sepolia } from 'viem/chains';
import { createViemProtocolPublicReader, publicAddress } from '@quitesignal/confidential-client';
import type { BrowserProvider } from './wallet.js';

const COMMIT_TIMEOUT_SECONDS = 60n;
const AGGREGATE_TIMEOUT_SECONDS = 600n;
const RESOLUTION_GRACE_SECONDS = 600n;
const MAXIMUM_FEED_AGE_SECONDS = 86_400n;
const SEPOLIA_PUBLIC_READ_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

const SELF_TEST_THRESHOLD_DECIMALS = 8;
const MIN_SELF_TEST_THRESHOLD = 100_000_000n;
const MAX_SELF_TEST_THRESHOLD = 100_000_000_000_000n;
const MIN_SELF_TEST_COMMIT_WINDOW_MINUTES = 5;
const MAX_SELF_TEST_COMMIT_WINDOW_MINUTES = 180;
const MIN_SELF_TEST_PARTICIPANT_GATE = 2;
const MAX_SELF_TEST_PARTICIPANT_GATE = 20;

export interface SelfTestPolicy {
  conditionLabel: string;
  threshold: string;
  comparison: 'greater-or-equal' | 'less-than';
  commitWindowMinutes: number;
  commitWindowSeconds: bigint;
  participantGate: number;
}

export function selfTestPolicyForSelection(
  comparison: string,
  threshold: string,
  commitWindowMinutes: number,
  participantGate: number,
): SelfTestPolicy | undefined {
  if (!/^\d+$/.test(threshold)) return undefined;
  const thresholdValue = BigInt(threshold);
  if (
    (comparison !== 'greater-or-equal' && comparison !== 'less-than') ||
    thresholdValue < MIN_SELF_TEST_THRESHOLD ||
    thresholdValue > MAX_SELF_TEST_THRESHOLD ||
    !Number.isInteger(commitWindowMinutes) ||
    commitWindowMinutes < MIN_SELF_TEST_COMMIT_WINDOW_MINUTES ||
    commitWindowMinutes > MAX_SELF_TEST_COMMIT_WINDOW_MINUTES ||
    !Number.isInteger(participantGate) ||
    participantGate < MIN_SELF_TEST_PARTICIPANT_GATE ||
    participantGate > MAX_SELF_TEST_PARTICIPANT_GATE
  )
    return undefined;
  return {
    conditionLabel: `ETH/USD ${comparison === 'greater-or-equal' ? '≥' : '<'} $${formatSelfTestUsdThreshold(threshold)}`,
    threshold,
    comparison,
    commitWindowMinutes,
    commitWindowSeconds: BigInt(commitWindowMinutes * 60),
    participantGate,
  };
}

export function selfTestPolicyForDraft(
  comparison: string,
  thresholdUsd: string,
  commitWindowMinutes: number,
  participantGate: number,
): SelfTestPolicy | undefined {
  const normalized = thresholdUsd.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(normalized)) return undefined;
  const [whole = '0', fraction = ''] = normalized.split('.');
  const threshold = `${whole}${fraction.padEnd(SELF_TEST_THRESHOLD_DECIMALS, '0')}`.replace(
    /^0+(?=\d)/,
    '',
  );
  return selfTestPolicyForSelection(comparison, threshold, commitWindowMinutes, participantGate);
}

export function formatSelfTestUsdThreshold(threshold: string): string {
  const normalized = threshold.padStart(SELF_TEST_THRESHOLD_DECIMALS + 1, '0');
  const whole = normalized.slice(0, -SELF_TEST_THRESHOLD_DECIMALS);
  const fraction = normalized.slice(-SELF_TEST_THRESHOLD_DECIMALS).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

const factoryAbi = [
  {
    type: 'function',
    name: 'createPool',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'config_',
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
      { name: 'deploymentSalt', type: 'bytes32' },
    ],
    outputs: [{ name: 'pool', type: 'address' }],
  },
  {
    type: 'function',
    name: 'poolIdFor',
    stateMutability: 'view',
    inputs: [
      {
        name: 'config_',
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
      { name: 'deploymentSalt', type: 'bytes32' },
    ],
    outputs: [{ name: 'poolId', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'poolOf',
    stateMutability: 'view',
    inputs: [{ name: 'poolId_', type: 'bytes32' }],
    outputs: [{ name: 'pool', type: 'address' }],
  },
] as const;

const poolIdentityAbi = [
  {
    type: 'function',
    name: 'poolId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
] as const;

export interface SelfTestLaunchInput {
  canonicalPoolAddress: string;
  factoryAddress: string;
  factoryRuntimeCodeHash: string;
  collateralAddress: string;
  feedAddress: string;
  policy: SelfTestPolicy;
  expectedStartTimestamp?: bigint;
}

export interface SelfTestMarket {
  poolAddress: string;
  adapterAddress: string;
  deadline: bigint;
  observationNotBefore: bigint;
  participantGate: number;
  startedAt: bigint;
  policy: SelfTestPolicy;
}

export function isSelfTestPoolAddress(value: string): boolean {
  return /^0x[0-9a-f]{40}$/i.test(value);
}

export function deriveSelfTestTiming(
  timestamp: bigint,
  commitWindowSeconds = 1_500n,
): {
  deadline: bigint;
  observationNotBefore: bigint;
} {
  if (timestamp <= 0n) throw new Error('A positive Sepolia block timestamp is required.');
  if (
    commitWindowSeconds < BigInt(MIN_SELF_TEST_COMMIT_WINDOW_MINUTES * 60) ||
    commitWindowSeconds > BigInt(MAX_SELF_TEST_COMMIT_WINDOW_MINUTES * 60) ||
    commitWindowSeconds % 60n !== 0n
  )
    throw new Error('The selected self-test commit window is not allowed.');
  const deadline = timestamp + commitWindowSeconds;
  const observationNotBefore = deadline + RESOLUTION_GRACE_SECONDS;
  if (deadline <= timestamp || observationNotBefore < deadline)
    throw new Error('The fresh self-test timing could not be derived safely.');
  return { deadline, observationNotBefore };
}

function randomSalt(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}` as Hex;
}

function requireSelfTestPolicy(policy: SelfTestPolicy): SelfTestPolicy {
  const allowed = selfTestPolicyForSelection(
    policy.comparison,
    policy.threshold,
    policy.commitWindowMinutes,
    policy.participantGate,
  );
  if (
    !allowed ||
    allowed.threshold !== policy.threshold ||
    allowed.comparison !== policy.comparison ||
    allowed.commitWindowSeconds !== policy.commitWindowSeconds
  )
    throw new Error('The selected self-test configuration is not allowed.');
  return allowed;
}

async function connectedWallet(provider: BrowserProvider): Promise<{
  account: Address;
  wallet: ReturnType<typeof createWalletClient>;
}> {
  const discovery = createWalletClient({ chain: sepolia, transport: custom(provider) });
  const [account] = await discovery.getAddresses();
  if (!account)
    throw new Error('A connected wallet account is required to launch a self-test market.');
  const wallet = createWalletClient({ account, chain: sepolia, transport: custom(provider) });
  if ((await wallet.getChainId()) !== 11_155_111)
    throw new Error('The connected wallet must use Ethereum Sepolia.');
  return { account, wallet };
}

async function confirmed(
  reader: ReturnType<typeof createPublicClient>,
  hash: Hex,
): Promise<Awaited<ReturnType<typeof reader.waitForTransactionReceipt>>> {
  const receipt = await reader.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success')
    throw new Error('The submitted self-test transaction reverted.');
  return receipt;
}

async function readVerifiedAdapter(
  reader: ReturnType<typeof createPublicClient>,
  adapter: Address,
  feed: Address,
  feedCode: Hex,
  policy: SelfTestPolicy,
): Promise<bigint> {
  const [
    target,
    greaterOrEqual,
    threshold,
    observationNotBefore,
    maximumFeedAge,
    targetRuntimeCodeHash,
  ] = await Promise.all([
    reader.readContract({
      address: adapter,
      abi: adapterArtifact.abi,
      functionName: 'target',
    } as never),
    reader.readContract({
      address: adapter,
      abi: adapterArtifact.abi,
      functionName: 'greaterOrEqual',
    } as never),
    reader.readContract({
      address: adapter,
      abi: adapterArtifact.abi,
      functionName: 'threshold',
    } as never),
    reader.readContract({
      address: adapter,
      abi: adapterArtifact.abi,
      functionName: 'observationNotBefore',
    } as never),
    reader.readContract({
      address: adapter,
      abi: adapterArtifact.abi,
      functionName: 'maximumFeedAge',
    } as never),
    reader.readContract({
      address: adapter,
      abi: adapterArtifact.abi,
      functionName: 'targetRuntimeCodeHash',
    } as never),
  ]);
  if (
    String(target).toLowerCase() !== feed.toLowerCase() ||
    greaterOrEqual !== (policy.comparison === 'greater-or-equal') ||
    threshold !== BigInt(policy.threshold) ||
    maximumFeedAge !== MAXIMUM_FEED_AGE_SECONDS ||
    targetRuntimeCodeHash !== keccak256(feedCode)
  ) {
    throw new Error('The adapter configuration does not match the selected self-test condition.');
  }
  return observationNotBefore as bigint;
}

export async function loadSelfTestMarket(
  poolAddress: string,
  input: SelfTestLaunchInput,
): Promise<SelfTestMarket> {
  if (!isSelfTestPoolAddress(poolAddress)) throw new Error('Enter a valid public pool address.');
  const policy = requireSelfTestPolicy(input.policy);
  const reader = createPublicClient({
    chain: sepolia,
    transport: http(SEPOLIA_PUBLIC_READ_RPC, { retryCount: 0, timeout: 10_000 }),
  });
  const factory = publicAddress(input.factoryAddress) as Address;
  const collateral = publicAddress(input.collateralAddress) as Address;
  const feed = publicAddress(input.feedAddress) as Address;
  const pool = publicAddress(poolAddress) as Address;
  if (pool.toLowerCase() === input.canonicalPoolAddress.toLowerCase())
    throw new Error(
      'The canonical release is not a self-test market. Create or open a separate pool.',
    );
  const [factoryCode, collateralCode, feedCode, poolCode] = await Promise.all([
    reader.getCode({ address: factory }),
    reader.getCode({ address: collateral }),
    reader.getCode({ address: feed }),
    reader.getCode({ address: pool }),
  ]);
  if (
    !factoryCode ||
    factoryCode === '0x' ||
    keccak256(factoryCode) !== input.factoryRuntimeCodeHash
  ) {
    throw new Error('The canonical factory runtime does not match the validated manifest.');
  }
  if (
    !collateralCode ||
    collateralCode === '0x' ||
    !feedCode ||
    feedCode === '0x' ||
    !poolCode ||
    poolCode === '0x'
  ) {
    throw new Error('The public pool, wrapper, or price feed has no Sepolia runtime.');
  }
  const poolId = (await reader.readContract({
    address: pool,
    abi: poolIdentityAbi,
    functionName: 'poolId',
  } as never)) as Hex;
  const factoryPool = (await reader.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: 'poolOf',
    args: [poolId],
  } as never)) as Address;
  if (factoryPool.toLowerCase() !== pool.toLowerCase())
    throw new Error('This pool is not registered by the manifest-bound factory.');
  const config = await createViemProtocolPublicReader(reader).readConfig(publicAddress(pool));
  if (
    config.confidentialCollateral.toLowerCase() !== collateral.toLowerCase() ||
    config.kMin !== policy.participantGate ||
    config.commitTimeout !== COMMIT_TIMEOUT_SECONDS ||
    config.aggregateTimeout !== AGGREGATE_TIMEOUT_SECONDS ||
    config.resolutionGrace !== RESOLUTION_GRACE_SECONDS
  ) {
    throw new Error('The pool configuration does not match the selected self-test policy.');
  }
  if (
    input.expectedStartTimestamp !== undefined &&
    (input.expectedStartTimestamp <= 0n ||
      config.deadline !== input.expectedStartTimestamp + policy.commitWindowSeconds)
  )
    throw new Error('The shared self-test link does not match the immutable commit window.');
  const observationNotBefore = await readVerifiedAdapter(
    reader,
    config.resolutionAdapter as Address,
    feed,
    feedCode,
    policy,
  );
  if (observationNotBefore !== config.deadline + RESOLUTION_GRACE_SECONDS)
    throw new Error('The self-test resolution adapter does not preserve the fixed resolution boundary.');
  return {
    poolAddress: pool,
    adapterAddress: config.resolutionAdapter,
    deadline: config.deadline,
    observationNotBefore,
    participantGate: config.kMin,
    startedAt: input.expectedStartTimestamp ?? config.deadline - policy.commitWindowSeconds,
    policy,
  };
}

export async function launchSelfTestMarket(
  provider: BrowserProvider,
  input: SelfTestLaunchInput,
  reportProgress: (message: string) => void,
): Promise<SelfTestMarket> {
  const policy = requireSelfTestPolicy(input.policy);
  const { account, wallet } = await connectedWallet(provider);
  const reader = createPublicClient({ chain: sepolia, transport: custom(provider) });
  const factory = publicAddress(input.factoryAddress) as Address;
  const collateral = publicAddress(input.collateralAddress) as Address;
  const feed = publicAddress(input.feedAddress) as Address;
  const [factoryCode, collateralCode, feedCode, block] = await Promise.all([
    reader.getCode({ address: factory }),
    reader.getCode({ address: collateral }),
    reader.getCode({ address: feed }),
    reader.getBlock(),
  ]);
  if (
    !factoryCode ||
    factoryCode === '0x' ||
    keccak256(factoryCode) !== input.factoryRuntimeCodeHash
  )
    throw new Error('The canonical factory runtime does not match the validated manifest.');
  if (!collateralCode || collateralCode === '0x' || !feedCode || feedCode === '0x')
    throw new Error('The manifest-bound collateral wrapper or price feed has no Sepolia runtime.');

  const { deadline, observationNotBefore } = deriveSelfTestTiming(
    block.timestamp,
    policy.commitWindowSeconds,
  );
  const adapterData = encodeDeployData({
    abi: adapterArtifact.abi,
    bytecode: adapterArtifact.bytecode as Hex,
    args: [
      feed,
      policy.comparison === 'greater-or-equal',
      BigInt(policy.threshold),
      observationNotBefore,
      MAXIMUM_FEED_AGE_SECONDS,
    ],
  });
  reportProgress(
    'Deploying a new immutable public-resolution adapter from your wallet. No collateral moves.',
  );
  const adapterHash = await wallet.sendTransaction({ account, chain: sepolia, data: adapterData });
  const adapterReceipt = await confirmed(reader, adapterHash);
  const adapter = adapterReceipt.contractAddress;
  if (!adapter) throw new Error('The adapter receipt did not record a deployed contract address.');
  const observedAt = await readVerifiedAdapter(reader, adapter, feed, feedCode, policy);
  if (observedAt !== observationNotBefore)
    throw new Error(
      'The deployed adapter configuration does not match the requested self-test condition.',
    );

  const config = {
    confidentialCollateral: collateral,
    resolutionAdapter: adapter,
    deadline,
    commitTimeout: COMMIT_TIMEOUT_SECONDS,
    kMin: policy.participantGate,
    aggregateTimeout: AGGREGATE_TIMEOUT_SECONDS,
    resolutionGrace: RESOLUTION_GRACE_SECONDS,
  } as const;
  const salt = randomSalt();
  const poolId = (await reader.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: 'poolIdFor',
    args: [config, salt],
  } as never)) as Hex;
  reportProgress(
    'Adapter confirmed. Creating one fresh immutable pool through the canonical permissionless factory.',
  );
  const poolHash = await wallet.sendTransaction({
    account,
    chain: sepolia,
    to: factory,
    data: encodeFunctionData({
      abi: factoryAbi,
      functionName: 'createPool',
      args: [config, salt],
    }),
  });
  await confirmed(reader, poolHash);
  const pool = (await reader.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: 'poolOf',
    args: [poolId],
  } as never)) as Address;
  if (/^0x0{40}$/i.test(pool))
    throw new Error('The factory did not record the new self-test pool.');
  const verified = await createViemProtocolPublicReader(reader).readConfig(publicAddress(pool));
  if (
    verified.confidentialCollateral.toLowerCase() !== collateral.toLowerCase() ||
    verified.resolutionAdapter.toLowerCase() !== adapter.toLowerCase() ||
    verified.deadline !== deadline ||
    verified.kMin !== policy.participantGate
  ) {
    throw new Error(
      'The created pool configuration does not match the requested immutable self-test market.',
    );
  }
  return {
    poolAddress: pool,
    adapterAddress: adapter,
    deadline,
    observationNotBefore,
    participantGate: policy.participantGate,
    startedAt: block.timestamp,
    policy,
  };
}
