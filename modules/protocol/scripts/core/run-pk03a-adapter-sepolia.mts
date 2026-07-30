import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  http,
  isAddress,
  keccak256,
  parseAbi,
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
const VALID_FEED_AGE = 30n * 24n * 60n * 60n;
const MAX_INT256 = (1n << 255n) - 1n;

const feedAbi = parseAbi([
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
]);

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

interface Plan {
  name: 'yes' | 'no' | 'stale' | 'premature';
  threshold: bigint;
  observationNotBefore: bigint;
  maximumFeedAge: bigint;
  data: Hex;
  gas: bigint;
  maximumCostWei: bigint;
}

interface Deployment {
  name: Plan['name'];
  address: Address;
  transactionHash: Hash | null;
  blockNumber: bigint | null;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const protocolRoot = resolve(scriptDirectory, '../..');
const repositoryRoot = resolve(protocolRoot, '../..');
const artifactPath = resolve(
  protocolRoot,
  'artifacts/contracts/adapters/ChainlinkPriceFeedResolutionAdapter.sol/ChainlinkPriceFeedResolutionAdapter.json',
);
const spendLedgerPath = resolve(repositoryRoot, 'evidence/sepolia/spend-ledger.json');
const offlineEvidencePath = resolve(repositoryRoot, 'evidence/offline/G5/PK-03A-ADAPTER.json');
const sepoliaEvidencePath = resolve(repositoryRoot, 'evidence/sepolia/G5/PK-03A-ADAPTER.json');
let failureStage = 'configuration';

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
    fail('The compiled PK-03A adapter artifact is unavailable or malformed.');
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
  if (status.length > 0) fail('Confirmed Sepolia writes require a clean source tree.');
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
    fail('The planned PK-03A transaction exceeds the committed Sepolia allowance.');
  }
}

