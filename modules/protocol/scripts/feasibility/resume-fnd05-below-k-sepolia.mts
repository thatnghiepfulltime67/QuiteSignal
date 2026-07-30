import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
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
const EXPECTED_CONFIDENTIAL_BALANCE = 120n;
const EXPECTED_REVERT_GAS = 2_000_000n;
const RPC_TIMEOUT_MS = 30_000;
const PUBLIC_DECRYPT_MAX_ATTEMPTS = 8;
const PUBLIC_DECRYPT_RETRY_DELAY_MS = 5_000;

interface Artifact {
  abi: Abi;
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

interface ContractSet {
  fixture: Address;
  wrapper: Address;
  spike: Address;
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
  if (!Array.isArray(artifact.abi) || typeof artifact.deployedBytecode !== 'string') {
    fail(`The compiled ${description} artifact is unavailable or malformed.`);
  }
  return artifact as Artifact;
}

function runtimeMatchesArtifact(runtime: Hex, artifact: Artifact): boolean {
  let expected = artifact.deployedBytecode.slice(2);
  let observed = runtime.slice(2);
  for (const references of Object.values(artifact.immutableReferences ?? {})) {
    for (const { start, length } of references) {
      const offset = start * 2;
      const span = length * 2;
      if (offset + span > expected.length || offset + span > observed.length) return false;
      expected = `${expected.slice(0, offset)}${'0'.repeat(span)}${expected.slice(offset + span)}`;
      observed = `${observed.slice(0, offset)}${'0'.repeat(span)}${observed.slice(offset + span)}`;
    }
  }
  return expected.toLowerCase() === observed.toLowerCase();
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

function contractSet(): ContractSet {
  const argument = process.argv.find((value) => value.startsWith('--resume-contracts='));
  if (!argument) fail('Three comma-separated FND-05A resume contract addresses are required.');
  const values = argument.slice('--resume-contracts='.length).split(',');
  if (values.length !== 3 || values.some((value) => !isAddress(value))) {
    fail('Three comma-separated FND-05A resume contract addresses are required.');
  }
  return {
    fixture: values[0] as Address,
    wrapper: values[1] as Address,
    spike: values[2] as Address,
  };
}

async function latestSepoliaTimestamp(rpcUrl: string): Promise<bigint> {
  let response: Response;
  try {
    response = await fetch(rpcUrl, {
      body: JSON.stringify({
        id: 'quitesignal-fnd05a-resume-timestamp',
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: ['latest', false],
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
  } catch {
    fail('The Ethereum Sepolia latest-block RPC request did not complete.');
  }
  if (!response.ok) fail('The Ethereum Sepolia latest-block RPC request was rejected.');
  const payload = (await response.json()) as { result?: { timestamp?: unknown } };
  const timestamp = payload.result?.timestamp;
  if (typeof timestamp !== 'string' || !/^0x[0-9a-fA-F]+$/.test(timestamp)) {
    fail('The Ethereum Sepolia latest-block RPC response was malformed.');
  }
  return BigInt(timestamp);
}

async function assertRejected(action: () => Promise<unknown>, scenario: string): Promise<void> {
  let timedOut = false;
  try {
    await Promise.race([
      action(),
      delay(RPC_TIMEOUT_MS).then(() => {
        timedOut = true;
        throw new Error('observation timeout');
      }),
    ]);
  } catch {
    if (timedOut) fail(`${scenario} could not be observed on Ethereum Sepolia.`);
    return;
  }
  fail(`${scenario} did not fail on Ethereum Sepolia.`);
}

async function decryptOwnerValue(
  handleClient: Awaited<ReturnType<typeof createViemHandleClient>>,
  handle: Hex,
): Promise<bigint> {
  for (let attempt = 1; attempt <= PUBLIC_DECRYPT_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await handleClient.decrypt(handle);
      if (typeof result.value !== 'bigint') fail('The owner balance did not decode as uint256.');
      return result.value;
    } catch {
      if (attempt === PUBLIC_DECRYPT_MAX_ATTEMPTS) {
        fail('The owner balance was unavailable after the bounded gateway retry window.');
      }
      await delay(PUBLIC_DECRYPT_RETRY_DELAY_MS);
    }
  }
  fail('The owner balance did not produce a result.');
}

async function main(): Promise<void> {
  loadEnvironment();
  const dryRun = process.argv.includes('--dry-run');
  if (!process.argv.includes('FND-05-BELOW-K-RESUME')) {
    fail('The FND-05-BELOW-K-RESUME case identifier is required.');
  }
  const contracts = contractSet();
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY;
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!privateKey || !rpcUrl)
    fail('The local Sepolia below-k recovery configuration is incomplete.');
  if (!dryRun && process.env.CONFIRM_SEPOLIA_WRITE !== CONFIRMATION_VALUE) {
    fail('Set CONFIRM_SEPOLIA_WRITE=yes only after reviewing the dry-run plan.');
  }

  const deployer = privateKeyToAccount(privateKey as Hex);
  const publicClient = createPublicClient({
    cacheTime: 0,
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: RPC_TIMEOUT_MS }),
  });
  const wallet = createWalletClient({
    account: deployer,
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: RPC_TIMEOUT_MS }),
  });
  const handleClient = await createViemHandleClient(wallet);
  const fixtureArtifact = loadArtifact(fixtureArtifactPath, 'ERC-20 fixture');
  const wrapperArtifact = loadArtifact(wrapperArtifactPath, 'confidential wrapper');
  const spikeArtifact = loadArtifact(spikeArtifactPath, 'aggregate recovery spike');
  const ledger = loadLedger();
  const singleTransactionCapWei = configuredSingleTransactionCapWei(ledger);

