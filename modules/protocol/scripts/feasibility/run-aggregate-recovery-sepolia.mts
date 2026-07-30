import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
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
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const EXPECTED_CHAIN_ID = 11_155_111;
const CONFIRMATION_VALUE = 'yes';
const MEMBER_ONE_PROBABILITY_BPS = 7_500n;
const MEMBER_ONE_STAKE = 40n;
const MEMBER_TWO_PROBABILITY_BPS = 2_500n;
const MEMBER_TWO_STAKE = 60n;
const EXPECTED_AGGREGATE_NO = 55n;
const EXPECTED_AGGREGATE_TOTAL = MEMBER_ONE_STAKE + MEMBER_TWO_STAKE;
const EXPECTED_AGGREGATE_YES = 45n;
const FIXTURE_MINT = EXPECTED_AGGREGATE_TOTAL * 3n;
const SECONDARY_ACTOR_FUNDING = parseEther('0.01');
const K_MIN = 2n;
const OPEN_DURATION_SECONDS = 120n;
const AGGREGATE_TIMEOUT_SECONDS = 120n;
const RECOVERY_DELAY_SECONDS = 45n;
const PENDING_COMMIT_TIMEOUT_SECONDS = 45n;
const PUBLIC_DECRYPT_MAX_ATTEMPTS = 8;
const PUBLIC_DECRYPT_RETRY_DELAY_MS = 5_000;
const RPC_TIMEOUT_MS = 30_000;
const EXPECTED_REVERT_GAS = 2_000_000n;
const LIFECYCLE_WAIT_PADDING_MS = 5_000;

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

interface EncryptedValue {
  handle: Hex;
  handleProof: Hex;
}

interface ContractSet {
  fixture: Address;
  wrapper: Address;
  belowKSpike: Address;
  timeoutSpike: Address;
  recoverySpike: Address;
}

