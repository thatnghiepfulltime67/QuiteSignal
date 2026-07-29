import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createViemHandleClient } from '@iexec-nox/handle';
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  isAddress,
  parseEther,
  type Abi,
  type Address,
  type Hash,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const EXPECTED_CHAIN_ID = 11_155_111;
const CONFIRMATION_VALUE = 'yes';
const EXPECTED_DEPLOYER_BALANCE = 120n;
const EXPECTED_SECONDARY_BALANCE = 180n;

interface Artifact {
  abi: Abi;
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

interface StoredSecondaryActor {
  schemaVersion: 1;
  privateKey: Hex;
}

interface TimeoutRecoverySet {
  fixture: Address;
  wrapper: Address;
  timeoutSpike: Address;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const protocolRoot = resolve(scriptDirectory, '../..');
const repositoryRoot = resolve(protocolRoot, '../..');
const artifactDirectory = resolve(protocolRoot, 'artifacts/contracts/feasibility');
const fixtureArtifactPath = resolve(
  artifactDirectory,
  'FeasibilityERC20.sol/FeasibilityERC20.json',
);
const wrapperArtifactPath = resolve(
  artifactDirectory,
  'FeasibilityConfidentialWrapper.sol/FeasibilityConfidentialWrapper.json',
);
const spikeArtifactPath = resolve(
  artifactDirectory,
  'AggregateRecoverySpike.sol/AggregateRecoverySpike.json',
);
const spendLedgerPath = resolve(repositoryRoot, 'evidence/sepolia/spend-ledger.json');
const secondaryActorPath = resolve(repositoryRoot, 'evidence/local/fnd-05-secondary-actor.json');
let failureStage = 'configuration validation';

function fail(message: string): never {
  throw new Error(message);
}

function loadEnvironment(): void {
  const environmentPath = resolve(repositoryRoot, '.env');
  if (existsSync(environmentPath)) process.loadEnvFile(environmentPath);
}

function loadArtifact(path: string, description: string): Artifact {
  const artifact = JSON.parse(readFileSync(path, 'utf8')) as Partial<Artifact>;
  if (!Array.isArray(artifact.abi)) fail(`The compiled ${description} artifact is unavailable.`);
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
  const configuredCap = process.env.SEPOLIA_MAX_SINGLE_TX_ETH;
  if (!configuredCap) return BigInt(ledger.maxTotalSpendWei);
  if (!/^\d+(?:\.\d{1,18})?$/.test(configuredCap)) {
    fail('The configured single-transaction Sepolia gas cap is malformed.');
  }
  const cap = parseEther(configuredCap);
  if (cap === 0n || cap > BigInt(ledger.maxTotalSpendWei)) {
    fail('The configured single-transaction Sepolia gas cap is outside the allowed range.');
  }
  return cap;
}

function assertBudget(ledger: SpendLedger, estimate: bigint): void {
  if (totalSpendWei(ledger) + estimate > BigInt(ledger.maxTotalSpendWei)) {
    fail('The proposed Sepolia write exceeds the committed cumulative gas allowance.');
  }
}

function loadSecondaryPrivateKey(): Hex {
  if (!existsSync(secondaryActorPath)) {
    fail('The local FND-05 secondary-actor recovery record is unavailable.');
  }
  const stored = JSON.parse(
    readFileSync(secondaryActorPath, 'utf8'),
  ) as Partial<StoredSecondaryActor>;
  if (
    stored.schemaVersion !== 1 ||
    typeof stored.privateKey !== 'string' ||
    !/^0x[0-9a-fA-F]{64}$/.test(stored.privateKey)
  ) {
    fail('The local FND-05 secondary-actor recovery record is malformed.');
  }
  chmodSync(secondaryActorPath, 0o600);
  return stored.privateKey as Hex;
}

function clearSecondaryPrivateKey(): void {
  if (existsSync(secondaryActorPath)) unlinkSync(secondaryActorPath);
}

function recoverySet(): TimeoutRecoverySet {
  const argument = process.argv.find((value) => value.startsWith('--recover-timeout='));
  if (!argument) fail('Three timeout recovery contract addresses are required.');
  const values = argument.slice('--recover-timeout='.length).split(',');
  if (values.length !== 3 || values.some((value) => !isAddress(value))) {
    fail('Three comma-separated fixture, wrapper, and timeout spike addresses are required.');
  }
  return {
    fixture: values[0] as Address,
    wrapper: values[1] as Address,
    timeoutSpike: values[2] as Address,
  };
}

async function main(): Promise<void> {
  loadEnvironment();
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY;
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!privateKey || !rpcUrl)
    fail('The local Sepolia timeout recovery configuration is incomplete.');
  if (process.env.CONFIRM_SEPOLIA_WRITE !== CONFIRMATION_VALUE) {
    fail('Set CONFIRM_SEPOLIA_WRITE=yes only after reviewing the timeout recovery plan.');
  }