  failureStage = 'Ethereum Sepolia preflight';
  if ((await publicClient.getChainId()) !== EXPECTED_CHAIN_ID)
    fail('The configured RPC is not Ethereum Sepolia.');
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

  failureStage = 'resumable fixture verification';
  const [
    fixtureRuntime,
    wrapperRuntime,
    spikeRuntime,
    underlying,
    spikeWrapper,
    spikeUnderlying,
    state,
    funds,
    participants,
    deadline,
    aggregateAccess,
  ] = await Promise.all([
    publicClient.getCode({ address: contracts.fixture }),
    publicClient.getCode({ address: contracts.wrapper }),
    publicClient.getCode({ address: contracts.spike }),
    read(contracts.wrapper, wrapperArtifact, 'underlying'),
    read(contracts.spike, spikeArtifact, 'wrapper'),
    read(contracts.spike, spikeArtifact, 'underlying'),
    read(contracts.spike, spikeArtifact, 'state'),
    read(contracts.spike, spikeArtifact, 'fundsLocation'),
    read(contracts.spike, spikeArtifact, 'participantCount'),
    read(contracts.spike, spikeArtifact, 'deadline'),
    read(contracts.spike, spikeArtifact, 'aggregateAccess'),
  ]);
  if (
    !fixtureRuntime ||
    !wrapperRuntime ||
    !spikeRuntime ||
    !runtimeMatchesArtifact(fixtureRuntime, fixtureArtifact) ||
    !runtimeMatchesArtifact(wrapperRuntime, wrapperArtifact) ||
    !runtimeMatchesArtifact(spikeRuntime, spikeArtifact) ||
    (underlying as Address).toLowerCase() !== contracts.fixture.toLowerCase() ||
    (spikeWrapper as Address).toLowerCase() !== contracts.wrapper.toLowerCase() ||
    (spikeUnderlying as Address).toLowerCase() !== contracts.fixture.toLowerCase() ||
    state !== 0 ||
    funds !== 2 ||
    participants !== 1n ||
    !(aggregateAccess as readonly boolean[]).every((allowed) => !allowed)
  ) {
    fail('The requested FND-05A fixture is not the documented resumable below-k state.');
  }
  if ((await latestSepoliaTimestamp(rpcUrl)) < (deadline as bigint)) {
    fail('The documented FND-05A deadline has not been reached.');
  }
  if (dryRun) {
    console.log(
      JSON.stringify({
        contracts,
        mode: 'confirmed-write',
        remainingAllowanceWei: (BigInt(ledger.maxTotalSpendWei) - totalSpendWei(ledger)).toString(),
        workItem: 'FND-05A-resume',
        writes: ['close below-k epoch', 'refund owner once', 'record duplicate-refund rejection'],
      }),
    );
    return;
  }

