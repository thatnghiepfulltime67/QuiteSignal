import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  isAddress,
  keccak256,
  type Abi,
  type Address,
  type Hash,
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
const canonicalManifestPath = resolve(repositoryRoot, 'deployments/sepolia/quiet-signal.json');

function releaseId(): string | undefined {
  const value = process.argv.find((argument) => argument.startsWith('--release='))?.slice(10);
  if (value === undefined) return undefined;
  if (!/^DEP-(?:0[2-9]|[1-9][0-9]*)$/.test(value))
    throw new Error(
      'DEP-01 deployment failed: --release must be an explicit new DEP-<integer> ID.',
    );
  if (value === 'DEP-01')
    throw new Error(
      'DEP-01 deployment failed: omit --release for the immutable DEP-01 manifest path.',
    );
  return value;
}

interface CompiledArtifact extends DeploymentArtifact {
  deployedBytecode: Hex;
  buildInfoId: string;
  contractName: string;
  sourceName: string;
}

interface SpendEntry {
  workItemId: string;
  phase: string;
  sourceCommit: string;
  sender: Address;
  transactionHash: Hash;
  blockNumber: string;
  gasUsed: string;
  effectiveGasPrice: string;
  actualGasCostWei: string;
  timestampUtc: string;
}

interface SpendLedger {
  schemaVersion: number;
  chainId: number;
  maxTotalSpendWei: string;
  entries: SpendEntry[];
}

interface PublicEpoch {
  state: number;
  winner: number;
  participantCount: number;
  publicYes: bigint;
  publicNo: bigint;
  settledRoundId: bigint;
  settledAnswer: bigint;
}

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