  const contracts = recoverySet();
  const deployer = privateKeyToAccount(privateKey as Hex);
  const secondary = privateKeyToAccount(loadSecondaryPrivateKey());
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const deployerWallet = createWalletClient({
    account: deployer,
    chain: sepolia,
    transport: http(rpcUrl),
  });
  const secondaryWallet = createWalletClient({
    account: secondary,
    chain: sepolia,
    transport: http(rpcUrl),
  });
  const deployerHandleClient = await createViemHandleClient(deployerWallet);
  const secondaryHandleClient = await createViemHandleClient(secondaryWallet);
  const fixtureArtifact = loadArtifact(fixtureArtifactPath, 'ERC-20 fixture');
  const wrapperArtifact = loadArtifact(wrapperArtifactPath, 'confidential wrapper');
  const spikeArtifact = loadArtifact(spikeArtifactPath, 'aggregate recovery spike');
  const ledger = loadLedger();
  const singleTransactionCapWei = configuredSingleTransactionCapWei(ledger);

  failureStage = 'Ethereum Sepolia preflight';
  if ((await publicClient.getChainId()) !== EXPECTED_CHAIN_ID) {
    fail('The configured RPC is not Ethereum Sepolia.');
  }
  if ((await publicClient.getBalance({ address: deployer.address })) === 0n) {
    fail('The configured Sepolia deployer has no balance.');
  }
  const read = async (
    address: Address,
    artifact: Artifact,
    functionName: string,
    args: readonly unknown[] = [],
  ): Promise<unknown> =>
    publicClient.readContract({ address, abi: artifact.abi, functionName, args } as never);
  const spikeData = (functionName: string, args: readonly unknown[] = []): Hex =>
    encodeFunctionData({ abi: spikeArtifact.abi, functionName, args } as never);
  const configuredUnderlying = (await read(
    contracts.wrapper,
    wrapperArtifact,
    'underlying',
  )) as Address;
  if (configuredUnderlying.toLowerCase() !== contracts.fixture.toLowerCase()) {
    fail('The timeout recovery wrapper does not bind the supplied fixture collateral.');
  }
  if ((await read(contracts.timeoutSpike, spikeArtifact, 'state')) !== 2) {
    fail('The supplied timeout recovery spike is not aggregate pending.');
  }

  const send = async (
    account: typeof deployer,
    wallet: typeof deployerWallet,
    to: Address,
    data: Hex,
    action: string,
  ): Promise<Hash> => {
    failureStage = `${action} dry-run planning`;
    const [gas, fees] = await Promise.all([
      publicClient.estimateGas({ account: account.address, to, data }),
      publicClient.estimateFeesPerGas(),
    ]);
    const maxFeePerGas = fees.maxFeePerGas ?? (await publicClient.getGasPrice());
    const maximumCost = gas * maxFeePerGas;
    assertBudget(ledger, maximumCost);
    if (maximumCost > singleTransactionCapWei) {
      fail('The proposed timeout recovery write exceeds the single-transaction gas allowance.');
    }
    failureStage = action;
    const hash = await wallet.sendTransaction({
      account,
      to,
      data,
      gas,
      maxFeePerGas,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    appendSpend(ledger, {
      workItemId: 'FND-05',
      phase: 'P0',
      sender: account.address,
      transactionHash: hash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice.toString(),
      actualGasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
    });
    if (receipt.status !== 'success') fail(`The ${action} transaction did not succeed.`);
    return hash;
  };

  assertCleanSourceTree();
  await send(
    secondary,
    secondaryWallet,
    contracts.timeoutSpike,
    spikeData('cancelBeforeUnwrap'),
    'permissionless legacy timeout cancellation',
  );
  await send(
    deployer,
    deployerWallet,
    contracts.timeoutSpike,
    spikeData('refund'),
    'refund legacy timeout deployer fixture stake',
  );
  await send(
    secondary,
    secondaryWallet,
    contracts.timeoutSpike,
    spikeData('refund'),
    'refund legacy timeout secondary fixture stake',
  );

  const ownerBalance = async (
    owner: Address,
    handleClient: Awaited<ReturnType<typeof createViemHandleClient>>,
  ): Promise<bigint> => {
    const handle = (await read(contracts.wrapper, wrapperArtifact, 'confidentialBalanceOf', [
      owner,
    ])) as Hex;
    const result = await handleClient.decrypt(handle);
    if (typeof result.value !== 'bigint')
      fail('The recovered owner balance did not decode as uint256.');
    return result.value;
  };
  if (
    (await read(contracts.timeoutSpike, spikeArtifact, 'state')) !== 4 ||
    (await ownerBalance(deployer.address, deployerHandleClient)) !== EXPECTED_DEPLOYER_BALANCE ||
    (await ownerBalance(secondary.address, secondaryHandleClient)) !== EXPECTED_SECONDARY_BALANCE
  ) {
    fail('The legacy timeout recovery did not return both confidential fixture stakes.');
  }
  clearSecondaryPrivateKey();
  console.log(
    JSON.stringify({
      workItem: 'FND-05',
      recoveredTimeoutSpike: contracts.timeoutSpike,
      status: 'passed',
    }),
  );
}

main().catch(() => {
  console.error(
    `FND-05 timeout recovery failed during ${failureStage}: inspect the sanitized receipt and spend ledger.`,
  );
  process.exitCode = 1;
});
