import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { createViemHandleClient } from '@iexec-nox/handle';
import {
  createPublicClient,
  createWalletClient,
  encodeDeployData,
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
const MEMBER_PROBABILITY_BPS = 7_500n;
const MEMBER_STAKE = 40n;
const FIXTURE_MINT = MEMBER_STAKE * 3n;
const K_MIN = 2n;
const OPEN_DURATION_SECONDS = 120n;
const AGGREGATE_TIMEOUT_SECONDS = 120n;
const RECOVERY_DELAY_SECONDS = 45n;
const PENDING_COMMIT_TIMEOUT_SECONDS = 45n;
const EXPECTED_REVERT_GAS = 2_000_000n;
const RPC_TIMEOUT_MS = 30_000;
const LIFECYCLE_WAIT_PADDING_MS = 5_000;
const PUBLIC_DECRYPT_MAX_ATTEMPTS = 8;
const PUBLIC_DECRYPT_RETRY_DELAY_MS = 5_000;

interface Artifact {
  abi: Abi;
  bytecode: Hex;
  deployedBytecode: Hex;
  immutableReferences?: Record<string, readonly { start: number; length: number }[]>;
}

interface EncryptedValue {
  handle: Hex;
  handleProof: Hex;
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
  if (
    !Array.isArray(artifact.abi) ||
    typeof artifact.bytecode !== 'string' ||
    typeof artifact.deployedBytecode !== 'string'
  ) {
    fail(`The compiled ${description} artifact is unavailable or malformed.`);
  }
  return artifact as Artifact;
}

function runtimeMatchesArtifact(runtime: Hex, artifact: Artifact): boolean {
  const normalize = (bytecode: Hex): Hex | undefined => {
    let normalized = bytecode.slice(2);
    for (const references of Object.values(artifact.immutableReferences ?? {})) {
      for (const { start, length } of references) {
        const offset = start * 2;
        const span = length * 2;
        if (offset + span > normalized.length) return undefined;
        normalized = `${normalized.slice(0, offset)}${'0'.repeat(span)}${normalized.slice(
          offset + span,
        )}`;
      }
    }
    return `0x${normalized}` as Hex;
  };
  return normalize(runtime)?.toLowerCase() === normalize(artifact.deployedBytecode)?.toLowerCase();
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

function assertSingleTransactionBudget(estimate: bigint, cap: bigint): void {
  if (estimate > cap) fail('The proposed Sepolia write exceeds the single-transaction cap.');
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

function requestedContractSet(): ContractSet | undefined {
  const argument = process.argv.find((value) => value.startsWith('--verify-contracts='));
  if (!argument) return undefined;
  const values = argument.slice('--verify-contracts='.length).split(',');
  if (values.length !== 3 || values.some((value) => !isAddress(value))) {
    fail('Three comma-separated FND-05A contract addresses are required for verification.');
  }
  return {
    fixture: values[0] as Address,
    wrapper: values[1] as Address,
    spike: values[2] as Address,
  };
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

async function waitForPublicBoolean(
  handleClient: Awaited<ReturnType<typeof createViemHandleClient>>,
  handle: Hex,
): Promise<{ decryptionProof: Hex; value: boolean }> {
  for (let attempt = 1; attempt <= PUBLIC_DECRYPT_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await handleClient.publicDecrypt(handle);
      if (typeof result.value !== 'boolean')
        fail('The commit acceptance did not decode as a boolean.');
      return { decryptionProof: result.decryptionProof as Hex, value: result.value };
    } catch {
      if (attempt === PUBLIC_DECRYPT_MAX_ATTEMPTS) {
        fail('The commit acceptance proof was unavailable after the bounded retry window.');
      }
      await delay(PUBLIC_DECRYPT_RETRY_DELAY_MS);
    }
  }
  fail('The commit acceptance proof did not produce a result.');
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
        fail('The owner balance was unavailable after the bounded retry window.');
      }
      await delay(PUBLIC_DECRYPT_RETRY_DELAY_MS);
    }
  }
  fail('The owner balance did not produce a result.');
}