function fail(message: string): never {
  throw new Error(`DEP-01 deployment failed: ${message}`);
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

function assertClean(): void {
  if (
    execFileSync('git', ['status', '--porcelain'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim()
  ) {
    fail('confirmed Sepolia writes require a clean source tree.');
  }
}

function loadArtifact(path: string, id: string): CompiledArtifact {
  const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<CompiledArtifact>;
  if (
    !Array.isArray(value.abi) ||
    typeof value.bytecode !== 'string' ||
    typeof value.deployedBytecode !== 'string' ||
    typeof value.buildInfoId !== 'string' ||
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

function totalSpend(ledger: SpendLedger): bigint {
  return ledger.entries.reduce((total, entry) => total + BigInt(entry.actualGasCostWei), 0n);
}

function appendSpend(
  ledger: SpendLedger,
  entry: Omit<SpendEntry, 'sourceCommit' | 'timestampUtc'>,
): void {
  ledger.entries.push({
    ...entry,
    sourceCommit: sourceCommit(),
    timestampUtc: new Date().toISOString(),
  });
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
}

function publicEpoch(value: unknown): PublicEpoch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('pool epoch is malformed.');
  const epoch = value as Record<string, unknown>;
  const numberField = (name: string): number => {
    if (typeof epoch[name] !== 'number') fail(`pool epoch ${name} is malformed.`);
    return epoch[name] as number;
  };
  const bigintField = (name: string): bigint => {
    if (typeof epoch[name] !== 'bigint') fail(`pool epoch ${name} is malformed.`);
    return epoch[name] as bigint;
  };
  return {
    state: numberField('state'),
    winner: numberField('winner'),
    participantCount: numberField('participantCount'),
    publicYes: bigintField('publicYes'),
    publicNo: bigintField('publicNo'),
    settledRoundId: bigintField('settledRoundId'),
    settledAnswer: bigintField('settledAnswer'),
  };
}

async function main(): Promise<void> {
  const revision = releaseId();
  const workItemId = revision ?? 'DEP-01';
  const manifestPath = revision
    ? resolve(repositoryRoot, 'deployments/sepolia/releases', `${revision}.json`)
    : canonicalManifestPath;
  loadEnvironment();
  if (process.env.CONFIRM_SEPOLIA_WRITE !== 'yes') {
    fail('set CONFIRM_SEPOLIA_WRITE=yes for an irreversible Sepolia deployment.');
  }
  assertClean();
  if (existsSync(manifestPath))
    fail(
      revision
        ? `the ${revision} revision manifest already exists and must never be overwritten.`
        : 'the canonical manifest already exists and must never be overwritten.',
    );
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY as Hex | undefined;
  if (!rpcUrl || !privateKey) fail('Sepolia RPC and deployer configuration are required.');
  const deployer = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
  });
  const walletClient = createWalletClient({
    account: deployer,
    chain: sepolia,
    transport: http(rpcUrl),
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
        'core/QuietSignalConfidentialCollateral.sol/QuietSignalConfidentialCollateral.json',
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
  const [block, pendingNonce] = await Promise.all([
    publicClient.getBlock(),
    publicClient.getTransactionCount({ address: deployer.address, blockTag: 'pending' }),
  ]);
  const plan = buildCanonicalDeploymentPlan({
    deployer: deployer.address,
    startingNonce: BigInt(pendingNonce),
    timestamp: block.timestamp,
    threshold: 200_000_000_000n,
    artifacts,
  });
  const ledger = loadLedger();
  const remainingBudget = BigInt(ledger.maxTotalSpendWei) - totalSpend(ledger);
  const preexistingCode = await Promise.all(
    plan.actions.map(async (action) => ({
      id: action.id,
      code: await publicClient.getCode({ address: action.address }),
    })),
  );
  if (preexistingCode.some(({ code }) => code && code !== '0x')) {
    fail('a predicted canonical address already contains runtime code.');
  }
  const fee = await publicClient.estimateFeesPerGas();
  const initialMaxFeePerGas = fee.maxFeePerGas ?? (await publicClient.getGasPrice());
  const estimatedDeploymentGas = await Promise.all(
    plan.actions
      .slice(0, 4)
      .map((action) => publicClient.estimateGas({ account: deployer.address, data: action.data })),
  );
  const estimatedTotal =
    estimatedDeploymentGas.reduce((total, gas) => total + gas, 0n) +
    CANONICAL_POOL_CREATE_GAS_LIMIT;
  if (estimatedTotal * initialMaxFeePerGas > remainingBudget) {
    fail('the guarded deployment cost plan exceeds the remaining Sepolia budget.');
  }

  const receipts: Array<{ id: string; transactionHash: Hash; blockNumber: string }> = [];
  const recordReceipt = (
    id: string,
    transactionHash: Hash,
    receipt: { blockNumber: bigint; gasUsed: bigint; effectiveGasPrice: bigint },
  ): void => {
    appendSpend(ledger, {
      workItemId,
      phase: 'P2',
      sender: deployer.address,
      transactionHash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice.toString(),
      actualGasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
    });
    receipts.push({ id, transactionHash, blockNumber: receipt.blockNumber.toString() });
  };
  const assertBudgetAndSend = async (input: {
    id: string;
    to?: Address;
    data: Hex;
    nonce: bigint;
    gasLimit?: bigint;
  }) => {
    const gasEstimate = await publicClient.estimateGas({
      account: deployer.address,
      to: input.to,
      data: input.data,
    });
    if (input.gasLimit !== undefined && gasEstimate > input.gasLimit) {
      fail(`${input.id} gas estimate exceeds its declared maximum bound.`);
    }
    const gas = input.gasLimit ?? gasEstimate;
    const feeNow = await publicClient.estimateFeesPerGas();
    const maxFeePerGas = feeNow.maxFeePerGas ?? (await publicClient.getGasPrice());
    if (totalSpend(ledger) + gas * maxFeePerGas > BigInt(ledger.maxTotalSpendWei)) {
      fail(`${input.id} exceeds the remaining Sepolia budget.`);
    }
    const transactionHash = await walletClient.sendTransaction({
      account: deployer,
      to: input.to,
      data: input.data,
      nonce: Number(input.nonce),
      gas,
      maxFeePerGas,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
    if (receipt.status !== 'success') fail(`${input.id} transaction reverted.`);
    recordReceipt(input.id, transactionHash, receipt);
    return receipt;
  };
  const deployed: Record<string, Address> = {};
  for (const action of plan.actions.slice(0, 4)) {
    if (action.nonce === undefined) fail(`${action.id} is missing a fixed CREATE nonce.`);
    const receipt = await assertBudgetAndSend({
      id: action.id,
      data: action.data,
      nonce: action.nonce,
    });
    if (
      !receipt.contractAddress ||
      receipt.contractAddress.toLowerCase() !== action.address.toLowerCase()
    ) {
      fail(`${action.id} receipt address does not match its deterministic CREATE address.`);
    }
    deployed[action.id] = receipt.contractAddress;
  }
  const latestBlock = await publicClient.getBlock();
  if (latestBlock.timestamp >= plan.poolConfig.deadline) {
    fail(
      'deployment reached the commit deadline before pool creation; manifest remains unpublished.',
    );
  }
  const factory = deployed.factory;
  if (!factory) fail('factory deployment address is unavailable.');
  const poolAction = plan.actions[4];
  if (!poolAction || !isAddress(poolAction.address)) fail('predicted pool address is unavailable.');
  const factoryCreatePoolData = encodeFunctionData({
    abi: artifacts.factory.abi,
    functionName: 'createPool',
    args: [plan.poolConfig, plan.deploymentSalt],
  } as never);
  const poolReceipt = await assertBudgetAndSend({
    id: 'pool',
    to: factory,
    data: factoryCreatePoolData,
    nonce: plan.startingNonce + 4n,
    gasLimit: CANONICAL_POOL_CREATE_GAS_LIMIT,
  });
  const canonicalPool = poolAction.address;
  const onChainPool = (await publicClient.readContract({
    address: factory,
    abi: artifacts.factory.abi,
    functionName: 'poolOf',
    args: [plan.poolId],
  } as never)) as Address;
  if (onChainPool.toLowerCase() !== canonicalPool.toLowerCase()) {
    fail('factory pool binding does not match the predicted CREATE2 address.');
  }
  const [configRaw, epochRaw] = await Promise.all([
    publicClient.readContract({ address: canonicalPool, abi: POOL_ABI, functionName: 'config' }),
    publicClient.readContract({ address: canonicalPool, abi: POOL_ABI, functionName: 'epoch' }),
  ]);
  const config = configRaw as Record<string, unknown>;
  if (
    !isAddress(config.confidentialCollateral as string) ||
    !isAddress(config.resolutionAdapter as string) ||
    (config.confidentialCollateral as string).toLowerCase() !==
      plan.poolConfig.confidentialCollateral.toLowerCase() ||
    (config.resolutionAdapter as string).toLowerCase() !==
      plan.poolConfig.resolutionAdapter.toLowerCase()
  ) {
    fail('deployed pool immutable configuration does not match the canonical plan.');
  }
  const epoch = publicEpoch(epochRaw);
  if (
    epoch.state !== 0 ||
    epoch.winner !== 0 ||
    epoch.participantCount !== 0 ||
    epoch.publicYes !== 0n ||
    epoch.publicNo !== 0n ||
    epoch.settledRoundId !== 0n ||
    epoch.settledAnswer !== 0n
  ) {
    fail('canonical pool did not open in the required empty public epoch state.');
  }
  const contractRecords = await Promise.all(
    (
      [
        ['fixture', deployed.fixture],
        ['wrapper', deployed.wrapper],
        ['adapter', deployed.adapter],
        ['factory', deployed.factory],
        ['pool', canonicalPool],
      ] as Array<[string, Address | undefined]>
    ).map(async ([id, address]) => {
      if (!address) fail(`missing deployed ${id} address.`);
      const runtime = await publicClient.getCode({ address });
      if (!runtime || runtime === '0x') fail(`missing deployed ${id} runtime.`);
      const artifact = artifacts[id as keyof DeploymentArtifacts];
      return {
        id,
        address,
        runtimeCodeHash: keccak256(runtime),
        artifact: {
          contractName: (artifact as CompiledArtifact).contractName,
          sourceName: (artifact as CompiledArtifact).sourceName,
          buildInfoId: (artifact as CompiledArtifact).buildInfoId,
          creationCodeHash: keccak256(artifact.bytecode),
          templateRuntimeCodeHash: keccak256((artifact as CompiledArtifact).deployedBytecode),
        },
      };
    }),
  );
  const manifest = {
    schemaVersion: 1,
    chainId: SEPOLIA_CHAIN_ID,
    sourceCommit: sourceCommit(),
    deployment: {
      workItemId,
      deployedAtBlock: poolReceipt.blockNumber.toString(),
      deployer: deployer.address,
      configuration: {
        feed: plan.feed,
        feedRuntimeCodeHash: keccak256(
          (await publicClient.getCode({ address: plan.feed })) ?? '0x',
        ),
        threshold: plan.threshold.toString(),
        comparison: plan.greaterOrEqual ? 'greater-or-equal' : 'less-than',
        observationNotBefore: plan.observationNotBefore.toString(),
        maximumFeedAgeSeconds: plan.maximumFeedAge.toString(),
        poolId: plan.poolId,
        deploymentSalt: plan.deploymentSalt,
      },
    },
    contracts: contractRecords,
    pools: [
      {
        contractId: 'pool',
        address: canonicalPool,
        confidentialCollateral: plan.poolConfig.confidentialCollateral,
        resolutionAdapter: plan.poolConfig.resolutionAdapter,
        epoch: {
          state: epoch.state,
          winner: epoch.winner,
          participantCount: epoch.participantCount,
          publicYes: epoch.publicYes.toString(),
          publicNo: epoch.publicNo.toString(),
          settledRoundId: epoch.settledRoundId.toString(),
          settledAnswer: epoch.settledAnswer.toString(),
        },
      },
    ],
    receipts,
  };
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(
    `${JSON.stringify({
      status: 'deployed',
      workItemId,
      manifest: revision
        ? `deployments/sepolia/releases/${revision}.json`
        : 'deployments/sepolia/quiet-signal.json',
      pool: canonicalPool,
    })}\n`,
  );
}

main().catch(() => {
  process.stderr.write('DEP-01 deployment stopped; no unpublished manifest was overwritten.\n');
  process.exitCode = 1;
});