interface StoredSecondaryActor {
  schemaVersion: 1;
  privateKey: Hex;
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

function assertSingleTransactionBudget(estimate: bigint, cap: bigint): void {
  if (estimate > cap)
    fail('The proposed Sepolia write exceeds the single-transaction gas allowance.');
}

function contractSet(expectedAddressCount: 4 | 5): ContractSet | undefined {
  const argument = process.argv.find((value) => value.startsWith('--verify-contracts='));
  if (!argument) return undefined;
  const values = argument.slice('--verify-contracts='.length).split(',');
  if (values.length !== expectedAddressCount || values.some((value) => !isAddress(value))) {
    fail(
      `${expectedAddressCount} comma-separated FND-05 contract addresses are required for verification.`,
    );
  }
  if (expectedAddressCount === 4) {
    return {
      fixture: values[0] as Address,
      wrapper: values[1] as Address,
      belowKSpike: values[2] as Address,
      timeoutSpike: values[3] as Address,
      recoverySpike: values[2] as Address,
    };
  }
  return {
    fixture: values[0] as Address,
    wrapper: values[1] as Address,
    belowKSpike: values[2] as Address,
    timeoutSpike: values[3] as Address,
    recoverySpike: values[4] as Address,
  };
}

function recoveryResumeSet(): ContractSet | undefined {
  const argument = process.argv.find((value) => value.startsWith('--resume-recovery='));
  if (!argument) return undefined;
  const values = argument.slice('--resume-recovery='.length).split(',');
  if (values.length !== 4 || values.some((value) => !isAddress(value))) {
    fail(
      'Four comma-separated FND-05C fixture, wrapper, recovery, and peer addresses are required.',
    );
  }
  return {
    fixture: values[0] as Address,
    wrapper: values[1] as Address,
    belowKSpike: values[2] as Address,
    timeoutSpike: values[3] as Address,
    recoverySpike: values[2] as Address,
  };
}

function loadOrCreateSecondaryPrivateKey(): Hex {
  if (existsSync(secondaryActorPath)) {
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
  mkdirSync(dirname(secondaryActorPath), { recursive: true, mode: 0o700 });
  const privateKey = generatePrivateKey();
  writeFileSync(secondaryActorPath, `${JSON.stringify({ schemaVersion: 1, privateKey })}\n`, {
    mode: 0o600,
  });
  chmodSync(secondaryActorPath, 0o600);
  return privateKey;
}

function clearSecondaryPrivateKey(): void {
  if (existsSync(secondaryActorPath)) unlinkSync(secondaryActorPath);
}

async function assertRejected(action: () => Promise<unknown>, scenario: string): Promise<void> {
  let timedOut = false;
  try {
    await Promise.race([
      action(),
      delay(RPC_TIMEOUT_MS).then(() => {
        timedOut = true;
        throw new Error('negative assertion observation timed out');
      }),
    ]);
  } catch {
    if (timedOut) {
      fail(`${scenario} could not be observed on Ethereum Sepolia.`);
    }
    return;
  }
  fail(`${scenario} did not fail on Sepolia.`);
}

async function waitForPublicUint(
  handleClient: Awaited<ReturnType<typeof createViemHandleClient>>,
  handle: Hex,
): Promise<{ value: bigint; decryptionProof: Hex }> {
  for (let attempt = 1; attempt <= PUBLIC_DECRYPT_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await handleClient.publicDecrypt(handle);
      if (typeof result.value !== 'bigint')
        fail('The public decryption did not decode as uint256.');
      return { value: result.value, decryptionProof: result.decryptionProof as Hex };
    } catch {
      if (attempt === PUBLIC_DECRYPT_MAX_ATTEMPTS) {
        fail('The public decryption was unavailable after the bounded gateway retry window.');
      }
      await delay(PUBLIC_DECRYPT_RETRY_DELAY_MS);
    }
  }
  fail('The public decryption did not produce a result.');
}

async function waitForPublicBoolean(
  handleClient: Awaited<ReturnType<typeof createViemHandleClient>>,
  handle: Hex,
): Promise<{ value: boolean; decryptionProof: Hex }> {
  for (let attempt = 1; attempt <= PUBLIC_DECRYPT_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await handleClient.publicDecrypt(handle);
      if (typeof result.value !== 'boolean')
        fail('The commit acceptance did not decode as a boolean.');
      return { value: result.value, decryptionProof: result.decryptionProof as Hex };
    } catch {
      if (attempt === PUBLIC_DECRYPT_MAX_ATTEMPTS) {
        fail('The commit acceptance proof was unavailable after the bounded gateway retry window.');
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
        fail('The owner balance was unavailable after the bounded gateway retry window.');
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
        id: 'quitesignal-lifecycle-timestamp',
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
  const payload = (await response.json()) as {
    result?: { timestamp?: unknown };
  };
  const timestamp = payload.result?.timestamp;
  if (typeof timestamp !== 'string' || !/^0x[0-9a-fA-F]+$/.test(timestamp)) {
    fail('The Ethereum Sepolia latest-block RPC response was malformed.');
  }
  return BigInt(timestamp);
}

async function waitUntil(rpcUrl: string, timestamp: bigint): Promise<void> {
  const observedTimestamp = await latestSepoliaTimestamp(rpcUrl);
  if (observedTimestamp < timestamp) {
    const remainingMilliseconds = (timestamp - observedTimestamp) * 1_000n;
    if (remainingMilliseconds > BigInt(Number.MAX_SAFE_INTEGER - LIFECYCLE_WAIT_PADDING_MS)) {
      fail('The Ethereum Sepolia lifecycle wait exceeds the supported duration.');
    }
    await delay(Number(remainingMilliseconds) + LIFECYCLE_WAIT_PADDING_MS);
  }
  if ((await latestSepoliaTimestamp(rpcUrl)) < timestamp) {
    fail('The Ethereum Sepolia lifecycle boundary was not reached after its bounded wait.');
  }
}

async function main(): Promise<void> {
  loadEnvironment();

  const dryRun = process.argv.includes('--dry-run');
  const requestedCase = process.argv.find(
    (argument) =>
      argument === 'FND-05' ||
      argument === 'FND-05-TIMEOUT' ||
      argument === 'FND-05-RECOVERY' ||
      argument === 'FND-05-RECOVERY-RESUME',
  );
  const timeoutOnly = requestedCase === 'FND-05-TIMEOUT';
  const recoveryOnly =
    requestedCase === 'FND-05-RECOVERY' || requestedCase === 'FND-05-RECOVERY-RESUME';
  const recoveryResume = requestedCase === 'FND-05-RECOVERY-RESUME';
  const ledgerWorkItemId = timeoutOnly ? 'FND-05B' : recoveryOnly ? 'FND-05C' : 'FND-05';
  const verifiedContracts = contractSet(recoveryOnly ? 4 : 5);
  const recoveryResumeContracts = recoveryResume ? recoveryResumeSet() : undefined;
  if (!requestedCase) fail('An FND-05 aggregate feasibility case identifier is required.');
  if (recoveryResume && !recoveryResumeContracts) {
    fail(
      'FND-05C recovery resume requires --resume-recovery=<fixture>,<wrapper>,<recovery>,<peer>.',
    );
  }
  if (verifiedContracts && recoveryResumeContracts) {
    fail('FND-05C recovery resume cannot be combined with read-only contract verification.');
  }
  if (dryRun && verifiedContracts) {
    fail('Read-only verification cannot be combined with the deployment dry-run.');
  }

  const privateKey = process.env.SEPOLIA_PRIVATE_KEY;
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!privateKey || !rpcUrl)
    fail('The local Sepolia aggregate feasibility configuration is incomplete.');
  if (!dryRun && !verifiedContracts && process.env.CONFIRM_SEPOLIA_WRITE !== CONFIRMATION_VALUE) {
    fail('Set CONFIRM_SEPOLIA_WRITE=yes only after reviewing the dry-run plan.');
  }

  const deployer = privateKeyToAccount(privateKey as Hex);
  const publicClient = createPublicClient({
    cacheTime: 0,
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: RPC_TIMEOUT_MS }),
  });
  const deployerWallet = createWalletClient({
    account: deployer,
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: RPC_TIMEOUT_MS }),
  });
  const deployerHandleClient = await createViemHandleClient(deployerWallet);
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

  const spikeConstructorArgs = (wrapper: Address, fixture: Address) =>
    [
      wrapper,
      fixture,
      K_MIN,
      OPEN_DURATION_SECONDS,
      AGGREGATE_TIMEOUT_SECONDS,
      RECOVERY_DELAY_SECONDS,
      PENDING_COMMIT_TIMEOUT_SECONDS,
    ] as const;

  let contracts: ContractSet;
  if (verifiedContracts) {
    failureStage = 'existing aggregate harness runtime verification';
    const [fixtureRuntime, wrapperRuntime, belowRuntime, timeoutRuntime, recoveryRuntime] =
      await Promise.all([
        publicClient.getCode({ address: verifiedContracts.fixture }),
        publicClient.getCode({ address: verifiedContracts.wrapper }),
        publicClient.getCode({ address: verifiedContracts.belowKSpike }),
        publicClient.getCode({ address: verifiedContracts.timeoutSpike }),
        publicClient.getCode({ address: verifiedContracts.recoverySpike }),
      ]);
    if (
      !fixtureRuntime ||
      !wrapperRuntime ||
      !belowRuntime ||
      !timeoutRuntime ||
      !recoveryRuntime ||
      !runtimeMatchesArtifact(fixtureRuntime, fixtureArtifact) ||
      !runtimeMatchesArtifact(wrapperRuntime, wrapperArtifact) ||
      !runtimeMatchesArtifact(belowRuntime, spikeArtifact) ||
      !runtimeMatchesArtifact(timeoutRuntime, spikeArtifact) ||
      !runtimeMatchesArtifact(recoveryRuntime, spikeArtifact)
    ) {
      fail('An existing FND-05 harness runtime does not match the compiled artifact.');
    }
    contracts = verifiedContracts;
  } else if (recoveryResumeContracts) {
    failureStage = 'existing FND-05C recovery fixture verification';
    const [fixtureRuntime, wrapperRuntime, recoveryRuntime, contextPeerRuntime] = await Promise.all(
      [
        publicClient.getCode({ address: recoveryResumeContracts.fixture }),
        publicClient.getCode({ address: recoveryResumeContracts.wrapper }),
        publicClient.getCode({ address: recoveryResumeContracts.recoverySpike }),
        publicClient.getCode({ address: recoveryResumeContracts.timeoutSpike }),
      ],
    );
    const [underlying, state, participants, peerState, peerParticipants] = await Promise.all([
      publicClient.readContract({
        address: recoveryResumeContracts.wrapper,
        abi: wrapperArtifact.abi,
        functionName: 'underlying',
      } as never),
      publicClient.readContract({
        address: recoveryResumeContracts.recoverySpike,
        abi: spikeArtifact.abi,
        functionName: 'state',
      } as never),
      publicClient.readContract({
        address: recoveryResumeContracts.recoverySpike,
        abi: spikeArtifact.abi,
        functionName: 'participantCount',
      } as never),
      publicClient.readContract({
        address: recoveryResumeContracts.timeoutSpike,
        abi: spikeArtifact.abi,
        functionName: 'state',
      } as never),
      publicClient.readContract({
        address: recoveryResumeContracts.timeoutSpike,
        abi: spikeArtifact.abi,
        functionName: 'participantCount',
      } as never),
    ]);
    if (
      !fixtureRuntime ||
      !wrapperRuntime ||
      !recoveryRuntime ||
      !contextPeerRuntime ||
      !runtimeMatchesArtifact(fixtureRuntime, fixtureArtifact) ||
      !runtimeMatchesArtifact(wrapperRuntime, wrapperArtifact) ||
      !runtimeMatchesArtifact(recoveryRuntime, spikeArtifact) ||
      !runtimeMatchesArtifact(contextPeerRuntime, spikeArtifact) ||
      (underlying as Address).toLowerCase() !== recoveryResumeContracts.fixture.toLowerCase() ||
      state !== 0 ||
      participants !== K_MIN ||
      peerState !== 0 ||
      peerParticipants !== 0n
    ) {
      fail('The FND-05C fixture is not the documented resumable Open recovery state.');
    }
    if (dryRun) {
      console.log(
        JSON.stringify({
          contracts: recoveryResumeContracts,
          mode: 'confirmed-resume',
          status: 'ready',
          workItem: requestedCase,
        }),
      );
      return;
    }
    assertCleanSourceTree();
    contracts = recoveryResumeContracts;
  } else {
    failureStage = 'deployment dry-run planning';
    const nonce = BigInt(await publicClient.getTransactionCount({ address: deployer.address }));
    const fixtureData = encodeDeployData({
      abi: fixtureArtifact.abi,
      bytecode: fixtureArtifact.bytecode,
    });
    const plannedFixture = deployer.address;
    const wrapperData = encodeDeployData({
      abi: wrapperArtifact.abi,
      bytecode: wrapperArtifact.bytecode,
      args: [plannedFixture],
    } as never);
    const plannedWrapper = deployer.address;
    const spikeData = encodeDeployData({
      abi: spikeArtifact.abi,
      bytecode: spikeArtifact.bytecode,
      args: spikeConstructorArgs(plannedWrapper, plannedFixture),
    } as never);
    failureStage = 'fixture deployment dry-run estimate';
    const fixtureGas = await publicClient.estimateGas({
      account: deployer.address,
      data: fixtureData,
    });
    failureStage = 'wrapper deployment dry-run estimate';
    const wrapperGas = await publicClient.estimateGas({
      account: deployer.address,
      data: wrapperData,
    });
    failureStage = 'aggregate spike deployment dry-run estimate';
    const spikeGas = await publicClient.estimateGas({ account: deployer.address, data: spikeData });
    failureStage = 'Sepolia fee dry-run estimate';
    const fees = await publicClient.estimateFeesPerGas();
    const maxFeePerGas = fees.maxFeePerGas ?? (await publicClient.getGasPrice());
    const spikeCount = timeoutOnly ? 1n : recoveryOnly ? 2n : 3n;
    const totalDeploymentCost = (fixtureGas + wrapperGas + spikeGas * spikeCount) * maxFeePerGas;
    assertBudget(ledger, totalDeploymentCost);
    for (const gas of [fixtureGas, wrapperGas, spikeGas]) {
      assertSingleTransactionBudget(gas * maxFeePerGas, singleTransactionCapWei);
    }
    console.log(
      JSON.stringify({
        mode: 'confirmed-write',
        workItem: requestedCase,
        firstAction: timeoutOnly
          ? 'deploy fresh fixture, unchanged wrapper, and one threshold timeout spike'
          : recoveryOnly
            ? 'deploy fresh fixture, unchanged wrapper, one recovery spike, and one no-custody proof-context peer'
            : 'deploy fresh fixture, unchanged wrapper, and three aggregate lifecycle spikes',
        deployments: timeoutOnly ? 3 : recoveryOnly ? 4 : 5,
        deploymentNonce: nonce.toString(),
        estimatedMaximumDeploymentGasCostWei: totalDeploymentCost.toString(),
        secondaryActorFundingWei: SECONDARY_ACTOR_FUNDING.toString(),
        singleTransactionCapWei: singleTransactionCapWei.toString(),
        remainingAllowanceWei: (BigInt(ledger.maxTotalSpendWei) - totalSpendWei(ledger)).toString(),
      }),
    );
    if (dryRun) return;

    assertCleanSourceTree();
    const deploy = async (
      artifact: Artifact,
      args: readonly unknown[],
      gas: bigint,
      action: string,
    ): Promise<Address> => {
      failureStage = action;
      const currentFees = await publicClient.estimateFeesPerGas();
      const currentMaxFeePerGas = currentFees.maxFeePerGas ?? (await publicClient.getGasPrice());
      const maximumCost = gas * currentMaxFeePerGas;
      assertBudget(ledger, maximumCost);
      assertSingleTransactionBudget(maximumCost, singleTransactionCapWei);
      const hash = await deployerWallet.deployContract({
        account: deployer,
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        args: args as never,
        gas,
        maxFeePerGas: currentMaxFeePerGas,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      appendSpend(ledger, {
        workItemId: ledgerWorkItemId,
        phase: 'P0',
        sender: deployer.address,
        transactionHash: hash,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.effectiveGasPrice.toString(),
        actualGasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
      });
      if (receipt.status !== 'success' || !receipt.contractAddress) {
        fail(`The ${action} deployment did not succeed.`);
      }
      return receipt.contractAddress;
    };

    const fixture = await deploy(fixtureArtifact, [], fixtureGas, 'fixture collateral');
    const wrapper = await deploy(wrapperArtifact, [fixture], wrapperGas, 'confidential wrapper');
    let belowKSpike: Address;
    let timeoutSpike: Address;
    let recoverySpike: Address;
    if (timeoutOnly) {
      timeoutSpike = await deploy(
        spikeArtifact,
        spikeConstructorArgs(wrapper, fixture),
        spikeGas,
        'pre-unwrap timeout spike',
      );
      belowKSpike = timeoutSpike;
      recoverySpike = timeoutSpike;
    } else if (recoveryOnly) {
      recoverySpike = await deploy(
        spikeArtifact,
        spikeConstructorArgs(wrapper, fixture),
        spikeGas,
        'unwrap recovery spike',
      );
      timeoutSpike = await deploy(
        spikeArtifact,
        spikeConstructorArgs(wrapper, fixture),
        spikeGas,
        'no-custody proof-context peer',
      );
      belowKSpike = recoverySpike;
    } else {
      timeoutSpike = await deploy(
        spikeArtifact,
        spikeConstructorArgs(wrapper, fixture),
        spikeGas,
        'pre-unwrap timeout spike',
      );
      belowKSpike = await deploy(
        spikeArtifact,
        spikeConstructorArgs(wrapper, fixture),
        spikeGas,
        'below-k aggregate spike',
      );
      recoverySpike = await deploy(
        spikeArtifact,
        spikeConstructorArgs(wrapper, fixture),
        spikeGas,
        'unwrap recovery spike',
      );
    }
    contracts = { fixture, wrapper, belowKSpike, timeoutSpike, recoverySpike };
  }

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

  if (verifiedContracts) {
    failureStage = 'FND-05 final read-only verification';
    const [
      underlying,
      belowState,
      timeoutState,
      recoveryState,
      recoveryReleased,
      recoveryYes,
      recoveryNo,
      contextPeerParticipants,
    ] = await Promise.all([
      read(contracts.wrapper, wrapperArtifact, 'underlying'),
      read(contracts.belowKSpike, spikeArtifact, 'state'),
      read(contracts.timeoutSpike, spikeArtifact, 'state'),
      read(contracts.recoverySpike, spikeArtifact, 'state'),
      read(contracts.recoverySpike, spikeArtifact, 'observedReleasedAmount'),
      read(contracts.recoverySpike, spikeArtifact, 'publicYes'),
      read(contracts.recoverySpike, spikeArtifact, 'publicNo'),
      read(contracts.timeoutSpike, spikeArtifact, 'participantCount'),
    ]);
    if (
      (underlying as Address).toLowerCase() !== contracts.fixture.toLowerCase() ||
      belowState !== 4 ||
      (recoveryOnly ? timeoutState !== 0 || contextPeerParticipants !== 0n : timeoutState !== 4) ||
      recoveryState !== 4 ||
      recoveryReleased !== EXPECTED_AGGREGATE_TOTAL ||
      recoveryYes !== EXPECTED_AGGREGATE_YES ||
      recoveryNo !== EXPECTED_AGGREGATE_NO
    ) {
      fail('The recorded FND-05 terminal state did not match the required recovery result.');
    }
    console.log(
      JSON.stringify({
        workItem: requestedCase,
        contractsVerified: recoveryOnly ? 4 : 5,
        status: 'passed',
      }),
    );
    return;
  }

  const secondary = privateKeyToAccount(loadOrCreateSecondaryPrivateKey());
  const secondaryWallet = createWalletClient({
    account: secondary,
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: RPC_TIMEOUT_MS }),
  });
  const secondaryHandleClient = await createViemHandleClient(secondaryWallet);

  const send = async (
    account: typeof deployer,
    wallet: typeof deployerWallet,
    to: Address,
    data: Hex,
    action: string,
    value: bigint = 0n,
  ): Promise<Hash> => {
    failureStage = `${action} dry-run planning`;
    const [gas, fees] = await Promise.all([
      publicClient.estimateGas({ account: account.address, to, data, value }),
      publicClient.estimateFeesPerGas(),
    ]);
    const maxFeePerGas = fees.maxFeePerGas ?? (await publicClient.getGasPrice());
    const maximumCost = gas * maxFeePerGas;
    assertBudget(ledger, maximumCost);
    assertSingleTransactionBudget(maximumCost, singleTransactionCapWei);
    failureStage = action;
    const hash = await wallet.sendTransaction({
      account,
      to,
      data,
      value,
      gas,
      maxFeePerGas,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    appendSpend(ledger, {
      workItemId: ledgerWorkItemId,
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

  const sendExpectedRevert = async (
    account: typeof deployer,
    wallet: typeof deployerWallet,
    to: Address,
    data: Hex,
    action: string,
  ): Promise<Hash> => {
    failureStage = `${action} dry-run planning`;
    const fees = await publicClient.estimateFeesPerGas();
    const maxFeePerGas = fees.maxFeePerGas ?? (await publicClient.getGasPrice());
    const maximumCost = EXPECTED_REVERT_GAS * maxFeePerGas;
    assertBudget(ledger, maximumCost);
    assertSingleTransactionBudget(maximumCost, singleTransactionCapWei);
    failureStage = action;
    const hash = await wallet.sendTransaction({
      account,
      to,
      data,
      gas: EXPECTED_REVERT_GAS,
      maxFeePerGas,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    appendSpend(ledger, {
      workItemId: ledgerWorkItemId,
      phase: 'P0',
      sender: account.address,
      transactionHash: hash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice.toString(),
      actualGasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
    });
    if (receipt.status !== 'reverted') {
      fail(`The ${action} transaction did not revert on Ethereum Sepolia.`);
    }
    return hash;
  };

  failureStage = 'wrapper collateral binding verification';
  const configuredUnderlying = (await read(
    contracts.wrapper,
    wrapperArtifact,
    'underlying',
  )) as Address;
  if (configuredUnderlying.toLowerCase() !== contracts.fixture.toLowerCase()) {
    fail('The confidential wrapper does not bind the expected fixture collateral.');
  }
  for (const spike of [contracts.belowKSpike, contracts.timeoutSpike, contracts.recoverySpike]) {
    const [spikeWrapper, spikeUnderlying] = await Promise.all([
      read(spike, spikeArtifact, 'wrapper'),
      read(spike, spikeArtifact, 'underlying'),
    ]);
    if (
      (spikeWrapper as Address).toLowerCase() !== contracts.wrapper.toLowerCase() ||
      (spikeUnderlying as Address).toLowerCase() !== contracts.fixture.toLowerCase()
    ) {
      fail('An aggregate recovery spike does not bind the expected wrapper and fixture.');
    }
  }

  if (!recoveryResumeContracts) {
    await send(
      deployer,
      deployerWallet,
      contracts.fixture,
      fixtureData('mint', [deployer.address, FIXTURE_MINT]),
      'mint fixture collateral',
    );
    await send(
      deployer,
      deployerWallet,
      contracts.fixture,
      fixtureData('approve', [contracts.wrapper, FIXTURE_MINT]),
      'approve fixture collateral wrapper',
    );
    await send(
      deployer,
      deployerWallet,
      contracts.wrapper,
      wrapperData('wrap', [deployer.address, FIXTURE_MINT]),
      'wrap fixture collateral for cohort members',
    );
    await send(
      deployer,
      deployerWallet,
      secondary.address,
      '0x',
      'fund independent cohort member gas',
      SECONDARY_ACTOR_FUNDING,
    );
    const secondaryDistribution = (await deployerHandleClient.encryptInput(
      MEMBER_TWO_STAKE * 3n,
      'uint256',
      contracts.wrapper,
    )) as EncryptedValue;
    await send(
      deployer,
      deployerWallet,
      contracts.wrapper,
      wrapperData('confidentialTransfer', [
        secondary.address,
        secondaryDistribution.handle,
        secondaryDistribution.handleProof,
      ]),
      'distribute confidential collateral to independent cohort member',
    );
  }

  const ownerBalance = async (
    account: Address,
    handleClient: Awaited<ReturnType<typeof createViemHandleClient>>,
  ): Promise<bigint> =>
    decryptOwnerValue(
      handleClient,
      (await read(contracts.wrapper, wrapperArtifact, 'confidentialBalanceOf', [account])) as Hex,
    );
  const observedDeployerBalance = await ownerBalance(deployer.address, deployerHandleClient);
  const observedSecondaryBalance = await ownerBalance(secondary.address, secondaryHandleClient);
  const initialDeployerBalance = recoveryResumeContracts
    ? observedDeployerBalance + MEMBER_ONE_STAKE
    : observedDeployerBalance;
  const initialSecondaryBalance = recoveryResumeContracts
    ? observedSecondaryBalance + MEMBER_TWO_STAKE
    : observedSecondaryBalance;
  if (
    !recoveryResumeContracts &&
    (initialDeployerBalance !== MEMBER_ONE_STAKE * 3n ||
      initialSecondaryBalance !== MEMBER_TWO_STAKE * 3n)
  ) {
    fail('The initial confidential cohort collateral distribution did not match the fixture plan.');
  }

  const commit = async (
    spike: Address,
    account: typeof deployer,
    wallet: typeof deployerWallet,
    handleClient: Awaited<ReturnType<typeof createViemHandleClient>>,
    stake: bigint,
    probabilityBps: bigint,
    actionPrefix: string,
  ): Promise<void> => {
    failureStage = `${actionPrefix} encryption`;
    const [stakeInput, probabilityInput] = (await Promise.all([
      handleClient.encryptInput(stake, 'uint256', spike),
      handleClient.encryptInput(probabilityBps, 'uint256', spike),
    ])) as [EncryptedValue, EncryptedValue];
    await send(
      account,
      wallet,
      spike,
      spikeData('commitSignal', [
        stakeInput.handle,
        stakeInput.handleProof,
        probabilityInput.handle,
        probabilityInput.handleProof,
      ]),
      `${actionPrefix} register encrypted signal`,
    );
    if ((await read(spike, spikeArtifact, 'fundsLocation')) !== 0) {
      fail(`${actionPrefix} did not retain pending collateral with its owner before transfer.`);
    }
    const transferInput = (await handleClient.encryptInput(
      stake,
      'uint256',
      contracts.wrapper,
    )) as EncryptedValue;
    await send(
      account,
      wallet,
      contracts.wrapper,
      wrapperData('confidentialTransferAndCall', [
        spike,
        transferInput.handle,
        transferInput.handleProof,
        '0x',
      ]),
      `${actionPrefix} transfer confidential collateral`,
    );
    if ((await read(spike, spikeArtifact, 'fundsLocation')) !== 1) {
      fail(`${actionPrefix} did not record the callback outcome as proof-pending.`);
    }
    const acceptanceHandle = (await read(
      spike,
      spikeArtifact,
      'pendingCommitAcceptanceHandle',
    )) as Hex;
    const acceptance = await waitForPublicBoolean(deployerHandleClient, acceptanceHandle);
    if (!acceptance.value) fail(`${actionPrefix} matching confidential stake was not accepted.`);
    await send(
      deployer,
      deployerWallet,
      spike,
      spikeData('finalizeCommit', [acceptance.decryptionProof]),
      `${actionPrefix} finalize accepted encrypted signal`,
    );
  };

  const refundAndAssertBalance = async (
    spike: Address,
    account: typeof deployer,
    wallet: typeof deployerWallet,
    handleClient: Awaited<ReturnType<typeof createViemHandleClient>>,
    expectedBalance: bigint,
    action: string,
  ): Promise<void> => {
    await send(account, wallet, spike, spikeData('refund'), action);
    await sendExpectedRevert(account, wallet, spike, spikeData('refund'), `${action} duplicate`);
    if ((await ownerBalance(account.address, handleClient)) !== expectedBalance) {
      fail(`${action} did not restore the recorded confidential owner balance.`);
    }
  };

  if (!timeoutOnly && !recoveryOnly) {
    failureStage = 'below-k aggregate disclosure path';
    await commit(
      contracts.belowKSpike,
      deployer,
      deployerWallet,
      deployerHandleClient,
      MEMBER_ONE_STAKE,
      MEMBER_ONE_PROBABILITY_BPS,
      'below-k first member',
    );
    const belowDeadline = (await read(contracts.belowKSpike, spikeArtifact, 'deadline')) as bigint;
    await sendExpectedRevert(
      deployer,
      deployerWallet,
      contracts.belowKSpike,
      spikeData('closeEpoch'),
      'Below-k close before the deadline',
    );
    await waitUntil(rpcUrl, belowDeadline);
    await send(
      deployer,
      deployerWallet,
      contracts.belowKSpike,
      spikeData('closeEpoch'),
      'close below-k epoch into refund',
    );
    const [belowState, belowAccess, belowHandles] = await Promise.all([
      read(contracts.belowKSpike, spikeArtifact, 'state'),
      read(contracts.belowKSpike, spikeArtifact, 'aggregateAccess'),
      read(contracts.belowKSpike, spikeArtifact, 'aggregateHandles'),
    ]);
    if (belowState !== 4 || !(belowAccess as readonly boolean[]).every((allowed) => !allowed)) {
      fail('The below-k epoch disclosed an aggregate or did not enter the refund state.');
    }
    for (const handle of belowHandles as readonly Hex[]) {
      await assertRejected(
        () => deployerHandleClient.publicDecrypt(handle),
        'Below-k aggregate public decryption',
      );
    }
    await refundAndAssertBalance(
      contracts.belowKSpike,
      deployer,
      deployerWallet,
      deployerHandleClient,
      initialDeployerBalance,
      'refund below-k confidential stake',
    );
  }

  if (!recoveryOnly) {
    failureStage = 'pre-unwrap timeout path';
    await commit(
      contracts.timeoutSpike,
      deployer,
      deployerWallet,
      deployerHandleClient,
      MEMBER_ONE_STAKE,
      MEMBER_ONE_PROBABILITY_BPS,
      'timeout first member',
    );
    await commit(
      contracts.timeoutSpike,
      secondary,
      secondaryWallet,
      secondaryHandleClient,
      MEMBER_TWO_STAKE,
      MEMBER_TWO_PROBABILITY_BPS,
      'timeout independent member',
    );
    const timeoutDeadline = (await read(
      contracts.timeoutSpike,
      spikeArtifact,
      'deadline',
    )) as bigint;
    await waitUntil(rpcUrl, timeoutDeadline);
    await send(
      deployer,
      deployerWallet,
      contracts.timeoutSpike,
      spikeData('closeEpoch'),
      'close threshold epoch for aggregate timeout',
    );
    await send(
      deployer,
      deployerWallet,
      contracts.timeoutSpike,
      spikeData('requestAggregateDecrypt'),
      'request timeout epoch aggregate disclosure',
    );
    const timeoutAccess = (await read(
      contracts.timeoutSpike,
      spikeArtifact,
      'aggregateAccess',
    )) as readonly boolean[];
    if (timeoutAccess.length !== 3 || !timeoutAccess[0] || !timeoutAccess[1] || timeoutAccess[2]) {
      fail('The threshold epoch did not expose exactly the YES and NO aggregate handles.');
    }
    await sendExpectedRevert(
      deployer,
      deployerWallet,
      contracts.timeoutSpike,
      spikeData('cancelBeforeUnwrap'),
      'pre-unwrap timeout before the recovery window',
    );
    const timeoutAvailableAt =
      ((await read(contracts.timeoutSpike, spikeArtifact, 'aggregatePendingSince')) as bigint) +
      AGGREGATE_TIMEOUT_SECONDS;
    await waitUntil(rpcUrl, timeoutAvailableAt);
    await send(
      secondary,
      secondaryWallet,
      contracts.timeoutSpike,
      spikeData('cancelBeforeUnwrap'),
      'permissionless pre-unwrap timeout cancellation',
    );
    if ((await read(contracts.timeoutSpike, spikeArtifact, 'state')) !== 4) {
      fail('The pre-unwrap timeout did not enter the refund state.');
    }
    await refundAndAssertBalance(
      contracts.timeoutSpike,
      deployer,
      deployerWallet,
      deployerHandleClient,
      initialDeployerBalance,
      'refund timeout first member',
    );
    await refundAndAssertBalance(
      contracts.timeoutSpike,
      secondary,
      secondaryWallet,
      secondaryHandleClient,
      initialSecondaryBalance,
      'refund timeout independent member',
    );
    if (timeoutOnly) {
      clearSecondaryPrivateKey();
      console.log(
        JSON.stringify({
          contracts: contracts,
          lifecycleAssertionsVerified: 9,
          negativeAssertionsVerified: 5,
          status: 'passed',
          workItem: 'FND-05-TIMEOUT',
        }),
      );
      return;
    }
  }

  failureStage = 'aggregate proof and unwrap recovery path';
  if (!recoveryResumeContracts) {
    await commit(
      contracts.recoverySpike,
      deployer,
      deployerWallet,
      deployerHandleClient,
      MEMBER_ONE_STAKE,
      MEMBER_ONE_PROBABILITY_BPS,
      'recovery first member',
    );
    await commit(
      contracts.recoverySpike,
      secondary,
      secondaryWallet,
      secondaryHandleClient,
      MEMBER_TWO_STAKE,
      MEMBER_TWO_PROBABILITY_BPS,
      'recovery independent member',
    );
  }
  const recoveryDeadline = (await read(
    contracts.recoverySpike,
    spikeArtifact,
    'deadline',
  )) as bigint;
  await waitUntil(rpcUrl, recoveryDeadline);
  await send(
    deployer,
    deployerWallet,
    contracts.recoverySpike,
    spikeData('closeEpoch'),
    'close threshold epoch for recovery',
  );
  await send(
    deployer,
    deployerWallet,
    contracts.recoverySpike,
    spikeData('requestAggregateDecrypt'),
    'request recovery epoch aggregate disclosure',
  );
  const [recoveryHandles, recoveryRequestId, crossPoolRequestId, deployerPositionHandles] =
    (await Promise.all([
      read(contracts.recoverySpike, spikeArtifact, 'aggregateHandles'),
      read(contracts.recoverySpike, spikeArtifact, 'aggregateRequestId'),
      read(contracts.recoverySpike, spikeArtifact, 'aggregateProofContext', [
        BigInt(EXPECTED_CHAIN_ID),
        contracts.timeoutSpike,
        1n,
      ]),
      read(contracts.recoverySpike, spikeArtifact, 'positionHandles', [deployer.address]),
    ])) as [readonly Hex[], Hex, Hex, readonly Hex[]];
  const [publicYes, publicNo] = await Promise.all([
    waitForPublicUint(deployerHandleClient, recoveryHandles[0]!),
    waitForPublicUint(deployerHandleClient, recoveryHandles[1]!),
  ]);
  if (publicYes.value !== EXPECTED_AGGREGATE_YES || publicNo.value !== EXPECTED_AGGREGATE_NO) {
    fail('The revealed aggregate did not match the encrypted cohort allocation.');
  }
  await assertRejected(
    () => deployerHandleClient.publicDecrypt(recoveryHandles[2]!),
    'Aggregate total public decryption',
  );
  await assertRejected(
    () => deployerHandleClient.publicDecrypt(deployerPositionHandles[0]!),
    'Owner-shaped stake public decryption',
  );
  const wrongChainRequestId = (await read(
    contracts.recoverySpike,
    spikeArtifact,
    'aggregateProofContext',
    [BigInt(EXPECTED_CHAIN_ID + 1), contracts.recoverySpike, 1n],
  )) as Hex;
  const wrongEpochRequestId = (await read(
    contracts.recoverySpike,
    spikeArtifact,
    'aggregateProofContext',
    [BigInt(EXPECTED_CHAIN_ID), contracts.recoverySpike, 2n],
  )) as Hex;
  for (const [requestId, scenario] of [
    [crossPoolRequestId, 'Cross-pool aggregate proof context'],
    [wrongChainRequestId, 'Wrong-chain aggregate proof context'],
    [wrongEpochRequestId, 'Wrong-epoch aggregate proof context'],
  ] as const) {
    await sendExpectedRevert(
      deployer,
      deployerWallet,
      contracts.recoverySpike,
      spikeData('finalizeAggregate', [
        requestId,
        publicYes.value,
        publicNo.value,
        publicYes.decryptionProof,
        publicNo.decryptionProof,
      ]),
      scenario,
    );
  }
  await sendExpectedRevert(
    deployer,
    deployerWallet,
    contracts.recoverySpike,
    spikeData('finalizeAggregate', [
      recoveryRequestId,
      publicYes.value + 1n,
      publicNo.value,
      publicYes.decryptionProof,
      publicNo.decryptionProof,
    ]),
    'Substituted aggregate plaintext',
  );
  await send(
    deployer,
    deployerWallet,
    contracts.recoverySpike,
    spikeData('finalizeAggregate', [
      recoveryRequestId,
      publicYes.value,
      publicNo.value,
      publicYes.decryptionProof,
      publicNo.decryptionProof,
    ]),
    'finalize context-bound aggregate and request unwrap',
  );
  await sendExpectedRevert(
    deployer,
    deployerWallet,
    contracts.recoverySpike,
    spikeData('finalizeAggregate', [
      recoveryRequestId,
      publicYes.value,
      publicNo.value,
      publicYes.decryptionProof,
      publicNo.decryptionProof,
    ]),
    'Replayed aggregate proof',
  );
  const [unwrapHandle, recoveryAvailableAt] = (await Promise.all([
    read(contracts.recoverySpike, spikeArtifact, 'unwrapRequestHandle'),
    read(contracts.recoverySpike, spikeArtifact, 'recoveryAvailableAt'),
  ])) as [Hex, bigint];
  const unwrap = await waitForPublicUint(deployerHandleClient, unwrapHandle);
  if (unwrap.value !== EXPECTED_AGGREGATE_TOTAL) {
    fail('The unwrap request did not match the encrypted aggregate total.');
  }
  await sendExpectedRevert(
    secondary,
    secondaryWallet,
    contracts.recoverySpike,
    spikeData('recoverUnwrap', [unwrap.decryptionProof]),
    'Delayed unwrap recovery before the recovery window',
  );
  await waitUntil(rpcUrl, recoveryAvailableAt);
  await send(
    secondary,
    secondaryWallet,
    contracts.recoverySpike,
    spikeData('recoverUnwrap', [unwrap.decryptionProof]),
    'permissionless finalize unwrap and rewrap recovery',
  );
  const [recoveryState, recoveryReleased, publicUnderlyingBalance] = await Promise.all([
    read(contracts.recoverySpike, spikeArtifact, 'state'),
    read(contracts.recoverySpike, spikeArtifact, 'observedReleasedAmount'),
    read(contracts.fixture, fixtureArtifact, 'balanceOf', [contracts.recoverySpike]),
  ]);
  if (
    recoveryState !== 4 ||
    recoveryReleased !== EXPECTED_AGGREGATE_TOTAL ||
    publicUnderlyingBalance !== 0n
  ) {
    fail('The recovery did not rewrap exactly the observed released collateral.');
  }
  await refundAndAssertBalance(
    contracts.recoverySpike,
    deployer,
    deployerWallet,
    deployerHandleClient,
    initialDeployerBalance,
    'refund recovered first member',
  );
  await refundAndAssertBalance(
    contracts.recoverySpike,
    secondary,
    secondaryWallet,
    secondaryHandleClient,
    initialSecondaryBalance,
    'refund recovered independent member',
  );
  clearSecondaryPrivateKey();

  console.log(
    JSON.stringify({
      workItem: requestedCase,
      contracts: contracts,
      lifecycleAssertionsVerified: 16,
      negativeAssertionsVerified: 13,
      status: 'passed',
    }),
  );
}

main().catch(() => {
  console.error(
    `FND-05 failed during ${failureStage}: inspect the sanitized receipt, spend ledger, and Nox feedback report.`,
  );
  process.exitCode = 1;
});
