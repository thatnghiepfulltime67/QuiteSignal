import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createPublicClient,
  encodeFunctionData,
  http,
  keccak256,
  type Abi,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

import {
  CANONICAL_POOL_CREATE_GAS_LIMIT,
  SEPOLIA_CHAIN_ID,
  buildCanonicalDeploymentPlan,
  type DeploymentArtifact,
  type DeploymentArtifacts,
} from '../../src/deployment-plan.js';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const protocolRoot = resolve(scriptDirectory, '../..');
const repositoryRoot = resolve(protocolRoot, '../..');
const artifactPath = (path: string) => resolve(protocolRoot, 'artifacts/contracts', path);
const ledgerPath = resolve(repositoryRoot, 'evidence/sepolia/spend-ledger.json');

interface CompiledArtifact extends DeploymentArtifact {
  deployedBytecode: Hex;
  contractName: string;
  sourceName: string;
}

interface SpendLedger {
  schemaVersion: number;
  chainId: number;
  maxTotalSpendWei: string;
  entries: ReadonlyArray<{ actualGasCostWei: string }>;
}

const CHAINLINK_AGGREGATOR_ABI = [
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
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

function fail(message: string): never {
  throw new Error(`DEP-01 plan failed: ${message}`);
}

function loadEnvironment(): void {
  const path = resolve(repositoryRoot, '.env');
  if (existsSync(path)) process.loadEnvFile(path);
}

function sourceCommit(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
}

function loadArtifact(path: string, id: string): CompiledArtifact {
  const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<CompiledArtifact>;
  if (
    !Array.isArray(value.abi) ||
    typeof value.bytecode !== 'string' ||
    typeof value.deployedBytecode !== 'string' ||
    !value.bytecode.startsWith('0x') ||
    !value.deployedBytecode.startsWith('0x') ||
    typeof value.contractName !== 'string' ||
    typeof value.sourceName !== 'string'
  ) {
    fail(`compiled ${id} artifact is malformed.`);
  }
  return value as CompiledArtifact;
}

function loadLedger(): SpendLedger {
  const value = JSON.parse(readFileSync(ledgerPath, 'utf8')) as Partial<SpendLedger>;
  if (
    value.schemaVersion !== 1 ||
    value.chainId !== SEPOLIA_CHAIN_ID ||
    typeof value.maxTotalSpendWei !== 'string' ||
    !/^\d+$/.test(value.maxTotalSpendWei) ||
    !Array.isArray(value.entries) ||
    value.entries.some(
      (entry) =>
        entry === null ||
        typeof entry.actualGasCostWei !== 'string' ||
        !/^\d+$/.test(entry.actualGasCostWei),
    )
  ) {
    fail('the Sepolia spend ledger is malformed.');
  }
  return value as SpendLedger;
}

function decimalString(value: bigint, decimals: number): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const whole = absolute / scale;
  const fraction = (absolute % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${sign}${whole.toString()}${fraction ? `.${fraction}` : ''}`;
}

async function main(): Promise<void> {
  loadEnvironment();
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY as Hex | undefined;
  if (!rpcUrl || !privateKey) fail('Sepolia RPC and deployer configuration are required.');
  const deployer = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
  });
  if ((await publicClient.getChainId()) !== SEPOLIA_CHAIN_ID) {
    fail('the configured RPC is not Ethereum Sepolia.');
  }

  const artifacts: DeploymentArtifacts = {
    fixture: loadArtifact(
      artifactPath('feasibility/FeasibilityERC20.sol/FeasibilityERC20.json'),
      'fixture',
    ),
    wrapper: loadArtifact(
      artifactPath(
        'feasibility/FeasibilityConfidentialWrapper.sol/FeasibilityConfidentialWrapper.json',
      ),
      'wrapper',
    ),
    adapter: loadArtifact(
      artifactPath(
        'adapters/ChainlinkPriceFeedResolutionAdapter.sol/ChainlinkPriceFeedResolutionAdapter.json',
      ),
      'adapter',
    ),
    factory: loadArtifact(
      artifactPath('core/QuietSignalFactory.sol/QuietSignalFactory.json'),
      'factory',
    ),
    pool: loadArtifact(artifactPath('core/QuietSignalPool.sol/QuietSignalPool.json'), 'pool'),
  };
  const block = await publicClient.getBlock();
  const startingNonce = await publicClient.getTransactionCount({ address: deployer.address });
  const plan = buildCanonicalDeploymentPlan({
    deployer: deployer.address,
    startingNonce: BigInt(startingNonce),
    timestamp: block.timestamp,
    threshold: 200_000_000_000n,
    artifacts,
  });
  const feedRuntime = await publicClient.getCode({ address: plan.feed });
  if (!feedRuntime || feedRuntime === '0x')
    fail('the selected Chainlink feed has no runtime code.');
  const [feedDecimals, latestRound] = await Promise.all([
    publicClient.readContract({
      address: plan.feed,
      abi: CHAINLINK_AGGREGATOR_ABI,
      functionName: 'decimals',
    }),
    publicClient.readContract({
      address: plan.feed,
      abi: CHAINLINK_AGGREGATOR_ABI,
      functionName: 'latestRoundData',
    }),
  ]);
  if (feedDecimals !== 8)
    fail(`the selected ETH/USD feed reports unexpected decimals (${feedDecimals}).`);
  const [roundId, answer, , updatedAt, answeredInRound] = latestRound;
  if (updatedAt === 0n || answeredInRound < roundId)
    fail('the selected feed latest round is invalid.');

  const fee = await publicClient.estimateFeesPerGas();
  const maxFeePerGas = fee.maxFeePerGas ?? (await publicClient.getGasPrice());
  const writePlans = await Promise.all(
    plan.actions.slice(0, 4).map(async (action) => ({
      id: action.id,
      nonce: action.nonce?.toString(),
      address: action.address,
      initCodeHash: keccak256(action.data),
      initCodeBytes: (action.data.length - 2) / 2,
      gas: (
        await publicClient.estimateGas({ account: deployer.address, data: action.data })
      ).toString(),
    })),
  );
  const factoryCreatePoolData = encodeFunctionData({
    abi: artifacts.factory.abi,
    functionName: 'createPool',
    args: [plan.poolConfig, plan.deploymentSalt],
  } as never);
  const poolAction = {
    id: 'pool',
    address: plan.actions[4]?.address,
    factory: plan.actions[3]?.address,
    createPoolCalldataHash: keccak256(factoryCreatePoolData),
    poolInitCodeHash: keccak256(plan.actions[4]?.data ?? '0x'),
    gas: CANONICAL_POOL_CREATE_GAS_LIMIT.toString(),
    gasKind: 'maximum-bound-before-factory-exists',
  };
  const plannedGas =
    writePlans.reduce((total, action) => total + BigInt(action.gas), 0n) +
    CANONICAL_POOL_CREATE_GAS_LIMIT;
  const plannedCostWei = plannedGas * maxFeePerGas;
  const ledger = loadLedger();
  const spentWei = ledger.entries.reduce(
    (total, entry) => total + BigInt(entry.actualGasCostWei),
    0n,
  );
  const remainingWei = BigInt(ledger.maxTotalSpendWei) - spentWei;
  if (plannedCostWei > remainingWei)
    fail('the cost plan exceeds the remaining committed Sepolia budget.');

  const compiled = Object.fromEntries(
    Object.entries(artifacts).map(([id, artifact]) => [
      id,
      {
        contractName: (artifact as CompiledArtifact).contractName,
        sourceName: (artifact as CompiledArtifact).sourceName,
        creationCodeHash: keccak256(artifact.bytecode),
        templateRuntimeCodeHash: keccak256((artifact as CompiledArtifact).deployedBytecode),
      },
    ]),
  );
  console.log(
    JSON.stringify({
      schemaVersion: 1,
      mode: 'read-only-plan',
      workItemId: 'DEP-01',
      sourceCommit: sourceCommit(),
      chain: {
        id: SEPOLIA_CHAIN_ID,
        latestBlock: block.number.toString(),
        timestamp: block.timestamp.toString(),
      },
      deployer: deployer.address,
      configuration: {
        feed: plan.feed,
        feedRuntimeCodeHash: keccak256(feedRuntime),
        latestRound: {
          roundId: roundId.toString(),
          answer: answer.toString(),
          answerDecimal: decimalString(answer, feedDecimals),
          updatedAt: updatedAt.toString(),
          answeredInRound: answeredInRound.toString(),
        },
        threshold: plan.threshold.toString(),
        thresholdDecimal: decimalString(plan.threshold, feedDecimals),
        comparison: plan.greaterOrEqual ? 'greater-or-equal' : 'less-than',
        maximumFeedAgeSeconds: plan.maximumFeedAge.toString(),
        observationNotBefore: plan.observationNotBefore.toString(),
        poolConfig: Object.fromEntries(
          Object.entries(plan.poolConfig).map(([key, value]) => [
            key,
            typeof value === 'bigint' ? value.toString() : value,
          ]),
        ),
        deploymentSalt: plan.deploymentSalt,
        poolId: plan.poolId,
      },
      compiled,
      writes: [...writePlans, poolAction],
      costPlan: {
        maxFeePerGas: maxFeePerGas.toString(),
        plannedGas: plannedGas.toString(),
        plannedCostWei: plannedCostWei.toString(),
        remainingBudgetWei: remainingWei.toString(),
      },
    }),
  );
}

main().catch(() => {
  console.error('DEP-01 plan failed without submitting a transaction.');
  process.exitCode = 1;
});