  assertCleanSourceTree();
  const transactionHashes: Record<string, Hash> = {};
  const send = async (data: Hex, action: string, expectedRevert = false): Promise<void> => {
    failureStage = `${action} dry-run planning`;
    const gas = expectedRevert
      ? EXPECTED_REVERT_GAS
      : await publicClient.estimateGas({ account: deployer.address, to: contracts.spike, data });
    const fees = await publicClient.estimateFeesPerGas();
    const maxFeePerGas = fees.maxFeePerGas ?? (await publicClient.getGasPrice());
    if (gas * maxFeePerGas > singleTransactionCapWei) {
      fail('The proposed Sepolia write exceeds the single-transaction cap.');
    }
    assertBudget(ledger, gas * maxFeePerGas);
    failureStage = action;
    const hash = await wallet.sendTransaction({
      account: deployer,
      data,
      gas,
      maxFeePerGas,
      to: contracts.spike,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    appendSpend(ledger, {
      actualGasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
      blockNumber: receipt.blockNumber.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice.toString(),
      gasUsed: receipt.gasUsed.toString(),
      phase: 'P0',
      sender: deployer.address,
      transactionHash: hash,
      workItemId: 'FND-05A',
    });
    if (
      (expectedRevert && receipt.status !== 'reverted') ||
      (!expectedRevert && receipt.status !== 'success')
    ) {
      fail(`${action} produced an unexpected Ethereum Sepolia receipt status.`);
    }
    transactionHashes[action] = hash;
  };

  await send(spikeData('closeEpoch'), 'close resumed below-k epoch');
  const [refundableState, refundableAccess, aggregateHandles] = await Promise.all([
    read(contracts.spike, spikeArtifact, 'state'),
    read(contracts.spike, spikeArtifact, 'aggregateAccess'),
    read(contracts.spike, spikeArtifact, 'aggregateHandles'),
  ]);
  if (
    refundableState !== 4 ||
    !(refundableAccess as readonly boolean[]).every((allowed) => !allowed)
  ) {
    fail('The resumed below-k fixture disclosed an aggregate or did not enter the refund state.');
  }
  for (const handle of aggregateHandles as readonly Hex[]) {
    await assertRejected(
      () => handleClient.publicDecrypt(handle),
      'Below-k aggregate public decryption',
    );
  }
  await send(spikeData('refund'), 'refund resumed below-k confidential stake');
  await send(spikeData('refund'), 'reject duplicate resumed below-k refund', true);
  const ownerHandle = (await read(contracts.wrapper, wrapperArtifact, 'confidentialBalanceOf', [
    deployer.address,
  ])) as Hex;
  if ((await decryptOwnerValue(handleClient, ownerHandle)) !== EXPECTED_CONFIDENTIAL_BALANCE) {
    fail('The resumed below-k refund did not restore the deterministic owner balance.');
  }
  console.log(
    JSON.stringify({
      contracts,
      lifecycleAssertionsVerified: 4,
      negativeAssertionsVerified: 4,
      status: 'passed',
      transactionHashes,
      workItem: 'FND-05A-resume',
    }),
  );
}

main().catch((error: unknown) => {
  const errorCategory = error instanceof Error ? error.name : typeof error;
  console.error(
    `FND-05A resume failed during ${failureStage} (${errorCategory}): inspect the sanitized receipt and Sepolia spend ledger.`,
  );
  process.exitCode = 1;
});
