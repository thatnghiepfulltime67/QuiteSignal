import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  encodeFunctionData,
  getCreate2Address,
  http,
  isAddress,
  keccak256,
  parseAbi,
  toHex,
  type Abi,
  type Address,
  type Hash,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const EXPECTED_CHAIN_ID = 11_155_111;
const CONFIRMATION_VALUE = 'yes';
const ETH_USD_FEED = '0x694AA1769357215DE4FAC081bf1f309aDC325306' as const;
const ERC7984_WRAPPER = '0x8b4fe02e95401e93ba99e63baee01eea0b4b3b17' as const;
const EXPECTED_WRAPPER_RUNTIME_HASH =
  '0xa727b8663257316881027894230d662d4687aca019d9c0762b7f92c708031e08' as const;
const ERC7984_INTERFACE_ID = '0x4958f2a4' as const;
const MAXIMUM_FEED_AGE = 30n * 24n * 60n * 60n;
const OBSERVATION_DELAY = 30n * 24n * 60n * 60n;
const DEADLINE_LEAD = 7n * 24n * 60n * 60n;
const AGGREGATE_TIMEOUT = 24n * 60n * 60n;
const RESOLUTION_GRACE = 24n * 60n * 60n;
const COMMIT_TIMEOUT = 15n * 60n;
const DEPLOYMENT_SALT = keccak256(toHex('QuietSignal PK-03B Sepolia factory shell v1'));
const CREATE_POOL_DRY_RUN_GAS_CEILING = 3_000_000n;

const erc165Abi = parseAbi(['function supportsInterface(bytes4 interfaceId) view returns (bool)']);