async function latestSepoliaTimestamp(rpcUrl: string): Promise<bigint> {
  let response: Response;
  try {
    response = await fetch(rpcUrl, {
      body: JSON.stringify({
        id: 'quitesignal-fnd05a-lifecycle-timestamp',
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

async function waitUntil(rpcUrl: string, timestamp: bigint): Promise<void> {
  const observed = await latestSepoliaTimestamp(rpcUrl);
  if (observed < timestamp) {
    const remaining = (timestamp - observed) * 1_000n;
    if (remaining > BigInt(Number.MAX_SAFE_INTEGER - LIFECYCLE_WAIT_PADDING_MS)) {
      fail('The Ethereum Sepolia lifecycle wait exceeds the supported duration.');
    }
    await delay(Number(remaining) + LIFECYCLE_WAIT_PADDING_MS);
  }
  if ((await latestSepoliaTimestamp(rpcUrl)) < timestamp) {
    fail('The Ethereum Sepolia lifecycle boundary was not reached after its bounded wait.');
  }
}

async function main(): Promise<void> {
  loadEnvironment();
  const dryRun = process.argv.includes('--dry-run');
  const verifyContracts = requestedContractSet();
  if (!process.argv.includes('FND-05-BELOW-K'))
    fail('The FND-05-BELOW-K case identifier is required.');
  if (dryRun && verifyContracts)
    fail('Read-only verification cannot be combined with a write dry run.');

  const privateKey = process.env.SEPOLIA_PRIVATE_KEY;
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!privateKey || !rpcUrl)
    fail('The local Sepolia below-k feasibility configuration is incomplete.');
  if (!dryRun && !verifyContracts && process.env.CONFIRM_SEPOLIA_WRITE !== CONFIRMATION_VALUE) {
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

  const constructorArgs = (wrapper: Address, fixture: Address) =>
    [
      wrapper,
      fixture,
      K_MIN,
      OPEN_DURATION_SECONDS,
      AGGREGATE_TIMEOUT_SECONDS,
      RECOVERY_DELAY_SECONDS,
      PENDING_COMMIT_TIMEOUT_SECONDS,
    ] as const;
  const read = async (
    address: Address,
    artifact: Artifact,
    functionName: string,
    args: readonly unknown[] = [],
  ): Promise<unknown> =>
    publicClient.readContract({ address, abi: artifact.abi, functionName, args } as never);
  const fixtureData = (functionName: string, args: readonly unknown[] = []): Hex =>
    encodeFunctionData({ abi: fixtureArtifact.abi, functionName, args } as never);
  const wrapperData = (functionName: string, args: readonly unknown[] = []): Hex =>
    encodeFunctionData({ abi: wrapperArtifact.abi, functionName, args } as never);
  const spikeData = (functionName: string, args: readonly unknown[] = []): Hex =>
    encodeFunctionData({ abi: spikeArtifact.abi, functionName, args } as never);

  let contracts: ContractSet;
  if (verifyContracts) {
    failureStage = 'FND-05A read-only verification';
    const [fixtureRuntime, wrapperRuntime, spikeRuntime, underlying, state, aggregateAccess] =
      await Promise.all([
        publicClient.getCode({ address: verifyContracts.fixture }),
        publicClient.getCode({ address: verifyContracts.wrapper }),
        publicClient.getCode({ address: verifyContracts.spike }),
        read(verifyContracts.wrapper, wrapperArtifact, 'underlying'),
        read(verifyContracts.spike, spikeArtifact, 'state'),
        read(verifyContracts.spike, spikeArtifact, 'aggregateAccess'),
      ]);
    if (
      !fixtureRuntime ||
      !wrapperRuntime ||
      !spikeRuntime ||
      !runtimeMatchesArtifact(fixtureRuntime, fixtureArtifact) ||
      !runtimeMatchesArtifact(wrapperRuntime, wrapperArtifact) ||
      !runtimeMatchesArtifact(spikeRuntime, spikeArtifact) ||
      (underlying as Address).toLowerCase() !== verifyContracts.fixture.toLowerCase() ||
      state !== 4 ||
      !(aggregateAccess as readonly boolean[]).every((allowed) => !allowed)
    ) {
      fail('The recorded FND-05A terminal contracts do not match the required below-k result.');
    }
    console.log(
      JSON.stringify({ contracts: verifyContracts, status: 'passed', workItem: 'FND-05A' }),
    );
    return;
  }

  const fixtureDeployData = encodeDeployData({
    abi: fixtureArtifact.abi,
    bytecode: fixtureArtifact.bytecode,
  });
  const wrapperDeployData = encodeDeployData({
    abi: wrapperArtifact.abi,
    bytecode: wrapperArtifact.bytecode,
    args: [deployer.address],
  } as never);
  const spikeDeployData = encodeDeployData({
    abi: spikeArtifact.abi,
    bytecode: spikeArtifact.bytecode,
    args: constructorArgs(deployer.address, deployer.address),
  } as never);
  failureStage = 'deployment dry-run estimate';
  const [fixtureGas, wrapperGas, spikeGas, fees] = await Promise.all([
    publicClient.estimateGas({ account: deployer.address, data: fixtureDeployData }),
    publicClient.estimateGas({ account: deployer.address, data: wrapperDeployData }),
    publicClient.estimateGas({ account: deployer.address, data: spikeDeployData }),
    publicClient.estimateFeesPerGas(),
  ]);
  const maxFeePerGas = fees.maxFeePerGas ?? (await publicClient.getGasPrice());
  const plannedCost = (fixtureGas + wrapperGas + spikeGas) * maxFeePerGas;
  assertBudget(ledger, plannedCost);
  for (const gas of [fixtureGas, wrapperGas, spikeGas]) {
    assertSingleTransactionBudget(gas * maxFeePerGas, singleTransactionCapWei);
  }
  if (dryRun) {
    console.log(
      JSON.stringify({
        deployments: 3,
        estimatedMaximumDeploymentGasCostWei: plannedCost.toString(),
        firstAction: 'deploy fresh fixture, unchanged wrapper, and one below-k spike',
        mode: 'confirmed-write',
        remainingAllowanceWei: (BigInt(ledger.maxTotalSpendWei) - totalSpendWei(ledger)).toString(),
        singleTransactionCapWei: singleTransactionCapWei.toString(),
        workItem: 'FND-05A',
      }),
    );
    return;
  }

  assertCleanSourceTree();
  const transactionHashes: Record<string, Hash> = {};
  const deploy = async (
    artifact: Artifact,
    args: readonly unknown[],
    gas: bigint,
    action: string,
  ): Promise<Address> => {
    failureStage = action;
    const currentFees = await publicClient.estimateFeesPerGas();
    const fee = currentFees.maxFeePerGas ?? (await publicClient.getGasPrice());
    assertBudget(ledger, gas * fee);
    assertSingleTransactionBudget(gas * fee, singleTransactionCapWei);
    const hash = await wallet.deployContract({
      account: deployer,
      abi: artifact.abi,
      args: args as never,
      bytecode: artifact.bytecode,
      gas,
      maxFeePerGas: fee,
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
    if (receipt.status !== 'success' || !receipt.contractAddress)
      fail(`${action} deployment failed.`);
    transactionHashes[action] = hash;
    return receipt.contractAddress;
  };
  const send = async (to: Address, data: Hex, action: string): Promise<Hash> => {
    failureStage = `${action} dry-run planning`;
    const [gas, currentFees] = await Promise.all([
      publicClient.estimateGas({ account: deployer.address, to, data }),
      publicClient.estimateFeesPerGas(),
    ]);
    const fee = currentFees.maxFeePerGas ?? (await publicClient.getGasPrice());
    assertBudget(ledger, gas * fee);
    assertSingleTransactionBudget(gas * fee, singleTransactionCapWei);
    failureStage = action;
    const hash = await wallet.sendTransaction({
      account: deployer,
      data,
      gas,
      maxFeePerGas: fee,
      to,
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
    if (receipt.status !== 'success') fail(`${action} transaction failed.`);
    transactionHashes[action] = hash;
    return hash;
  };
  const sendExpectedRevert = async (to: Address, data: Hex, action: string): Promise<Hash> => {
    failureStage = `${action} dry-run planning`;
    const currentFees = await publicClient.estimateFeesPerGas();
    const fee = currentFees.maxFeePerGas ?? (await publicClient.getGasPrice());
    assertBudget(ledger, EXPECTED_REVERT_GAS * fee);
    assertSingleTransactionBudget(EXPECTED_REVERT_GAS * fee, singleTransactionCapWei);
    failureStage = action;
    const hash = await wallet.sendTransaction({
      account: deployer,
      data,
      gas: EXPECTED_REVERT_GAS,
      maxFeePerGas: fee,
      to,
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
    if (receipt.status !== 'reverted') fail(`${action} did not revert on Ethereum Sepolia.`);
    transactionHashes[action] = hash;
    return hash;
  };

  const fixture = await deploy(fixtureArtifact, [], fixtureGas, 'deploy fixture collateral');
  const wrapper = await deploy(
    wrapperArtifact,
    [fixture],
    wrapperGas,
    'deploy confidential wrapper',
  );
  const spike = await deploy(
    spikeArtifact,
    constructorArgs(wrapper, fixture),
    spikeGas,
    'deploy below-k aggregate spike',
  );
  contracts = { fixture, spike, wrapper };
  failureStage = 'wrapper and spike binding verification';
  const [underlying, spikeWrapper, spikeUnderlying] = await Promise.all([
    read(wrapper, wrapperArtifact, 'underlying'),
    read(spike, spikeArtifact, 'wrapper'),
    read(spike, spikeArtifact, 'underlying'),
  ]);
  if (
    (underlying as Address).toLowerCase() !== fixture.toLowerCase() ||
    (spikeWrapper as Address).toLowerCase() !== wrapper.toLowerCase() ||
    (spikeUnderlying as Address).toLowerCase() !== fixture.toLowerCase()
  ) {
    fail('The below-k spike does not bind the freshly deployed wrapper and fixture.');
  }

  await send(
    fixture,
    fixtureData('mint', [deployer.address, FIXTURE_MINT]),
    'mint fixture collateral',
  );
  await send(
    fixture,
    fixtureData('approve', [wrapper, FIXTURE_MINT]),
    'approve fixture collateral wrapper',
  );
  await send(
    wrapper,
    wrapperData('wrap', [deployer.address, FIXTURE_MINT]),
    'wrap fixture collateral',
  );
  const ownerBalance = async (): Promise<bigint> =>
    decryptOwnerValue(
      handleClient,
      (await read(wrapper, wrapperArtifact, 'confidentialBalanceOf', [deployer.address])) as Hex,
    );
  const baselineBalance = await ownerBalance();
  if (baselineBalance !== FIXTURE_MINT)
    fail('The initial confidential fixture balance is incorrect.');

  failureStage = 'below-k encrypted commitment';
  const [stakeInput, probabilityInput] = (await Promise.all([
    handleClient.encryptInput(MEMBER_STAKE, 'uint256', spike),
    handleClient.encryptInput(MEMBER_PROBABILITY_BPS, 'uint256', spike),
  ])) as [EncryptedValue, EncryptedValue];
  await send(
    spike,
    spikeData('commitSignal', [
      stakeInput.handle,
      stakeInput.handleProof,
      probabilityInput.handle,
      probabilityInput.handleProof,
    ]),
    'register below-k encrypted signal',
  );
  if ((await read(spike, spikeArtifact, 'fundsLocation')) !== 0) {
    fail('The pending below-k stake did not remain in owner confidential custody.');
  }
  const transferInput = (await handleClient.encryptInput(
    MEMBER_STAKE,
    'uint256',
    wrapper,
  )) as EncryptedValue;
  await send(
    wrapper,
    wrapperData('confidentialTransferAndCall', [
      spike,
      transferInput.handle,
      transferInput.handleProof,
      '0x',
    ]),
    'transfer below-k confidential collateral',
  );
  if ((await read(spike, spikeArtifact, 'fundsLocation')) !== 1) {
    fail('The below-k callback did not enter its proof-pending funds location.');
  }
  const acceptanceHandle = (await read(
    spike,
    spikeArtifact,
    'pendingCommitAcceptanceHandle',
  )) as Hex;
  const acceptance = await waitForPublicBoolean(handleClient, acceptanceHandle);
  if (!acceptance.value) fail('The matching below-k confidential stake was not accepted.');
  await send(
    spike,
    spikeData('finalizeCommit', [acceptance.decryptionProof]),
    'finalize below-k commitment',
  );

  const deadline = (await read(spike, spikeArtifact, 'deadline')) as bigint;
  await sendExpectedRevert(spike, spikeData('closeEpoch'), 'reject below-k close before deadline');
  await waitUntil(rpcUrl, deadline);
  await send(spike, spikeData('closeEpoch'), 'close below-k epoch into refund');
  const [state, aggregateAccess, aggregateHandles] = await Promise.all([
    read(spike, spikeArtifact, 'state'),
    read(spike, spikeArtifact, 'aggregateAccess'),
    read(spike, spikeArtifact, 'aggregateHandles'),
  ]);
  if (state !== 4 || !(aggregateAccess as readonly boolean[]).every((allowed) => !allowed)) {
    fail('The below-k epoch either disclosed an aggregate or did not enter the refund state.');
  }
  for (const handle of aggregateHandles as readonly Hex[]) {
    await assertRejected(
      () => handleClient.publicDecrypt(handle),
      'Below-k aggregate public decryption',
    );
  }
  await send(spike, spikeData('refund'), 'refund below-k confidential stake');
  await sendExpectedRevert(spike, spikeData('refund'), 'reject duplicate below-k refund');
  if ((await ownerBalance()) !== baselineBalance) {
    fail('The below-k refund did not restore the confidential owner balance.');
  }

  console.log(
    JSON.stringify({
      contracts,
      lifecycleAssertionsVerified: 6,
      negativeAssertionsVerified: 5,
      status: 'passed',
      transactionHashes,
      workItem: 'FND-05A',
    }),
  );
}

main().catch(() => {
  console.error(
    `FND-05A failed during ${failureStage}: inspect the sanitized receipt and Sepolia spend ledger.`,
  );
  process.exitCode = 1;
});
