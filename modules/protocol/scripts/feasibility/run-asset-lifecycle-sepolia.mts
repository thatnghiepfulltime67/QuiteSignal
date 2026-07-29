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
  getContractAddress,
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
const FIXTURE_AMOUNT = 100_000n;
const FIXTURE_MINT = FIXTURE_AMOUNT * 2n;
const RECOVERY_DELAY_SECONDS = 30n;
const PUBLIC_DECRYPT_MAX_ATTEMPTS = 8;
const PUBLIC_DECRYPT_RETRY_DELAY_MS = 5_000;

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
  directSpike: Address;
  recoverySpike: Address;
  mismatchSpike: Address;
}

interface CoreContractSet {
  fixture: Address;
  wrapper: Address;
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
  'AssetLifecycleSpike.sol/AssetLifecycleSpike.json',
);
const spendLedgerPath = resolve(repositoryRoot, 'evidence/sepolia/spend-ledger.json');
let failureStage = 'configuration validation';

function fail(message: string): never {
  throw new Error(message);
}

function loadEnvironment(): void {
  const environmentPath = resolve(repositoryRoot, '.env');
  if (existsSync(environmentPath)) {
    process.loadEnvFile(environmentPath);
  }
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
        if (offset + span > normalized.length) {
          return undefined;
        }
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
  if (status.length > 0) {
    fail('Sepolia writes require a clean source tree.');
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

function configuredSingleTransactionCapWei(ledger: SpendLedger): bigint {
  const configuredCap = process.env.SEPOLIA_MAX_SINGLE_TX_ETH;
  if (!configuredCap) {
    return BigInt(ledger.maxTotalSpendWei);
  }
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

function assertSingleTransactionBudget(estimate: bigint, singleTransactionCapWei: bigint): void {
  if (estimate > singleTransactionCapWei) {
    fail('The proposed Sepolia write exceeds the single-transaction gas allowance.');
  }
}

function contractSet(): ContractSet | undefined {
  const argument = process.argv.find((value) => value.startsWith('--verify-contracts='));
  if (!argument) {
    return undefined;
  }
  const values = argument.slice('--verify-contracts='.length).split(',');
  if (values.length !== 5 || values.some((value) => !isAddress(value))) {
    fail('Five comma-separated FND-04 contract addresses are required for verification.');
  }
  const fixture = values[0] as Address;
  const wrapper = values[1] as Address;
  const directSpike = values[2] as Address;
  const recoverySpike = values[3] as Address;
  const mismatchSpike = values[4] as Address;
  return { fixture, wrapper, directSpike, recoverySpike, mismatchSpike };
}

function reusableCoreSet(): CoreContractSet | undefined {
  const argument = process.argv.find((value) => value.startsWith('--reuse-core='));
  if (!argument) {
    return undefined;
  }
  const values = argument.slice('--reuse-core='.length).split(',');
  if (values.length !== 2 || values.some((value) => !isAddress(value))) {
    fail('Two comma-separated fixture and wrapper addresses are required for core reuse.');
  }
  return { fixture: values[0] as Address, wrapper: values[1] as Address };
}

async function assertRejected(action: () => Promise<unknown>, scenario: string): Promise<void> {
  try {
    await action();
  } catch {
    return;
  }
  fail(`${scenario} did not fail on Sepolia.`);
}

async function waitForPublicDecrypt(
  handleClient: Awaited<ReturnType<typeof createViemHandleClient>>,
  handle: Hex,
): Promise<{ value: bigint; decryptionProof: Hex }> {
  for (let attempt = 1; attempt <= PUBLIC_DECRYPT_MAX_ATTEMPTS; ++attempt) {
    try {
      const result = await handleClient.publicDecrypt(handle);
      if (typeof result.value !== 'bigint') {
        fail('The public unwrap result did not decode as an unsigned integer.');
      }
      return { value: result.value, decryptionProof: result.decryptionProof as Hex };
    } catch {
      if (attempt === PUBLIC_DECRYPT_MAX_ATTEMPTS) {
        fail(
          'The public unwrap decryption was unavailable after the bounded gateway retry window.',
        );
      }
      await delay(PUBLIC_DECRYPT_RETRY_DELAY_MS);
    }
  }
  fail('The public unwrap decryption did not produce a result.');
}

async function waitForPublicBoolean(
  handleClient: Awaited<ReturnType<typeof createViemHandleClient>>,
  handle: Hex,
): Promise<{ value: boolean; decryptionProof: Hex }> {
  for (let attempt = 1; attempt <= PUBLIC_DECRYPT_MAX_ATTEMPTS; ++attempt) {
    try {
      const result = await handleClient.publicDecrypt(handle);
      if (typeof result.value !== 'boolean') {
        fail('The deposit acceptance result did not decode as a boolean.');
      }
      return { value: result.value, decryptionProof: result.decryptionProof as Hex };
    } catch {
      if (attempt === PUBLIC_DECRYPT_MAX_ATTEMPTS) {
        fail(
          'The deposit acceptance proof was unavailable after the bounded gateway retry window.',
        );
      }
      await delay(PUBLIC_DECRYPT_RETRY_DELAY_MS);
    }
  }
  fail('The deposit acceptance proof did not produce a result.');
}

async function decryptOwnerValue(
  handleClient: Awaited<ReturnType<typeof createViemHandleClient>>,
  handle: Hex,
): Promise<bigint> {
  for (let attempt = 1; attempt <= PUBLIC_DECRYPT_MAX_ATTEMPTS; ++attempt) {
    try {
      const result = await handleClient.decrypt(handle);
      if (typeof result.value !== 'bigint') {
        fail('The owner confidential balance did not decode as an unsigned integer.');
      }
      return result.value;
    } catch {
      if (attempt === PUBLIC_DECRYPT_MAX_ATTEMPTS) {
        fail(
          'The owner confidential balance was unavailable after the bounded gateway retry window.',
        );
      }
      await delay(PUBLIC_DECRYPT_RETRY_DELAY_MS);
    }
  }
  fail('The owner confidential balance did not produce a result.');
}

async function assertOwnerDecrypt(
  handleClient: Awaited<ReturnType<typeof createViemHandleClient>>,
  handle: Hex,
  expected: bigint,
): Promise<void> {
  if ((await decryptOwnerValue(handleClient, handle)) !== expected) {
    fail('The owner confidential balance did not match the in-memory expected fixture value.');
  }
}

async function waitForRecoveryDelay(
  publicClient: ReturnType<typeof createPublicClient>,
  availableAt: bigint,
): Promise<void> {
  while ((await publicClient.getBlock()).timestamp < availableAt) {
    await delay(PUBLIC_DECRYPT_RETRY_DELAY_MS);
  }
}

async function main(): Promise<void> {
  loadEnvironment();

  const dryRun = process.argv.includes('--dry-run');
  const requestedCase = process.argv.find((argument) => argument === 'FND-04');
  const verifiedContracts = contractSet();
  const reusableCore = reusableCoreSet();
  if (!requestedCase) {
    fail('The FND-04 case identifier is required.');
  }
  if (verifiedContracts && reusableCore) {
    fail('Read-only verification and reusable-core options cannot be combined.');
  }
  if (dryRun && (verifiedContracts || reusableCore)) {
    fail('Read-only verification cannot be combined with the deployment dry-run.');
  }

  const privateKey = process.env.SEPOLIA_PRIVATE_KEY;
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!privateKey || !rpcUrl) {
    fail('The local Sepolia asset feasibility configuration is incomplete.');
  }
  if (!dryRun && !verifiedContracts && process.env.CONFIRM_SEPOLIA_WRITE !== CONFIRMATION_VALUE) {
    fail('Set CONFIRM_SEPOLIA_WRITE=yes only after reviewing the dry-run plan.');
  }

  const deployer = privateKeyToAccount(privateKey as Hex);
  const unrelated = privateKeyToAccount(generatePrivateKey());
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const deployerWallet = createWalletClient({
    account: deployer,
    chain: sepolia,
    transport: http(rpcUrl),
  });
  const ownerHandleClient = await createViemHandleClient(deployerWallet);
  const fixtureArtifact = loadArtifact(fixtureArtifactPath, 'ERC-20 fixture');
  const wrapperArtifact = loadArtifact(wrapperArtifactPath, 'confidential wrapper');
  const spikeArtifact = loadArtifact(spikeArtifactPath, 'asset lifecycle spike');
  const ledger = loadLedger();
  const singleTransactionCapWei = configuredSingleTransactionCapWei(ledger);

  failureStage = 'Ethereum Sepolia preflight';
  if ((await publicClient.getChainId()) !== EXPECTED_CHAIN_ID) {
    fail('The configured RPC is not Ethereum Sepolia.');
  }
  if ((await publicClient.getBalance({ address: deployer.address })) === 0n) {
    fail('The configured throwaway Sepolia wallet has no balance.');
  }

  let contracts: ContractSet;
  if (verifiedContracts) {
    failureStage = 'existing asset harness runtime verification';
    const [fixtureRuntime, wrapperRuntime, directRuntime, recoveryRuntime, mismatchRuntime] =
      await Promise.all([
        publicClient.getCode({ address: verifiedContracts.fixture }),
        publicClient.getCode({ address: verifiedContracts.wrapper }),
        publicClient.getCode({ address: verifiedContracts.directSpike }),
        publicClient.getCode({ address: verifiedContracts.recoverySpike }),
        publicClient.getCode({ address: verifiedContracts.mismatchSpike }),
      ]);
    if (
      !fixtureRuntime ||
      !wrapperRuntime ||
      !directRuntime ||
      !recoveryRuntime ||
      !mismatchRuntime ||
      !runtimeMatchesArtifact(fixtureRuntime, fixtureArtifact) ||
      !runtimeMatchesArtifact(wrapperRuntime, wrapperArtifact) ||
      !runtimeMatchesArtifact(directRuntime, spikeArtifact) ||
      !runtimeMatchesArtifact(recoveryRuntime, spikeArtifact) ||
      !runtimeMatchesArtifact(mismatchRuntime, spikeArtifact)
    ) {
      fail('An existing FND-04 harness runtime does not match the compiled artifact.');
    }
    contracts = verifiedContracts;
  } else if (reusableCore) {
    failureStage = 'reusable asset core runtime verification';
    const [fixtureRuntime, wrapperRuntime] = await Promise.all([
      publicClient.getCode({ address: reusableCore.fixture }),
      publicClient.getCode({ address: reusableCore.wrapper }),
    ]);
    if (
      !fixtureRuntime ||
      !wrapperRuntime ||
      !runtimeMatchesArtifact(fixtureRuntime, fixtureArtifact) ||
      !runtimeMatchesArtifact(wrapperRuntime, wrapperArtifact)
    ) {
      fail('A reusable FND-04 core runtime does not match the compiled artifact.');
    }

    const directData = encodeDeployData({
      abi: spikeArtifact.abi,
      bytecode: spikeArtifact.bytecode,
      args: [reusableCore.wrapper, reusableCore.fixture, RECOVERY_DELAY_SECONDS],
    } as never);
    const recoveryData = encodeDeployData({
      abi: spikeArtifact.abi,
      bytecode: spikeArtifact.bytecode,
      args: [reusableCore.wrapper, reusableCore.fixture, RECOVERY_DELAY_SECONDS],
    } as never);
    const mismatchData = encodeDeployData({
      abi: spikeArtifact.abi,
      bytecode: spikeArtifact.bytecode,
      args: [reusableCore.wrapper, reusableCore.fixture, RECOVERY_DELAY_SECONDS],
    } as never);
    const [directGas, recoveryGas, mismatchGas] = await Promise.all([
      publicClient.estimateGas({ account: deployer.address, data: directData }),
      publicClient.estimateGas({ account: deployer.address, data: recoveryData }),
      publicClient.estimateGas({ account: deployer.address, data: mismatchData }),
    ]);
    const fees = await publicClient.estimateFeesPerGas();
    const maxFeePerGas = fees.maxFeePerGas ?? (await publicClient.getGasPrice());
    const deploymentMaximumCost = (directGas + recoveryGas + mismatchGas) * maxFeePerGas;
    assertBudget(ledger, deploymentMaximumCost);
    assertSingleTransactionBudget(directGas * maxFeePerGas, singleTransactionCapWei);
    assertSingleTransactionBudget(recoveryGas * maxFeePerGas, singleTransactionCapWei);
    assertSingleTransactionBudget(mismatchGas * maxFeePerGas, singleTransactionCapWei);
    console.log(
      JSON.stringify({
        mode: 'confirmed-write',
        workItem: 'FND-04',
        firstAction:
          'deploy three intent-bound lifecycle spikes against the bytecode-matched reusable core',
        deployments: 3,
        estimatedMaximumDeploymentGasCostWei: deploymentMaximumCost.toString(),
        singleTransactionCapWei: singleTransactionCapWei.toString(),
        remainingAllowanceWei: (BigInt(ledger.maxTotalSpendWei) - totalSpendWei(ledger)).toString(),
      }),
    );
    assertCleanSourceTree();
    const deploySpike = async (gas: bigint, action: string): Promise<Address> => {
      failureStage = action;
      const currentFees = await publicClient.estimateFeesPerGas();
      const currentMaxFeePerGas = currentFees.maxFeePerGas ?? (await publicClient.getGasPrice());
      const maximumCost = gas * currentMaxFeePerGas;
      assertBudget(ledger, maximumCost);
      assertSingleTransactionBudget(maximumCost, singleTransactionCapWei);
      const hash = await deployerWallet.deployContract({
        account: deployer,
        abi: spikeArtifact.abi,
        bytecode: spikeArtifact.bytecode,
        args: [reusableCore.wrapper, reusableCore.fixture, RECOVERY_DELAY_SECONDS] as never,
        gas,
        maxFeePerGas: currentMaxFeePerGas,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      appendSpend(ledger, {
        workItemId: 'FND-04',
        phase: 'P0',
        sender: deployer.address,
        transactionHash: hash,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.effectiveGasPrice.toString(),
        actualGasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
      });
      if (receipt.status !== 'success' || !receipt.contractAddress) {
        fail('A corrected FND-04 lifecycle spike deployment did not succeed.');
      }
      return receipt.contractAddress;
    };
    const directSpike = await deploySpike(directGas, 'corrected direct return spike deployment');
    const recoverySpike = await deploySpike(recoveryGas, 'corrected recovery spike deployment');
    const mismatchSpike = await deploySpike(
      mismatchGas,
      'encrypted intent mismatch spike deployment',
    );
    contracts = {
      fixture: reusableCore.fixture,
      wrapper: reusableCore.wrapper,
      directSpike,
      recoverySpike,
      mismatchSpike,
    };
  } else {
    failureStage = 'deployment dry-run planning';
    const nonce = BigInt(await publicClient.getTransactionCount({ address: deployer.address }));
    const fixtureAddress = getContractAddress({ from: deployer.address, nonce });
    const wrapperAddress = getContractAddress({ from: deployer.address, nonce: nonce + 1n });
    const directSpikeAddress = getContractAddress({ from: deployer.address, nonce: nonce + 2n });
    const recoverySpikeAddress = getContractAddress({ from: deployer.address, nonce: nonce + 3n });
    const mismatchSpikeAddress = getContractAddress({ from: deployer.address, nonce: nonce + 4n });
    const fixtureData = encodeDeployData({
      abi: fixtureArtifact.abi,
      bytecode: fixtureArtifact.bytecode,
    });
    const wrapperData = encodeDeployData({
      abi: wrapperArtifact.abi,
      bytecode: wrapperArtifact.bytecode,
      args: [fixtureAddress],
    } as never);
    const directData = encodeDeployData({
      abi: spikeArtifact.abi,
      bytecode: spikeArtifact.bytecode,
      args: [wrapperAddress, fixtureAddress, RECOVERY_DELAY_SECONDS],
    } as never);
    const recoveryData = encodeDeployData({
      abi: spikeArtifact.abi,
      bytecode: spikeArtifact.bytecode,
      args: [wrapperAddress, fixtureAddress, RECOVERY_DELAY_SECONDS],
    } as never);
    const mismatchData = encodeDeployData({
      abi: spikeArtifact.abi,
      bytecode: spikeArtifact.bytecode,
      args: [wrapperAddress, fixtureAddress, RECOVERY_DELAY_SECONDS],
    } as never);
    const fixtureGas = await publicClient.estimateGas({
      account: deployer.address,
      data: fixtureData,
    });
    const wrapperGas = await publicClient.estimateGas({
      account: deployer.address,
      data: wrapperData,
    });
    const directGas = await publicClient.estimateGas({
      account: deployer.address,
      data: directData,
    });
    const recoveryGas = await publicClient.estimateGas({
      account: deployer.address,
      data: recoveryData,
    });
    const mismatchGas = await publicClient.estimateGas({
      account: deployer.address,
      data: mismatchData,
    });
    const fees = await publicClient.estimateFeesPerGas();
    const maxFeePerGas = fees.maxFeePerGas ?? (await publicClient.getGasPrice());
    const deploymentMaximumCost =
      (fixtureGas + wrapperGas + directGas + recoveryGas + mismatchGas) * maxFeePerGas;
    assertBudget(ledger, deploymentMaximumCost);
    for (const gas of [fixtureGas, wrapperGas, directGas, recoveryGas, mismatchGas]) {
      assertSingleTransactionBudget(gas * maxFeePerGas, singleTransactionCapWei);
    }
    console.log(
      JSON.stringify({
        mode: dryRun ? 'dry-run' : 'confirmed-write',
        workItem: 'FND-04',
        firstAction:
          'deploy isolated fixture collateral, confidential wrapper, and three intent-bound lifecycle spikes',
        deployments: 5,
        estimatedMaximumDeploymentGasCostWei: deploymentMaximumCost.toString(),
        singleTransactionCapWei: singleTransactionCapWei.toString(),
        remainingAllowanceWei: (BigInt(ledger.maxTotalSpendWei) - totalSpendWei(ledger)).toString(),
      }),
    );
    if (dryRun) {
      return;
    }

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
        workItemId: 'FND-04',
        phase: 'P0',
        sender: deployer.address,
        transactionHash: hash,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.effectiveGasPrice.toString(),
        actualGasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
      });
      if (receipt.status !== 'success' || !receipt.contractAddress) {
        fail('An isolated FND-04 harness deployment did not succeed.');
      }
      return receipt.contractAddress;
    };

    const fixture = await deploy(fixtureArtifact, [], fixtureGas, 'fixture collateral deployment');
    const wrapper = await deploy(
      wrapperArtifact,
      [fixture],
      wrapperGas,
      'confidential wrapper deployment',
    );
    const directSpike = await deploy(
      spikeArtifact,
      [wrapper, fixture, RECOVERY_DELAY_SECONDS],
      directGas,
      'direct return spike deployment',
    );
    const recoverySpike = await deploy(
      spikeArtifact,
      [wrapper, fixture, RECOVERY_DELAY_SECONDS],
      recoveryGas,
      'recovery spike deployment',
    );
    const mismatchSpike = await deploy(
      spikeArtifact,
      [wrapper, fixture, RECOVERY_DELAY_SECONDS],
      mismatchGas,
      'encrypted intent mismatch spike deployment',
    );
    contracts = { fixture, wrapper, directSpike, recoverySpike, mismatchSpike };
  }

  failureStage = 'wrapper collateral binding verification';
  const configuredUnderlying = (await publicClient.readContract({
    address: contracts.wrapper,
    abi: wrapperArtifact.abi,
    functionName: 'underlying',
  } as never)) as Address;
  if (configuredUnderlying.toLowerCase() !== contracts.fixture.toLowerCase()) {
    fail('The confidential wrapper does not bind the expected fixture collateral.');
  }
  const [
    directWrapper,
    directUnderlying,
    recoveryWrapper,
    recoveryUnderlying,
    mismatchWrapper,
    mismatchUnderlying,
  ] = await Promise.all([
    publicClient.readContract({
      address: contracts.directSpike,
      abi: spikeArtifact.abi,
      functionName: 'wrapper',
    } as never),
    publicClient.readContract({
      address: contracts.directSpike,
      abi: spikeArtifact.abi,
      functionName: 'underlying',
    } as never),
    publicClient.readContract({
      address: contracts.recoverySpike,
      abi: spikeArtifact.abi,
      functionName: 'wrapper',
    } as never),
    publicClient.readContract({
      address: contracts.recoverySpike,
      abi: spikeArtifact.abi,
      functionName: 'underlying',
    } as never),
    publicClient.readContract({
      address: contracts.mismatchSpike,
      abi: spikeArtifact.abi,
      functionName: 'wrapper',
    } as never),
    publicClient.readContract({
      address: contracts.mismatchSpike,
      abi: spikeArtifact.abi,
      functionName: 'underlying',
    } as never),
  ]);
  if (
    (directWrapper as Address).toLowerCase() !== contracts.wrapper.toLowerCase() ||
    (recoveryWrapper as Address).toLowerCase() !== contracts.wrapper.toLowerCase() ||
    (directUnderlying as Address).toLowerCase() !== contracts.fixture.toLowerCase() ||
    (recoveryUnderlying as Address).toLowerCase() !== contracts.fixture.toLowerCase() ||
    (mismatchWrapper as Address).toLowerCase() !== contracts.wrapper.toLowerCase() ||
    (mismatchUnderlying as Address).toLowerCase() !== contracts.fixture.toLowerCase()
  ) {
    fail('An asset lifecycle spike does not bind the expected wrapper and fixture collateral.');
  }

  const send = async (to: Address, data: Hex, action: string): Promise<Hash> => {
    failureStage = `${action} dry-run planning`;
    const [gas, fees] = await Promise.all([
      publicClient.estimateGas({ account: deployer.address, to, data }),
      publicClient.estimateFeesPerGas(),
    ]);
    const maxFeePerGas = fees.maxFeePerGas ?? (await publicClient.getGasPrice());
    const maximumCost = gas * maxFeePerGas;
    assertBudget(ledger, maximumCost);
    assertSingleTransactionBudget(maximumCost, singleTransactionCapWei);
    console.log(
      JSON.stringify({
        mode: 'confirmed-write',
        workItem: 'FND-04',
        action,
        estimatedMaximumGasCostWei: maximumCost.toString(),
        singleTransactionCapWei: singleTransactionCapWei.toString(),
        remainingAllowanceWei: (BigInt(ledger.maxTotalSpendWei) - totalSpendWei(ledger)).toString(),
      }),
    );
    failureStage = action;
    const hash = await deployerWallet.sendTransaction({
      account: deployer,
      to,
      data,
      gas,
      maxFeePerGas,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    appendSpend(ledger, {
      workItemId: 'FND-04',
      phase: 'P0',
      sender: deployer.address,
      transactionHash: hash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice.toString(),
      actualGasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
    });
    if (receipt.status !== 'success') {
      fail(`The ${action} transaction did not succeed.`);
    }
    return hash;
  };

  const fixtureData = (functionName: string, args: readonly unknown[] = []): Hex =>
    encodeFunctionData({ abi: fixtureArtifact.abi, functionName, args } as never);
  const wrapperData = (functionName: string, args: readonly unknown[] = []): Hex =>
    encodeFunctionData({ abi: wrapperArtifact.abi, functionName, args } as never);
  const spikeData = (functionName: string, args: readonly unknown[] = []): Hex =>
    encodeFunctionData({ abi: spikeArtifact.abi, functionName, args } as never);
  const read = async (
    address: Address,
    artifact: Artifact,
    functionName: string,
    args: readonly unknown[] = [],
  ): Promise<unknown> =>
    publicClient.readContract({ address, abi: artifact.abi, functionName, args } as never);

  if (verifiedContracts) {
    failureStage = 'FND-04 final read-only verification';
    const [directState, recoveryState, mismatchState, observedReleasedAmount, ownerBalance] =
      await Promise.all([
        read(contracts.directSpike, spikeArtifact, 'state'),
        read(contracts.recoverySpike, spikeArtifact, 'state'),
        read(contracts.mismatchSpike, spikeArtifact, 'state'),
        read(contracts.recoverySpike, spikeArtifact, 'observedReleasedAmount'),
        read(contracts.wrapper, wrapperArtifact, 'confidentialBalanceOf', [deployer.address]),
      ]);
    if (
      directState !== 6 ||
      recoveryState !== 6 ||
      mismatchState !== 7 ||
      observedReleasedAmount !== FIXTURE_AMOUNT ||
      typeof ownerBalance !== 'string'
    ) {
      fail('The recorded FND-04 lifecycle state did not match the required terminal state.');
    }
    if ((await decryptOwnerValue(ownerHandleClient, ownerBalance as Hex)) === 0n) {
      fail('The terminal owner confidential balance was unexpectedly zero.');
    }
    console.log(
      JSON.stringify({
        workItem: 'FND-04',
        contractsVerified: 5,
        terminalLifecycleAssertionsVerified: 5,
        status: 'passed',
      }),
    );
    return;
  }

  if (!reusableCore) {
    failureStage = 'fixture collateral mint';
    await send(
      contracts.fixture,
      fixtureData('mint', [deployer.address, FIXTURE_MINT]),
      'mint fixture collateral',
    );
    await send(
      contracts.fixture,
      fixtureData('approve', [contracts.wrapper, FIXTURE_MINT]),
      'approve fixture collateral wrapper',
    );
    await send(
      contracts.wrapper,
      wrapperData('wrap', [deployer.address, FIXTURE_AMOUNT]),
      'wrap direct-return collateral',
    );
  }

  const initialOwnerBalanceHandle = (await read(
    contracts.wrapper,
    wrapperArtifact,
    'confidentialBalanceOf',
    [deployer.address],
  )) as Hex;
  const initialOwnerBalance = await decryptOwnerValue(ownerHandleClient, initialOwnerBalanceHandle);

  const registerIntent = async (spike: Address, action: string): Promise<EncryptedValue> => {
    failureStage = `${action} encryption`;
    const intent = (await ownerHandleClient.encryptInput(
      FIXTURE_AMOUNT,
      'uint256',
      spike,
    )) as EncryptedValue;
    await send(
      spike,
      spikeData('registerExpectedStake', [intent.handle, intent.handleProof]),
      action,
    );
    return intent;
  };

  const transferAndReadAcceptance = async (
    spike: Address,
    amount: bigint,
    action: string,
  ): Promise<{ value: boolean; decryptionProof: Hex }> => {
    failureStage = `${action} encryption`;
    const transferInput = (await ownerHandleClient.encryptInput(
      amount,
      'uint256',
      contracts.wrapper,
    )) as EncryptedValue;
    await send(
      contracts.wrapper,
      wrapperData('confidentialTransferAndCall', [
        spike,
        transferInput.handle,
        transferInput.handleProof,
        '0x',
      ]),
      action,
    );
    const acceptanceHandle = (await read(spike, spikeArtifact, 'depositAcceptanceHandle')) as Hex;
    return waitForPublicBoolean(ownerHandleClient, acceptanceHandle);
  };

  failureStage = 'direct encrypted intent registration';
  const directIntent = await registerIntent(
    contracts.directSpike,
    'register direct encrypted stake intent',
  );
  await assertRejected(
    () =>
      publicClient.call({
        account: deployer.address,
        to: contracts.directSpike,
        data: spikeData('registerExpectedStake', [directIntent.handle, directIntent.handleProof]),
      }),
    'Replayed encrypted stake intent',
  );
  const directAcceptance = await transferAndReadAcceptance(
    contracts.directSpike,
    FIXTURE_AMOUNT,
    'encrypted direct-return collateral pull',
  );
  if (!directAcceptance.value) {
    fail('The matching direct encrypted stake intent was not accepted.');
  }
  await assertRejected(
    () =>
      publicClient.call({
        account: deployer.address,
        to: contracts.directSpike,
        data: spikeData('finalizeDepositAcceptance', ['0x']),
      }),
    'Malformed direct deposit acceptance proof',
  );
  await send(
    contracts.directSpike,
    spikeData('finalizeDepositAcceptance', [directAcceptance.decryptionProof]),
    'finalize matching direct encrypted stake intent',
  );

  failureStage = 'direct return negative checks';
  await assertRejected(
    () =>
      publicClient.call({
        account: unrelated.address,
        to: contracts.directSpike,
        data: spikeData('returnToOwner', [deployer.address]),
      }),
    'Unauthorized confidential return',
  );
  await assertRejected(
    () =>
      publicClient.call({
        account: deployer.address,
        to: contracts.directSpike,
        data: spikeData('returnToOwner', [unrelated.address]),
      }),
    'Wrong confidential return recipient',
  );
  await assertRejected(
    () =>
      publicClient.call({
        account: deployer.address,
        to: contracts.directSpike,
        data: spikeData('onConfidentialTransferReceived', [
          deployer.address,
          deployer.address,
          `0x${'00'.repeat(32)}`,
          '0x',
        ]),
      }),
    'Wrong wrapper callback',
  );
  const missingAccessInput = (await ownerHandleClient.encryptInput(
    FIXTURE_AMOUNT,
    'uint256',
    contracts.wrapper,
  )) as EncryptedValue;
  await assertRejected(
    () =>
      publicClient.call({
        account: deployer.address,
        to: contracts.directSpike,
        data: spikeData('probeMissingAccess', [missingAccessInput.handle]),
      }),
    'Missing callback ACL',
  );

  await send(
    contracts.directSpike,
    spikeData('returnToOwner', [deployer.address]),
    'return confidential collateral to recorded owner',
  );
  await assertRejected(
    () =>
      publicClient.call({
        account: deployer.address,
        to: contracts.directSpike,
        data: spikeData('returnToOwner', [deployer.address]),
      }),
    'Repeated confidential return',
  );
  const directOwnerBalance = (await read(
    contracts.wrapper,
    wrapperArtifact,
    'confidentialBalanceOf',
    [deployer.address],
  )) as Hex;
  await assertOwnerDecrypt(ownerHandleClient, directOwnerBalance, initialOwnerBalance);
  await assertRejected(
    () => ownerHandleClient.publicDecrypt(directOwnerBalance),
    'Public decryption of owner confidential balance',
  );

  await registerIntent(contracts.mismatchSpike, 'register mismatch encrypted stake intent');
  const mismatchAcceptance = await transferAndReadAcceptance(
    contracts.mismatchSpike,
    FIXTURE_AMOUNT / 2n,
    'submit mismatched encrypted stake for wrapper refund',
  );
  if (mismatchAcceptance.value) {
    fail('The mismatched encrypted stake intent was unexpectedly accepted.');
  }
  await assertRejected(
    () =>
      publicClient.call({
        account: deployer.address,
        to: contracts.mismatchSpike,
        data: spikeData('finalizeDepositAcceptance', [mismatchAcceptance.decryptionProof]),
      }),
    'Mismatched deposit acceptance finalization',
  );
  await assertRejected(
    () =>
      publicClient.call({
        account: deployer.address,
        to: contracts.mismatchSpike,
        data: spikeData('rejectDeposit', ['0x']),
      }),
    'Malformed mismatched deposit rejection proof',
  );
  await send(
    contracts.mismatchSpike,
    spikeData('rejectDeposit', [mismatchAcceptance.decryptionProof]),
    'record refunded mismatched encrypted stake',
  );
  await assertRejected(
    () =>
      publicClient.call({
        account: deployer.address,
        to: contracts.mismatchSpike,
        data: spikeData('rejectDeposit', [mismatchAcceptance.decryptionProof]),
      }),
    'Repeated mismatched deposit rejection',
  );

  if (!reusableCore) {
    await send(
      contracts.wrapper,
      wrapperData('wrap', [deployer.address, FIXTURE_AMOUNT]),
      'wrap recovery collateral',
    );
  }
  failureStage = 'missing recovery intent rejection';
  const missingIntentInput = (await ownerHandleClient.encryptInput(
    FIXTURE_AMOUNT,
    'uint256',
    contracts.wrapper,
  )) as EncryptedValue;
  await assertRejected(
    () =>
      publicClient.call({
        account: deployer.address,
        to: contracts.wrapper,
        data: wrapperData('confidentialTransferAndCall', [
          contracts.recoverySpike,
          missingIntentInput.handle,
          missingIntentInput.handleProof,
          '0x',
        ]),
      }),
    'Encrypted callback without a registered intent',
  );
  await registerIntent(contracts.recoverySpike, 'register recovery encrypted stake intent');
  const recoveryAcceptance = await transferAndReadAcceptance(
    contracts.recoverySpike,
    FIXTURE_AMOUNT,
    'encrypted recovery collateral pull',
  );
  if (!recoveryAcceptance.value) {
    fail('The matching recovery encrypted stake intent was not accepted.');
  }
  await assertRejected(
    () =>
      publicClient.call({
        account: deployer.address,
        to: contracts.recoverySpike,
        data: spikeData('finalizeDepositAcceptance', ['0x']),
      }),
    'Malformed recovery deposit acceptance proof',
  );
  await send(
    contracts.recoverySpike,
    spikeData('finalizeDepositAcceptance', [recoveryAcceptance.decryptionProof]),
    'finalize matching recovery encrypted stake intent',
  );
  await send(
    contracts.recoverySpike,
    spikeData('requestUnwrapForRecovery'),
    'request protocol-required unwrap',
  );

  const unwrapRequest = (await read(
    contracts.recoverySpike,
    spikeArtifact,
    'unwrapRequestHandle',
  )) as Hex;
  await assertRejected(
    () =>
      publicClient.call({
        account: unrelated.address,
        to: contracts.recoverySpike,
        data: spikeData('recoverAndRewrap', ['0x', FIXTURE_AMOUNT]),
      }),
    'Early unwrap recovery',
  );
  const recoveryAvailableAt = (await read(
    contracts.recoverySpike,
    spikeArtifact,
    'recoveryAvailableAt',
  )) as bigint;
  const publicUnwrap = await waitForPublicDecrypt(ownerHandleClient, unwrapRequest);
  if (publicUnwrap.value !== FIXTURE_AMOUNT) {
    fail('The protocol-required unwrap plaintext did not match the in-memory fixture value.');
  }
  await waitForRecoveryDelay(publicClient, recoveryAvailableAt);
  await assertRejected(
    () =>
      publicClient.call({
        account: unrelated.address,
        to: contracts.recoverySpike,
        data: spikeData('recoverAndRewrap', ['0x', FIXTURE_AMOUNT]),
      }),
    'Malformed unwrap proof',
  );
  await assertRejected(
    () =>
      publicClient.call({
        account: unrelated.address,
        to: contracts.recoverySpike,
        data: spikeData('recoverAndRewrap', [publicUnwrap.decryptionProof, FIXTURE_AMOUNT + 1n]),
      }),
    'Unwrap balance-delta mismatch',
  );
  await send(
    contracts.recoverySpike,
    spikeData('recoverAndRewrap', [publicUnwrap.decryptionProof, FIXTURE_AMOUNT]),
    'finalize unwrap and rewrap recovered collateral',
  );
  await assertRejected(
    () =>
      publicClient.call({
        account: unrelated.address,
        to: contracts.wrapper,
        data: wrapperData('finalizeUnwrap', [unwrapRequest, publicUnwrap.decryptionProof]),
      }),
    'Duplicate unwrap finalization',
  );
  await send(
    contracts.recoverySpike,
    spikeData('returnToOwner', [deployer.address]),
    'return recovered confidential collateral to owner',
  );
  await assertRejected(
    () =>
      publicClient.call({
        account: deployer.address,
        to: contracts.recoverySpike,
        data: spikeData('returnToOwner', [deployer.address]),
      }),
    'Repeated recovered confidential return',
  );

  const finalOwnerBalance = (await read(
    contracts.wrapper,
    wrapperArtifact,
    'confidentialBalanceOf',
    [deployer.address],
  )) as Hex;
  await assertOwnerDecrypt(
    ownerHandleClient,
    finalOwnerBalance,
    initialOwnerBalance + (reusableCore ? 0n : FIXTURE_AMOUNT),
  );
  const [directState, recoveryState, mismatchState, observedReleasedAmount] = await Promise.all([
    read(contracts.directSpike, spikeArtifact, 'state'),
    read(contracts.recoverySpike, spikeArtifact, 'state'),
    read(contracts.mismatchSpike, spikeArtifact, 'state'),
    read(contracts.recoverySpike, spikeArtifact, 'observedReleasedAmount'),
  ]);
  if (
    directState !== 6 ||
    recoveryState !== 6 ||
    mismatchState !== 7 ||
    observedReleasedAmount !== FIXTURE_AMOUNT
  ) {
    fail('The final FND-04 lifecycle state did not match the required recovery result.');
  }

  console.log(
    JSON.stringify({
      workItem: 'FND-04',
      contractsVerified: 5,
      lifecycleAssertionsVerified: 13,
      negativeAssertionsVerified: 18,
      status: 'passed',
    }),
  );
}

main().catch(() => {
  console.error(
    `FND-04 failed during ${failureStage}: inspect the sanitized receipt, spend ledger, and Nox feedback report.`,
  );
  process.exitCode = 1;
});