interface Artifact {
  abi: Abi;
  bytecode: Hex;
  deployedBytecode: Hex;
  immutableReferences?: Record<string, readonly { start: number; length: number }[]>;
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

interface Deployment {
  address: Address;
  transactionHash: Hash | null;
  blockNumber: bigint | null;
}

interface PoolConfig {
  confidentialCollateral: Address;
  resolutionAdapter: Address;
  deadline: bigint;
  commitTimeout: bigint;
  kMin: number;
  aggregateTimeout: bigint;
  resolutionGrace: bigint;
}

interface ReceiptSummary {
  purpose: string;
  transactionHash: Hash | null;
  blockNumber: string | null;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const protocolRoot = resolve(scriptDirectory, '../..');
const repositoryRoot = resolve(protocolRoot, '../..');
const artifactPaths = {
  adapter: resolve(
    protocolRoot,
    'artifacts/contracts/adapters/ChainlinkPriceFeedResolutionAdapter.sol/ChainlinkPriceFeedResolutionAdapter.json',
  ),
  factory: resolve(
    protocolRoot,
    'artifacts/contracts/core/QuietSignalFactory.sol/QuietSignalFactory.json',
  ),
  pool: resolve(protocolRoot, 'artifacts/contracts/core/QuietSignalPool.sol/QuietSignalPool.json'),
};
const spendLedgerPath = resolve(repositoryRoot, 'evidence/sepolia/spend-ledger.json');
const offlineEvidencePath = resolve(repositoryRoot, 'evidence/offline/G5/PK-03B-FACTORY.json');
const sepoliaEvidencePath = resolve(repositoryRoot, 'evidence/sepolia/G5/PK-03B-FACTORY.json');
let failureStage = 'configuration';

function fail(message: string): never {
  throw new Error(message);
}

function loadEnvironment(): void {
  const environmentPath = resolve(repositoryRoot, '.env');
  if (existsSync(environmentPath)) process.loadEnvFile(environmentPath);
}

function loadArtifact(path: string, name: string): Artifact {
  const artifact = JSON.parse(readFileSync(path, 'utf8')) as Partial<Artifact>;
  if (
    !Array.isArray(artifact.abi) ||
    typeof artifact.bytecode !== 'string' ||
    typeof artifact.deployedBytecode !== 'string'
  ) {
    fail(`The compiled ${name} artifact is unavailable or malformed.`);
  }
  return artifact as Artifact;
}

function loadLedger(): SpendLedger {
  const ledger = JSON.parse(readFileSync(spendLedgerPath, 'utf8')) as Partial<SpendLedger>;
  if (
    ledger.schemaVersion !== 1 ||
    ledger.chainId !== EXPECTED_CHAIN_ID ||
    typeof ledger.maxTotalSpendWei !== 'string' ||
    !Array.isArray(ledger.entries)
  ) {
    fail('The Sepolia spend ledger is unavailable or malformed.');
  }
  return ledger as SpendLedger;
}

function sourceCommit(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
}

function assertCleanSourceTree(): void {
  const status = execFileSync('git', ['status', '--porcelain'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
  if (status.length > 0) fail('Confirmed Sepolia writes and evidence require a clean source tree.');
}

function totalSpendWei(ledger: SpendLedger): bigint {
  return ledger.entries.reduce((total, entry) => total + BigInt(entry.actualGasCostWei), 0n);
}

function singleTransactionCapWei(ledger: SpendLedger): bigint {
  const configured = process.env.SEPOLIA_MAX_SINGLE_TX_ETH;
  if (!configured) return BigInt(ledger.maxTotalSpendWei);
  if (!/^\d+(?:\.\d{1,18})?$/.test(configured)) {
    fail('The configured single-transaction Sepolia cap is malformed.');
  }
  const [whole, fraction = ''] = configured.split('.');
  const value = BigInt(`${whole}${fraction.padEnd(18, '0')}`);
  if (value === 0n || value > BigInt(ledger.maxTotalSpendWei)) {
    fail('The configured single-transaction Sepolia cap is outside the allowance.');
  }
  return value;
}

function assertBudget(ledger: SpendLedger, cost: bigint, cap: bigint): void {
  if (cost > cap || totalSpendWei(ledger) + cost > BigInt(ledger.maxTotalSpendWei)) {
    fail('The planned PK-03B transaction exceeds the committed Sepolia allowance.');
  }
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
  writeFileSync(spendLedgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
}

function normalizedRuntimeTemplate(artifact: Artifact, runtime: Hex): Hex {
  let normalized = runtime.slice(2);
  for (const references of Object.values(artifact.immutableReferences ?? {})) {
    for (const { start, length } of references) {
      const offset = start * 2;
      const span = length * 2;
      if (length <= 0 || offset + span > normalized.length) {
        fail('Compiled immutable-reference metadata is invalid.');
      }
      normalized = `${normalized.slice(0, offset)}${'0'.repeat(span)}${normalized.slice(offset + span)}`;
    }
  }
  return `0x${normalized}` as Hex;
}

function assertRuntime(artifact: Artifact, runtime: Hex | undefined, name: string): void {
  if (
    !runtime ||
    normalizedRuntimeTemplate(artifact, runtime).toLowerCase() !==
      normalizedRuntimeTemplate(artifact, artifact.deployedBytecode).toLowerCase()
  ) {
    fail(`The deployed ${name} runtime does not match its compiled template.`);
  }
}

function parseAddressList(option: '--reuse=' | '--verify=', count: number): Address[] | undefined {
  const argument = process.argv.find((value) => value.startsWith(option));
  if (!argument) return undefined;
  const addresses = argument.slice(option.length).split(',');
  if (addresses.length !== count || addresses.some((address) => !isAddress(address))) {
    fail(`${option.slice(2, -1)} requires exactly ${count} valid contract addresses.`);
  }
  return addresses as Address[];
}

function withConfig(config: PoolConfig, changes: Partial<PoolConfig>): PoolConfig {
  return { ...config, ...changes };
}

async function expectRevert(action: () => Promise<unknown>, scenario: string): Promise<void> {
  try {
    await action();
  } catch {
    return;
  }
  fail(`${scenario} did not reject on Ethereum Sepolia.`);
}

function abiHasNoAuthorityOrCustodySurface(factory: Artifact, pool: Artifact): boolean {
  const forbidden = new Set([
    'owner',
    'admin',
    'upgradeTo',
    'upgradeToAndCall',
    'pause',
    'unpause',
    'sweep',
    'onConfidentialTransferReceived',
    'commitSignal',
    'closeEpoch',
    'settle',
    'claim',
    'refund',
  ]);
  for (const artifact of [factory, pool]) {
    for (const item of artifact.abi) {
      if (
        (item.type === 'function' && forbidden.has(item.name)) ||
        item.type === 'receive' ||
        item.type === 'fallback'
      ) {
        return false;
      }
    }
  }
  return true;
}

async function main(): Promise<void> {
  loadEnvironment();
  const write = process.argv.includes('--write');
  const reused = parseAddressList('--reuse=', 2);
  const verified = parseAddressList('--verify=', 3);
  if (reused && verified) fail('PK-03B cannot use resume and verify modes together.');
  if (verified && write) fail('PK-03B verify mode is read-only.');

  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY as Hex | undefined;
  if (!rpcUrl) fail('SEPOLIA_RPC_URL is required for the PK-03B runner.');
  if (write && (!privateKey || process.env.CONFIRM_SEPOLIA_WRITE !== CONFIRMATION_VALUE)) {
    fail('Confirmed PK-03B writes require a throwaway signer and CONFIRM_SEPOLIA_WRITE=yes.');
  }

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
  });
  if ((await publicClient.getChainId()) !== EXPECTED_CHAIN_ID) {
    fail('The configured RPC is not Ethereum Sepolia.');
  }
  const account = privateKey ? privateKeyToAccount(privateKey) : undefined;
  const caller = account?.address ?? '0x000000000000000000000000000000000000dEaD';
  if (write && (await publicClient.getBalance({ address: account!.address })) === 0n) {
    fail('The configured throwaway Sepolia wallet has no balance.');
  }

  failureStage = 'artifact and public dependency preflight';
  const artifacts = {
    adapter: loadArtifact(artifactPaths.adapter, 'adapter'),
    factory: loadArtifact(artifactPaths.factory, 'factory'),
    pool: loadArtifact(artifactPaths.pool, 'pool'),
  };
  if (!abiHasNoAuthorityOrCustodySurface(artifacts.factory, artifacts.pool)) {
    fail('The PK-03B ABI unexpectedly exposes authority, custody, or lifecycle behavior.');
  }
  const [block, targetRuntime, wrapperRuntime, supportsERC7984] = await Promise.all([
    publicClient.getBlock(),
    publicClient.getCode({ address: ETH_USD_FEED }),
    publicClient.getCode({ address: ERC7984_WRAPPER }),
    publicClient.readContract({
      address: ERC7984_WRAPPER,
      abi: erc165Abi,
      functionName: 'supportsInterface',
      args: [ERC7984_INTERFACE_ID],
    }),
  ]);
  if (!targetRuntime || !wrapperRuntime || !supportsERC7984) {
    fail('The pinned Sepolia feed or ERC-7984 collateral dependency is unavailable.');
  }
  if (keccak256(wrapperRuntime).toLowerCase() !== EXPECTED_WRAPPER_RUNTIME_HASH.toLowerCase()) {
    fail('The pinned ERC-7984 wrapper runtime changed since G2.');
  }

  const ledger = loadLedger();
  const cap = singleTransactionCapWei(ledger);
  const maxFeePerGas =
    (await publicClient.estimateFeesPerGas()).maxFeePerGas ?? (await publicClient.getGasPrice());
  const freshObservation = block.timestamp + OBSERVATION_DELAY;
  let adapter: Deployment | undefined;
  let factory: Deployment | undefined;
  let pool: Deployment | undefined;
  if (verified) {
    [adapter, factory, pool] = verified.map((address) => ({
      address,
      transactionHash: null,
      blockNumber: null,
    }));
  } else if (reused) {
    [adapter, factory] = reused.map((address) => ({
      address,
      transactionHash: null,
      blockNumber: null,
    }));
  }

  let observationNotBefore = freshObservation;
  if (adapter) {
    const runtime = await publicClient.getCode({ address: adapter.address });
    assertRuntime(artifacts.adapter, runtime, 'adapter');
    observationNotBefore = (await publicClient.readContract({
      address: adapter.address,
      abi: artifacts.adapter.abi,
      functionName: 'observationNotBefore',
    } as never)) as bigint;
  }
  const deadline = observationNotBefore - (OBSERVATION_DELAY - DEADLINE_LEAD);
  if (deadline <= block.timestamp) {
    fail('The resumed adapter no longer leaves enough time for a valid pool deadline.');
  }
  const config: PoolConfig = {
    confidentialCollateral: ERC7984_WRAPPER,
    resolutionAdapter: adapter?.address ?? ETH_USD_FEED,
    deadline,
    commitTimeout: COMMIT_TIMEOUT,
    kMin: 2,
    aggregateTimeout: AGGREGATE_TIMEOUT,
    resolutionGrace: RESOLUTION_GRACE,
  };

  const adapterDeployData = encodeDeployData({
    abi: artifacts.adapter.abi,
    bytecode: artifacts.adapter.bytecode,
    args: [ETH_USD_FEED, true, 1n, freshObservation, MAXIMUM_FEED_AGE],
  });
  const factoryDeployData = encodeDeployData({
    abi: artifacts.factory.abi,
    bytecode: artifacts.factory.bytecode,
  });
  const deploymentPlans: { purpose: string; data: Hex; gas: bigint; maximumCostWei: bigint }[] = [];
  if (!adapter) {
    const gas = await publicClient.estimateGas({
      account: account?.address,
      data: adapterDeployData,
    });
    const maximumCostWei = gas * maxFeePerGas;
    assertBudget(ledger, maximumCostWei, cap);
    deploymentPlans.push({
      purpose: 'fresh immutable adapter',
      data: adapterDeployData,
      gas,
      maximumCostWei,
    });
  }
  if (!factory) {
    const gas = await publicClient.estimateGas({
      account: account?.address,
      data: factoryDeployData,
    });
    const maximumCostWei = gas * maxFeePerGas;
    assertBudget(ledger, maximumCostWei, cap);
    deploymentPlans.push({
      purpose: 'permissionless factory',
      data: factoryDeployData,
      gas,
      maximumCostWei,
    });
  }
  const dryRunCreateCost = CREATE_POOL_DRY_RUN_GAS_CEILING * maxFeePerGas;
  assertBudget(ledger, dryRunCreateCost, cap);
  const plannedMaximum =
    deploymentPlans.reduce((total, plan) => total + plan.maximumCostWei, 0n) +
    (pool ? 0n : dryRunCreateCost);
  if (totalSpendWei(ledger) + plannedMaximum > BigInt(ledger.maxTotalSpendWei)) {
    fail('The complete PK-03B plan exceeds the committed Sepolia allowance.');
  }
  console.log(
    JSON.stringify({
      mode: write ? 'confirmed-write' : verified ? 'verification-only' : 'dry-run',
      workItem: 'PK-03B',
      target: ETH_USD_FEED,
      collateral: ERC7984_WRAPPER,
      reused: reused !== undefined,
      verificationOnly: verified !== undefined,
      estimatedMaximumTotalGasCostWei: plannedMaximum.toString(),
      remainingAllowanceWei: (BigInt(ledger.maxTotalSpendWei) - totalSpendWei(ledger)).toString(),
      actions: [
        ...deploymentPlans.map((plan) => ({
          purpose: plan.purpose,
          estimatedMaximumGasCostWei: plan.maximumCostWei.toString(),
        })),
        ...(pool
          ? []
          : [
              {
                purpose: 'deterministic pool creation',
                estimatedMaximumGasCostWei: dryRunCreateCost.toString(),
                estimateKind: 'pre-deployment ceiling',
              },
            ]),
      ],
    }),
  );
  if (!write && !verified) return;
  assertCleanSourceTree();

  const receipts: ReceiptSummary[] = [];
  if (write) {
    const walletClient = createWalletClient({
      account: account!,
      chain: sepolia,
      transport: http(rpcUrl),
    });
    for (const plan of deploymentPlans) {
      failureStage = `${plan.purpose} deployment`;
      const transactionHash = await walletClient.sendTransaction({
        account: account!,
        data: plan.data,
        gas: plan.gas,
        maxFeePerGas,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
      appendSpend(ledger, {
        workItemId: 'PK-03B',
        phase: 'P1',
        sender: account!.address,
        transactionHash,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.effectiveGasPrice.toString(),
        actualGasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
      });
      if (receipt.status !== 'success' || !receipt.contractAddress) {
        fail(`The ${plan.purpose} deployment did not succeed.`);
      }
      receipts.push({
        purpose: plan.purpose,
        transactionHash,
        blockNumber: receipt.blockNumber.toString(),
      });
      if (plan.purpose === 'fresh immutable adapter') {
        adapter = {
          address: receipt.contractAddress,
          transactionHash,
          blockNumber: receipt.blockNumber,
        };
        config.resolutionAdapter = receipt.contractAddress;
        assertRuntime(
          artifacts.adapter,
          await publicClient.getCode({ address: receipt.contractAddress }),
          'adapter',
        );
      } else {
        factory = {
          address: receipt.contractAddress,
          transactionHash,
          blockNumber: receipt.blockNumber,
        };
        assertRuntime(
          artifacts.factory,
          await publicClient.getCode({ address: receipt.contractAddress }),
          'factory',
        );
      }
    }

    failureStage = 'deterministic pool creation';
    const poolGas = await publicClient.estimateContractGas({
      account: account!,
      address: factory!.address,
      abi: artifacts.factory.abi,
      functionName: 'createPool',
      args: [config, DEPLOYMENT_SALT],
    } as never);
    const maximumPoolCost = poolGas * maxFeePerGas;
    assertBudget(ledger, maximumPoolCost, cap);
    const transactionHash = await walletClient.writeContract({
      account: account!,
      address: factory!.address,
      abi: artifacts.factory.abi,
      functionName: 'createPool',
      args: [config, DEPLOYMENT_SALT],
      gas: poolGas,
      maxFeePerGas,
    } as never);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
    appendSpend(ledger, {
      workItemId: 'PK-03B',
      phase: 'P1',
      sender: account!.address,
      transactionHash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice.toString(),
      actualGasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
    });
    if (receipt.status !== 'success') fail('The deterministic pool creation did not succeed.');
    receipts.push({
      purpose: 'deterministic pool creation',
      transactionHash,
      blockNumber: receipt.blockNumber.toString(),
    });
  }

  failureStage = 'factory and pool verification';
  if (!adapter || !factory) fail('PK-03B is missing an adapter or factory deployment.');
  const verifiedAdapter = adapter;
  const verifiedFactory = factory;
  const [adapterRuntime, factoryRuntime, liveTargetHash, adapterTarget, storedTargetHash] =
    await Promise.all([
      publicClient.getCode({ address: verifiedAdapter.address }),
      publicClient.getCode({ address: verifiedFactory.address }),
      Promise.resolve(keccak256(targetRuntime)),
      publicClient.readContract({
        address: verifiedAdapter.address,
        abi: artifacts.adapter.abi,
        functionName: 'target',
      } as never),
      publicClient.readContract({
        address: verifiedAdapter.address,
        abi: artifacts.adapter.abi,
        functionName: 'targetRuntimeCodeHash',
      } as never),
    ]);
  assertRuntime(artifacts.adapter, adapterRuntime, 'adapter');
  assertRuntime(artifacts.factory, factoryRuntime, 'factory');
  if (
    (adapterTarget as Address).toLowerCase() !== ETH_USD_FEED.toLowerCase() ||
    (storedTargetHash as Hex).toLowerCase() !== liveTargetHash.toLowerCase()
  ) {
    fail('The adapter no longer matches the unchanged public target runtime.');
  }

  const poolId = (await publicClient.readContract({
    address: verifiedFactory.address,
    abi: artifacts.factory.abi,
    functionName: 'poolIdFor',
    args: [config, DEPLOYMENT_SALT],
  } as never)) as Hash;
  const mappedPool = (await publicClient.readContract({
    address: verifiedFactory.address,
    abi: artifacts.factory.abi,
    functionName: 'poolOf',
    args: [poolId],
  } as never)) as Address;
  if (pool && pool.address.toLowerCase() !== mappedPool.toLowerCase()) {
    fail('The verified pool address does not match the factory mapping.');
  }
  pool = {
    address: mappedPool,
    transactionHash: pool?.transactionHash ?? null,
    blockNumber: pool?.blockNumber ?? null,
  };
  const poolInitData = encodeDeployData({
    abi: artifacts.pool.abi,
    bytecode: artifacts.pool.bytecode,
    args: [poolId, config],
  });
  const predictedPool = getCreate2Address({
    from: verifiedFactory.address,
    salt: poolId,
    bytecodeHash: keccak256(poolInitData),
  });
  if (predictedPool.toLowerCase() !== pool.address.toLowerCase()) {
    fail('The pool address does not match its deterministic CREATE2 derivation.');
  }
  const poolRuntime = await publicClient.getCode({ address: pool.address });
  assertRuntime(artifacts.pool, poolRuntime, 'pool');

  const [storedPoolId, storedConfig, epoch, factoryBalance, poolBalance, adapterBalance] =
    await Promise.all([
      publicClient.readContract({
        address: pool.address,
        abi: artifacts.pool.abi,
        functionName: 'poolId',
      } as never),
      publicClient.readContract({
        address: pool.address,
        abi: artifacts.pool.abi,
        functionName: 'config',
      } as never),
      publicClient.readContract({
        address: pool.address,
        abi: artifacts.pool.abi,
        functionName: 'epoch',
      } as never),
      publicClient.getBalance({ address: verifiedFactory.address }),
      publicClient.getBalance({ address: pool.address }),
      publicClient.getBalance({ address: verifiedAdapter.address }),
    ]);
  const stored = storedConfig as PoolConfig;
  const publicEpoch = epoch as {
    state: number;
    winner: number;
    deadline: bigint;
    participantCount: number;
    aggregateRequestId: Hex;
    aggregatePendingAt: bigint;
    resolutionPendingAt: bigint;
    publicYes: bigint;
    publicNo: bigint;
    settledRoundId: bigint;
    settledAnswer: bigint;
  };
  if (
    (storedPoolId as Hex).toLowerCase() !== poolId.toLowerCase() ||
    stored.confidentialCollateral.toLowerCase() !== config.confidentialCollateral.toLowerCase() ||
    stored.resolutionAdapter.toLowerCase() !== config.resolutionAdapter.toLowerCase() ||
    stored.deadline !== config.deadline ||
    stored.commitTimeout !== config.commitTimeout ||
    Number(stored.kMin) !== config.kMin ||
    stored.aggregateTimeout !== config.aggregateTimeout ||
    stored.resolutionGrace !== config.resolutionGrace ||
    publicEpoch.state !== 0 ||
    publicEpoch.winner !== 0 ||
    publicEpoch.deadline !== config.deadline ||
    Number(publicEpoch.participantCount) !== 0 ||
    publicEpoch.aggregateRequestId !== `0x${'0'.repeat(64)}` ||
    publicEpoch.aggregatePendingAt !== 0n ||
    publicEpoch.resolutionPendingAt !== 0n ||
    publicEpoch.publicYes !== 0n ||
    publicEpoch.publicNo !== 0n ||
    publicEpoch.settledRoundId !== 0n ||
    publicEpoch.settledAnswer !== 0n
  ) {
    fail('The deployed pool configuration or initial OPEN epoch is incorrect.');
  }
  if (factoryBalance !== 0n || poolBalance !== 0n || adapterBalance !== 0n) {
    fail('A PK-03B contract unexpectedly holds native value.');
  }

  const simulateCreate = (candidate: PoolConfig, salt: Hex) =>
    publicClient.simulateContract({
      account: caller,
      address: verifiedFactory.address,
      abi: artifacts.factory.abi,
      functionName: 'createPool',
      args: [candidate, salt],
    } as never);
  const differentSalt = keccak256(toHex('QuietSignal PK-03B duplicate config v1'));
  await Promise.all([
    expectRevert(
      () =>
        simulateCreate(
          withConfig(config, {
            confidentialCollateral: '0x0000000000000000000000000000000000000000',
          }),
          differentSalt,
        ),
      'Zero collateral',
    ),
    expectRevert(
      () => simulateCreate(withConfig(config, { confidentialCollateral: caller }), differentSalt),
      'EOA collateral',
    ),
    expectRevert(
      () =>
        simulateCreate(withConfig(config, { confidentialCollateral: ETH_USD_FEED }), differentSalt),
      'Non-ERC-7984 collateral',
    ),
    expectRevert(
      () =>
        simulateCreate(
          withConfig(config, { resolutionAdapter: '0x0000000000000000000000000000000000000000' }),
          differentSalt,
        ),
      'Zero adapter',
    ),
    expectRevert(
      () => simulateCreate(withConfig(config, { resolutionAdapter: caller }), differentSalt),
      'EOA adapter',
    ),
    expectRevert(
      () => simulateCreate(withConfig(config, { resolutionAdapter: ETH_USD_FEED }), differentSalt),
      'Incompatible adapter metadata',
    ),
    expectRevert(
      () => simulateCreate(withConfig(config, { deadline: block.timestamp }), differentSalt),
      'Past deadline',
    ),
    expectRevert(() => simulateCreate(withConfig(config, { kMin: 0 }), differentSalt), 'Zero k'),
    expectRevert(
      () => simulateCreate(withConfig(config, { aggregateTimeout: 0n }), differentSalt),
      'Zero aggregate timeout',
    ),
    expectRevert(
      () => simulateCreate(withConfig(config, { commitTimeout: 0n }), differentSalt),
      'Zero commit timeout',
    ),
    expectRevert(
      () => simulateCreate(withConfig(config, { resolutionGrace: 0n }), differentSalt),
      'Zero resolution grace',
    ),
    expectRevert(
      () =>
        simulateCreate(withConfig(config, { deadline: observationNotBefore + 1n }), differentSalt),
      'Deadline after adapter observation',
    ),
    expectRevert(() => simulateCreate(config, differentSalt), 'Duplicate configuration'),
    expectRevert(
      () => simulateCreate(withConfig(config, { kMin: config.kMin + 1 }), DEPLOYMENT_SALT),
      'Reused deployment salt',
    ),
    expectRevert(
      () =>
        publicClient.call({
          account: caller,
          to: verifiedFactory.address,
          data: encodeFunctionData({
            abi: artifacts.factory.abi,
            functionName: 'createPool',
            args: [config, differentSalt],
          } as never),
          value: 1n,
        }),
      'Native value at factory boundary',
    ),
    expectRevert(
      () => publicClient.call({ account: caller, to: pool!.address, value: 1n }),
      'Native value at pool boundary',
    ),
  ]);

  const verificationBlock = await publicClient.getBlockNumber();
  const evidence = {
    schemaVersion: 1,
    gate: 'G5',
    workItem: 'PK-03B',
    phase: 'P1',
    timestampUtc: new Date().toISOString(),
    sourceCommit: sourceCommit(),
    environment: { class: 'sepolia-write-and-read', chainId: EXPECTED_CHAIN_ID },
    verificationBlock: verificationBlock.toString(),
    dependencies: {
      collateral: { address: ERC7984_WRAPPER, runtimeCodeHash: keccak256(wrapperRuntime) },
      target: { address: ETH_USD_FEED, runtimeCodeHash: liveTargetHash },
    },
    contracts: {
      adapter: {
        address: verifiedAdapter.address,
        runtimeTemplateHash: keccak256(
          normalizedRuntimeTemplate(artifacts.adapter, adapterRuntime!),
        ),
      },
      factory: { address: verifiedFactory.address, runtimeCodeHash: keccak256(factoryRuntime!) },
      pool: {
        address: pool.address,
        runtimeTemplateHash: keccak256(normalizedRuntimeTemplate(artifacts.pool, poolRuntime!)),
      },
    },
    immutableConfiguration: {
      poolId,
      deploymentSalt: DEPLOYMENT_SALT,
      deadline: config.deadline.toString(),
      commitTimeout: config.commitTimeout.toString(),
      kMin: config.kMin,
      aggregateTimeout: config.aggregateTimeout.toString(),
      resolutionGrace: config.resolutionGrace.toString(),
      observationNotBefore: observationNotBefore.toString(),
    },
    transactions: receipts,
    checks: {
      permissionlessCreate2Deployment: true,
      deterministicPoolIdAndAddress: true,
      uniqueConfigurationAndSalt: true,
      validPinnedERC7984Collateral: true,
      invalidCollateralRejected: true,
      validImmutableAdapterMetadata: true,
      invalidAdapterRejected: true,
      liveTargetRuntimeMatchesStoredHash: true,
      invalidTimingAndThresholdsRejected: true,
      initialOpenEpochOnly: true,
      noAuthorityUpgradeCustodyOrLifecycleAbi: true,
      nativeValueRejected: true,
      zeroNativeBalances: true,
      noConfidentialTransferOrCallbackExecuted: true,
    },
    privacyImpact:
      'No confidential inputs, handles, proofs, ACL operations, or token transfers occurred.',
    fundsLocation: 'No native or confidential asset entered the adapter, factory, or pool shell.',
    limitations: [
      'This component proves immutable deployment only and does not pass G5.',
      'Canonical target bytecode cannot be mutated for a negative test without a mock; both factory and adapter instead recheck the live runtime hash, and incompatible live metadata is rejected.',
      'Confidential custody and lifecycle behavior remain unimplemented until PK-04 through PK-07.',
    ],
    reproduction: {
      command: `npm run test:factory:sepolia -- --verify=${verifiedAdapter.address},${verifiedFactory.address},${pool.address}`,
      requiredChainId: EXPECTED_CHAIN_ID,
    },
    status: 'passed',
  };
  if (verified) {
    console.log(JSON.stringify({ workItem: 'PK-03B', pool: pool.address, status: 'passed' }));
    return;
  }
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  mkdirSync(dirname(offlineEvidencePath), { recursive: true });
  mkdirSync(dirname(sepoliaEvidencePath), { recursive: true });
  writeFileSync(offlineEvidencePath, serialized);
  writeFileSync(sepoliaEvidencePath, serialized);
  console.log(JSON.stringify({ workItem: 'PK-03B', pool: pool.address, status: 'passed' }));
}

main().catch(() => {
  console.error(`PK-03B factory run failed during ${failureStage}.`);
  process.exitCode = 1;
});
