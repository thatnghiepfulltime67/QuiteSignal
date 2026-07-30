import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  http,
  keccak256,
  parseAbi,
  type Abi,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const EXPECTED_CHAIN_ID = 11_155_111;
const CONFIRMATION_VALUE = 'yes';
const ETH_USD_FEED = '0x694AA1769357215DE4FAC081bf1f309aDC325306' as const;
const EXPECTED_DECIMALS = 8;
const EXPECTED_DESCRIPTION = 'ETH / USD';
const MAX_INT256 = (1n << 255n) - 1n;

const feedAbi = parseAbi([
  'function decimals() view returns (uint8)',
  'function description() view returns (string)',
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
]);

interface Artifact {
  abi: Abi;
  bytecode: Hex;
  deployedBytecode: Hex;
}

interface SpendEntry {
  workItemId: string;
  phase: string;
  sourceCommit: string;
  sender: Address;
  transactionHash: Hex;
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

interface DeployedSpike {
  name: 'yes' | 'no' | 'stale' | 'future';
  address: Address;
  deploymentHash: Hex;
  blockNumber: bigint;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const protocolRoot = resolve(scriptDirectory, '../..');
const repositoryRoot = resolve(protocolRoot, '../..');
const artifactPath = resolve(
  protocolRoot,
  'artifacts/contracts/feasibility/PriceFeedResolutionSpike.sol/PriceFeedResolutionSpike.json',
);
const spendLedgerPath = resolve(repositoryRoot, 'evidence/sepolia/spend-ledger.json');
const offlineEvidencePath = resolve(repositoryRoot, 'evidence/offline/G4/FND-06-RESOLUTION.json');
const sepoliaEvidencePath = resolve(repositoryRoot, 'evidence/sepolia/G4/FND-06-RESOLUTION.json');

function fail(message: string): never {
  throw new Error(message);
}

function loadEnvironment(): void {
  const environmentPath = resolve(repositoryRoot, '.env');
  if (existsSync(environmentPath)) process.loadEnvFile(environmentPath);
}

function loadArtifact(): Artifact {
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as Partial<Artifact>;
  if (
    !Array.isArray(artifact.abi) ||
    typeof artifact.bytecode !== 'string' ||
    typeof artifact.deployedBytecode !== 'string'
  ) {
    fail('The compiled G4 resolution spike artifact is unavailable or malformed.');
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

function totalSpendWei(ledger: SpendLedger): bigint {
  return ledger.entries.reduce((total, entry) => total + BigInt(entry.actualGasCostWei), 0n);
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
  if (status.length > 0) fail('Sepolia writes require a clean source tree.');
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

function configuredSingleTransactionCapWei(ledger: SpendLedger): bigint {
  const value = process.env.SEPOLIA_MAX_SINGLE_TX_ETH;
  if (!value) return BigInt(ledger.maxTotalSpendWei);
  if (!/^\d+(?:\.\d{1,18})?$/.test(value)) {
    fail('The configured single-transaction Sepolia gas cap is malformed.');
  }
  const [whole, fraction = ''] = value.split('.');
  const cap = BigInt(`${whole}${fraction.padEnd(18, '0')}`);
  if (cap === 0n || cap > BigInt(ledger.maxTotalSpendWei)) {
    fail('The configured single-transaction gas cap is outside the allowed range.');
  }
  return cap;
}

function assertBudget(ledger: SpendLedger, maximumCostWei: bigint, singleCapWei: bigint): void {
  if (maximumCostWei > singleCapWei) {
    fail('A planned G4 deployment exceeds the configured single-transaction allowance.');
  }
  if (totalSpendWei(ledger) + maximumCostWei > BigInt(ledger.maxTotalSpendWei)) {
    fail('A planned G4 deployment exceeds the committed cumulative allowance.');
  }
}

async function expectRevert(call: () => Promise<unknown>, scenario: string): Promise<void> {
  try {
    await call();
  } catch {
    return;
  }
  fail(`${scenario} did not reject on Ethereum Sepolia.`);
}

async function main(): Promise<void> {
  loadEnvironment();
  const write = process.argv.includes('--write');
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY as Hex | undefined;
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) fail('SEPOLIA_RPC_URL is required for the G4 resolution runner.');
  if (write && !privateKey)
    fail('A throwaway Sepolia signer is required for a confirmed G4 write.');
  if (write && process.env.CONFIRM_SEPOLIA_WRITE !== CONFIRMATION_VALUE) {
    fail('Set CONFIRM_SEPOLIA_WRITE=yes only after reviewing the G4 dry-run plan.');
  }

  const publicClient = createPublicClient({
    cacheTime: 0,
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
  });
  if ((await publicClient.getChainId()) !== EXPECTED_CHAIN_ID) {
    fail('The configured RPC is not Ethereum Sepolia.');
  }

  const [runtime, decimals, description, round, block, verificationBlock] = await Promise.all([
    publicClient.getCode({ address: ETH_USD_FEED }),
    publicClient.readContract({ address: ETH_USD_FEED, abi: feedAbi, functionName: 'decimals' }),
    publicClient.readContract({ address: ETH_USD_FEED, abi: feedAbi, functionName: 'description' }),
    publicClient.readContract({
      address: ETH_USD_FEED,
      abi: feedAbi,
      functionName: 'latestRoundData',
    }),
    publicClient.getBlock(),
    publicClient.getBlockNumber(),
  ]);
  if (!runtime) fail('The selected Sepolia ETH/USD feed has no runtime code.');
  if (decimals !== EXPECTED_DECIMALS || description !== EXPECTED_DESCRIPTION) {
    fail('The selected Sepolia feed metadata does not match the immutable target policy.');
  }
  const [roundId, answer, startedAt, updatedAt, answeredInRound] = round;
  if (
    roundId === 0n ||
    answer <= 0n ||
    startedAt === 0n ||
    updatedAt === 0n ||
    answeredInRound < roundId ||
    updatedAt > block.timestamp
  ) {
    fail('The selected Sepolia feed has an invalid current round.');
  }

  const artifact = loadArtifact();
  const ledger = loadLedger();
  const account = privateKey ? privateKeyToAccount(privateKey) : undefined;
  if (write && !account) fail('The confirmed G4 write account is unavailable.');
  if (write && (await publicClient.getBalance({ address: account!.address })) === 0n) {
    fail('The configured throwaway Sepolia wallet has no balance.');
  }
  const maxFeePerGas =
    (await publicClient.estimateFeesPerGas()).maxFeePerGas ?? (await publicClient.getGasPrice());
  const singleCapWei = configuredSingleTransactionCapWei(ledger);
  const configurations = [
    {
      name: 'yes' as const,
      greaterOrEqual: true,
      threshold: 1n,
      observationNotBefore: block.timestamp,
      maximumFeedAge: 3_600n,
    },
    {
      name: 'no' as const,
      greaterOrEqual: true,
      threshold: MAX_INT256,
      observationNotBefore: block.timestamp,
      maximumFeedAge: 3_600n,
    },
    {
      name: 'stale' as const,
      greaterOrEqual: true,
      threshold: 1n,
      observationNotBefore: block.timestamp,
      maximumFeedAge: 1n,
    },
    {
      name: 'future' as const,
      greaterOrEqual: true,
      threshold: 1n,
      observationNotBefore: block.timestamp + 3_600n,
      maximumFeedAge: 3_600n,
    },
  ];

  const plans = await Promise.all(
    configurations.map(async (configuration) => {
      const data = encodeDeployData({
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        args: [
          ETH_USD_FEED,
          configuration.greaterOrEqual,
          configuration.threshold,
          configuration.observationNotBefore,
          configuration.maximumFeedAge,
        ],
      });
      const gas = await publicClient.estimateGas({ account: account?.address, data });
      const maximumCostWei = gas * maxFeePerGas;
      assertBudget(ledger, maximumCostWei, singleCapWei);
      return { ...configuration, data, gas, maximumCostWei };
    }),
  );
  const plannedCostWei = plans.reduce((total, plan) => total + plan.maximumCostWei, 0n);
  if (totalSpendWei(ledger) + plannedCostWei > BigInt(ledger.maxTotalSpendWei)) {
    fail('The complete G4 plan exceeds the committed cumulative allowance.');
  }

  console.log(
    JSON.stringify({
      mode: write ? 'confirmed-write' : 'dry-run',
      workItem: 'FND-06B',
      actions: plans.map((plan) => ({
        name: plan.name,
        estimatedMaximumGasCostWei: plan.maximumCostWei.toString(),
      })),
      estimatedMaximumTotalGasCostWei: plannedCostWei.toString(),
      singleTransactionCapWei: singleCapWei.toString(),
      remainingAllowanceWei: (BigInt(ledger.maxTotalSpendWei) - totalSpendWei(ledger)).toString(),
      target: ETH_USD_FEED,
      verificationBlock: verificationBlock.toString(),
    }),
  );
  if (!write) return;

  assertCleanSourceTree();
  const walletClient = createWalletClient({
    account: account!,
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
  });
  const deployed: DeployedSpike[] = [];
  for (const plan of plans) {
    const deploymentHash = await walletClient.sendTransaction({
      account: account!,
      data: plan.data,
      gas: plan.gas,
      maxFeePerGas,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: deploymentHash });
    appendSpend(ledger, {
      workItemId: 'FND-06B',
      phase: 'P0',
      sender: account!.address,
      transactionHash: deploymentHash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice.toString(),
      actualGasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
    });
    if (receipt.status !== 'success' || !receipt.contractAddress) {
      fail(`The ${plan.name} G4 spike deployment did not succeed.`);
    }
    const deployedRuntime = await publicClient.getCode({ address: receipt.contractAddress });
    if (
      !deployedRuntime ||
      deployedRuntime.toLowerCase() !== artifact.deployedBytecode.toLowerCase()
    ) {
      fail(`The ${plan.name} G4 spike runtime does not match the compiled artifact.`);
    }
    deployed.push({
      name: plan.name,
      address: receipt.contractAddress,
      deploymentHash,
      blockNumber: receipt.blockNumber,
    });
  }

  const byName = Object.fromEntries(deployed.map((entry) => [entry.name, entry])) as Record<
    DeployedSpike['name'],
    DeployedSpike
  >;
  const resolve = async (spike: DeployedSpike) =>
    (await publicClient.readContract({
      address: spike.address,
      abi: artifact.abi,
      functionName: 'resolution',
    } as never)) as readonly [boolean, bigint, bigint, bigint];
  const [yes, no] = await Promise.all([resolve(byName.yes), resolve(byName.no)]);
  if (!yes[0] || no[0])
    fail('The immutable G4 threshold configurations did not produce both results.');
  if (yes[1] <= 0n || no[1] <= 0n || yes[2] === 0n || no[2] === 0n) {
    fail('The successful G4 resolution responses are incomplete.');
  }

  await expectRevert(() => resolve(byName.stale), 'Stale feed round');
  await expectRevert(() => resolve(byName.future), 'Premature observation');
  await expectRevert(
    () => publicClient.call({ account: account!.address, to: byName.yes.address, value: 1n }),
    'Value transfer to zero-custody adapter',
  );
  for (const spike of deployed) {
    if ((await publicClient.getBalance({ address: spike.address })) !== 0n) {
      fail(`The ${spike.name} G4 spike retained a balance.`);
    }
  }

  const artifactRuntimeHash = keccak256(artifact.deployedBytecode);
  const evidence = {
    schemaVersion: 1,
    workItem: 'FND-06B',
    gate: 'G4',
    chainId: EXPECTED_CHAIN_ID,
    sourceCommit: sourceCommit(),
    verificationBlock: (await publicClient.getBlockNumber()).toString(),
    target: {
      address: ETH_USD_FEED,
      decimals,
      description,
      runtimeBytecodeHash: keccak256(runtime),
    },
    latestRoundAtPlan: {
      roundId: roundId.toString(),
      answer: answer.toString(),
      startedAt: startedAt.toString(),
      updatedAt: updatedAt.toString(),
      answeredInRound: answeredInRound.toString(),
      ageSeconds: (block.timestamp - updatedAt).toString(),
    },
    spikeRuntimeBytecodeHash: artifactRuntimeHash,
    deployments: deployed.map((spike) => ({
      name: spike.name,
      address: spike.address,
      deploymentHash: spike.deploymentHash,
      blockNumber: spike.blockNumber.toString(),
    })),
    checks: {
      targetRuntime: true,
      expectedMetadata: true,
      validRound: true,
      yesThreshold: true,
      noThreshold: true,
      staleRoundRejected: true,
      prematureObservationRejected: true,
      valueTransferRejected: true,
      zeroCustodyBalances: true,
    },
    status: 'passed',
  };
  const serializedEvidence = `${JSON.stringify(evidence, null, 2)}\n`;
  writeFileSync(offlineEvidencePath, serializedEvidence);
  writeFileSync(sepoliaEvidencePath, serializedEvidence);
  console.log(
    JSON.stringify({
      workItem: 'FND-06B',
      deployments: deployed.length,
      status: 'passed',
      verificationBlock: evidence.verificationBlock,
    }),
  );
}

main().catch(() => {
  console.error('G4 resolution spike failed at a sanitized validation stage.');
  process.exitCode = 1;
});