function normalizedRuntimeTemplate(artifact: Artifact, runtime: Hex): Hex {
  let normalized = runtime.slice(2);
  for (const references of Object.values(artifact.immutableReferences ?? {})) {
    for (const { start, length } of references) {
      const offset = start * 2;
      const span = length * 2;
      if (length <= 0 || offset + span > normalized.length) {
        fail('The compiled adapter immutable-reference metadata is invalid.');
      }
      normalized = `${normalized.slice(0, offset)}${'0'.repeat(span)}${normalized.slice(offset + span)}`;
    }
  }
  return `0x${normalized}` as Hex;
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

function reusedDeployments(): Deployment[] | undefined {
  const argument = process.argv.find((value) => value.startsWith('--reuse='));
  if (!argument) return undefined;
  const addresses = argument.slice('--reuse='.length).split(',');
  if (addresses.length !== 2 || addresses.some((address) => !isAddress(address))) {
    fail('The PK-03A resume option requires exactly two valid yes,no adapter addresses.');
  }
  return [
    { name: 'yes', address: addresses[0] as Address, transactionHash: null, blockNumber: null },
    { name: 'no', address: addresses[1] as Address, transactionHash: null, blockNumber: null },
  ];
}

async function expectRevert(action: () => Promise<unknown>, scenario: string): Promise<void> {
  try {
    await action();
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
  if (!rpcUrl) fail('SEPOLIA_RPC_URL is required for the PK-03A runner.');
  if (write && (!privateKey || process.env.CONFIRM_SEPOLIA_WRITE !== CONFIRMATION_VALUE)) {
    fail('Confirmed PK-03A writes require a throwaway signer and CONFIRM_SEPOLIA_WRITE=yes.');
  }

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
  });
  if ((await publicClient.getChainId()) !== EXPECTED_CHAIN_ID) {
    fail('The configured RPC is not Ethereum Sepolia.');
  }
  const account = privateKey ? privateKeyToAccount(privateKey) : undefined;
  if (write && (await publicClient.getBalance({ address: account!.address })) === 0n) {
    fail('The configured throwaway Sepolia wallet has no balance.');
  }

  failureStage = 'Chainlink target preflight';
  const [targetRuntime, round, block] = await Promise.all([
    publicClient.getCode({ address: ETH_USD_FEED }),
    publicClient.readContract({
      address: ETH_USD_FEED,
      abi: feedAbi,
      functionName: 'latestRoundData',
    }),
    publicClient.getBlock(),
  ]);
  if (!targetRuntime) fail('The selected Chainlink Sepolia target has no runtime code.');
  const [roundId, answer, startedAt, updatedAt, answeredInRound] = round;
  if (
    roundId === 0n ||
    answer <= 0n ||
    startedAt === 0n ||
    updatedAt === 0n ||
    answeredInRound < roundId ||
    updatedAt > block.timestamp ||
    block.timestamp - updatedAt > VALID_FEED_AGE
  ) {
    fail('The selected Chainlink Sepolia target does not have a valid fresh round.');
  }

  failureStage = 'artifact and negative-constructor validation';
  const artifact = loadArtifact();
  const ledger = loadLedger();
  const reused = reusedDeployments();
  const constructorArguments = (
    target: Address,
    threshold: bigint,
    observation: bigint,
    age: bigint,
  ) =>
    encodeDeployData({
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      args: [target, true, threshold, observation, age],
    });
  await expectRevert(
    () =>
      publicClient.call({
        account: account?.address,
        data: constructorArguments(
          '0x0000000000000000000000000000000000000000',
          1n,
          block.timestamp,
          VALID_FEED_AGE,
        ),
      }),
    'Zero target constructor',
  );
  await expectRevert(
    () =>
      publicClient.call({
        account: account?.address,
        data: constructorArguments(ETH_USD_FEED, 0n, block.timestamp, VALID_FEED_AGE),
      }),
    'Zero threshold constructor',
  );
  await expectRevert(
    () =>
      publicClient.call({
        account: account?.address,
        data: constructorArguments(ETH_USD_FEED, 1n, 0n, VALID_FEED_AGE),
      }),
    'Zero observation constructor',
  );
  await expectRevert(
    () =>
      publicClient.call({
        account: account?.address,
        data: constructorArguments(ETH_USD_FEED, 1n, block.timestamp, 0n),
      }),
    'Zero age constructor',
  );

  const cap = singleTransactionCapWei(ledger);
  const maxFeePerGas =
    (await publicClient.estimateFeesPerGas()).maxFeePerGas ?? (await publicClient.getGasPrice());
  const allDefinitions: Omit<Plan, 'data' | 'gas' | 'maximumCostWei'>[] = [
    {
      name: 'yes',
      threshold: 1n,
      observationNotBefore: block.timestamp,
      maximumFeedAge: VALID_FEED_AGE,
    },
    {
      name: 'no',
      threshold: MAX_INT256,
      observationNotBefore: block.timestamp,
      maximumFeedAge: VALID_FEED_AGE,
    },
    { name: 'stale', threshold: 1n, observationNotBefore: block.timestamp, maximumFeedAge: 1n },
    {
      name: 'premature',
      threshold: 1n,
      observationNotBefore: block.timestamp + 3_600n,
      maximumFeedAge: VALID_FEED_AGE,
    },
  ];
  const definitions = reused
    ? allDefinitions.filter(
        (definition) => definition.name === 'stale' || definition.name === 'premature',
      )
    : allDefinitions;
  if (reused) {
    failureStage = 'reused adapter validation';
    for (const deployment of reused) {
      const [runtime, target, targetHash, direction, threshold, observation, age, balance] =
        await Promise.all([
          publicClient.getCode({ address: deployment.address }),
          publicClient.readContract({
            address: deployment.address,
            abi: artifact.abi,
            functionName: 'target',
          } as never),
          publicClient.readContract({
            address: deployment.address,
            abi: artifact.abi,
            functionName: 'targetRuntimeCodeHash',
          } as never),
          publicClient.readContract({
            address: deployment.address,
            abi: artifact.abi,
            functionName: 'greaterOrEqual',
          } as never),
          publicClient.readContract({
            address: deployment.address,
            abi: artifact.abi,
            functionName: 'threshold',
          } as never),
          publicClient.readContract({
            address: deployment.address,
            abi: artifact.abi,
            functionName: 'observationNotBefore',
          } as never),
          publicClient.readContract({
            address: deployment.address,
            abi: artifact.abi,
            functionName: 'maximumFeedAge',
          } as never),
          publicClient.getBalance({ address: deployment.address }),
        ]);
      const expectedThreshold = deployment.name === 'yes' ? 1n : MAX_INT256;
      if (
        !runtime ||
        normalizedRuntimeTemplate(artifact, runtime).toLowerCase() !==
          normalizedRuntimeTemplate(artifact, artifact.deployedBytecode).toLowerCase() ||
        (target as Address).toLowerCase() !== ETH_USD_FEED.toLowerCase() ||
        (targetHash as Hex).toLowerCase() !== keccak256(targetRuntime).toLowerCase() ||
        direction !== true ||
        threshold !== expectedThreshold ||
        (observation as bigint) === 0n ||
        age !== VALID_FEED_AGE ||
        balance !== 0n
      ) {
        fail(
          `The reused ${deployment.name} adapter does not match the required immutable zero-custody configuration.`,
        );
      }
    }
  }
  failureStage = 'deployment planning';
  const plans: Plan[] = await Promise.all(
    definitions.map(async (definition) => {
      const data = constructorArguments(
        ETH_USD_FEED,
        definition.threshold,
        definition.observationNotBefore,
        definition.maximumFeedAge,
      );
      const gas = await publicClient.estimateGas({ account: account?.address, data });
      const maximumCostWei = gas * maxFeePerGas;
      assertBudget(ledger, maximumCostWei, cap);
      return { ...definition, data, gas, maximumCostWei };
    }),
  );
  const plannedCost = plans.reduce((total, plan) => total + plan.maximumCostWei, 0n);
  if (totalSpendWei(ledger) + plannedCost > BigInt(ledger.maxTotalSpendWei)) {
    fail('The complete PK-03A plan exceeds the committed Sepolia allowance.');
  }
  console.log(
    JSON.stringify({
      mode: write ? 'confirmed-write' : 'dry-run',
      workItem: 'PK-03A',
      target: ETH_USD_FEED,
      resumed: reused !== undefined,
      estimatedMaximumTotalGasCostWei: plannedCost.toString(),
      remainingAllowanceWei: (BigInt(ledger.maxTotalSpendWei) - totalSpendWei(ledger)).toString(),
      actions: plans.map((plan) => ({
        name: plan.name,
        estimatedMaximumGasCostWei: plan.maximumCostWei.toString(),
      })),
    }),
  );
  if (!write) return;

  assertCleanSourceTree();
  const walletClient = createWalletClient({
    account: account!,
    chain: sepolia,
    transport: http(rpcUrl),
  });
  const deployments: Deployment[] = [...(reused ?? [])];
  for (const plan of plans) {
    failureStage = `${plan.name} deployment`;
    const transactionHash = await walletClient.sendTransaction({
      account: account!,
      data: plan.data,
      gas: plan.gas,
      maxFeePerGas,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
    appendSpend(ledger, {
      workItemId: 'PK-03A',
      phase: 'P1',
      sender: account!.address,
      transactionHash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice.toString(),
      actualGasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
    });
    if (receipt.status !== 'success' || !receipt.contractAddress) {
      fail(`The ${plan.name} adapter deployment did not succeed.`);
    }
    const runtime = await publicClient.getCode({ address: receipt.contractAddress });
    if (
      !runtime ||
      normalizedRuntimeTemplate(artifact, runtime).toLowerCase() !==
        normalizedRuntimeTemplate(artifact, artifact.deployedBytecode).toLowerCase()
    ) {
      fail(`The ${plan.name} adapter runtime does not match its compiled template.`);
    }
    deployments.push({
      name: plan.name,
      address: receipt.contractAddress,
      transactionHash,
      blockNumber: receipt.blockNumber,
    });
  }

  failureStage = 'post-deployment resolution checks';
  const deployed = Object.fromEntries(deployments.map((entry) => [entry.name, entry])) as Record<
    Plan['name'],
    Deployment
  >;
  const resolve = async (deployment: Deployment) =>
    (await publicClient.readContract({
      address: deployment.address,
      abi: artifact.abi,
      functionName: 'resolution',
    } as never)) as readonly [number, bigint, bigint, bigint];
  const [yes, no] = await Promise.all([resolve(deployed.yes), resolve(deployed.no)]);
  if (yes[0] !== 1 || no[0] !== 2 || yes[1] === 0n || no[1] === 0n || yes[2] <= 0n || no[2] <= 0n) {
    fail('The deployed adapter did not return both complete immutable outcomes.');
  }
  await expectRevert(() => resolve(deployed.stale), 'Stale feed resolution');
  await expectRevert(() => resolve(deployed.premature), 'Premature feed resolution');
  await expectRevert(
    () => publicClient.call({ account: account!.address, to: deployed.yes.address, value: 1n }),
    'Value transfer to the zero-custody adapter',
  );
  for (const deployment of deployments) {
    const [target, targetHash, balance] = await Promise.all([
      publicClient.readContract({
        address: deployment.address,
        abi: artifact.abi,
        functionName: 'target',
      } as never),
      publicClient.readContract({
        address: deployment.address,
        abi: artifact.abi,
        functionName: 'targetRuntimeCodeHash',
      } as never),
      publicClient.getBalance({ address: deployment.address }),
    ]);
    if (
      (target as Address).toLowerCase() !== ETH_USD_FEED.toLowerCase() ||
      (targetHash as Hex).toLowerCase() !== keccak256(targetRuntime).toLowerCase() ||
      balance !== 0n
    ) {
      fail(`The ${deployment.name} adapter target binding or zero-custody check failed.`);
    }
  }

  const evidence = {
    schemaVersion: 1,
    gate: 'G5',
    workItem: 'PK-03A',
    sourceCommit: sourceCommit(),
    chainId: EXPECTED_CHAIN_ID,
    verificationBlock: (await publicClient.getBlockNumber()).toString(),
    target: { address: ETH_USD_FEED, runtimeCodeHash: keccak256(targetRuntime) },
    roundAtPlan: {
      roundId: roundId.toString(),
      answer: answer.toString(),
      updatedAt: updatedAt.toString(),
    },
    adapterRuntimeTemplateHash: keccak256(
      normalizedRuntimeTemplate(artifact, artifact.deployedBytecode),
    ),
    deployments: deployments.map((deployment) => ({
      ...deployment,
      transactionHash: deployment.transactionHash,
      blockNumber: deployment.blockNumber?.toString() ?? null,
    })),
    checks: {
      validYes: true,
      validNo: true,
      invalidConstructorRejected: true,
      staleRoundRejected: true,
      prematureObservationRejected: true,
      immutableTargetBinding: true,
      valueTransferRejected: true,
      zeroCustodyBalances: true,
    },
    status: 'passed',
  };
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  writeFileSync(offlineEvidencePath, serialized);
  writeFileSync(sepoliaEvidencePath, serialized);
  console.log(
    JSON.stringify({ workItem: 'PK-03A', deployments: deployments.length, status: 'passed' }),
  );
}

main().catch(() => {
  console.error(`PK-03A adapter run failed during ${failureStage}.`);
  process.exitCode = 1;
});
