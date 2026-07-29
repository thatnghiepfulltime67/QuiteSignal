import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { createViemHandleClient } from '@iexec-nox/handle';
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  type Abi,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

import {
  calculateExpectation,
  REQUIRED_VECTORS,
  type ArithmeticVector,
} from '../../test/feasibility/reference-model.js';

const EXPECTED_CHAIN_ID = 11_155_111;
const CONFIRMATION_VALUE = 'yes';

interface Artifact {
  abi: Abi;
  bytecode: Hex;
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

interface EncryptedField {
  handle: Hex;
  handleProof: Hex;
}

interface EncryptedVector {
  vectorId: bigint;
  stake: Hex;
  stakeProof: Hex;
  probabilityBps: Hex;
  probabilityProof: Hex;
  outcomeBps: Hex;
  outcomeProof: Hex;
  expectedYes: Hex;
  expectedYesProof: Hex;
  expectedNo: Hex;
  expectedNoProof: Hex;
  expectedScore: Hex;
  expectedScoreProof: Hex;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const protocolRoot = resolve(scriptDirectory, '../..');
const repositoryRoot = resolve(protocolRoot, '../..');
const artifactPath = resolve(
  protocolRoot,
  'artifacts/contracts/feasibility/ArithmeticSpike.sol/ArithmeticSpike.json',
);
const spendLedgerPath = resolve(repositoryRoot, 'evidence/sepolia/spend-ledger.json');

function fail(message: string): never {
  throw new Error(message);
}

function loadEnvironment(): void {
  const environmentPath = resolve(repositoryRoot, '.env');
  if (existsSync(environmentPath)) {
    process.loadEnvFile(environmentPath);
  }
}

function loadArtifact(): Artifact {
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as Partial<Artifact>;
  if (!Array.isArray(artifact.abi) || typeof artifact.bytecode !== 'string') {
    fail('The compiled arithmetic spike artifact is unavailable or malformed.');
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

function assertBudget(ledger: SpendLedger, estimatedGasCostWei: bigint): void {
  const cap = BigInt(ledger.maxTotalSpendWei);
  if (totalSpendWei(ledger) + estimatedGasCostWei > cap) {
    fail('The proposed Sepolia write exceeds the committed cumulative gas allowance.');
  }
}

async function encryptField(
  handleClient: Awaited<ReturnType<typeof createViemHandleClient>>,
  value: bigint,
  applicationContract: Address,
): Promise<EncryptedField> {
  const encrypted = await handleClient.encryptInput(value, 'uint256', applicationContract);
  return { handle: encrypted.handle, handleProof: encrypted.handleProof };
}

async function encryptVector(
  handleClient: Awaited<ReturnType<typeof createViemHandleClient>>,
  vector: ArithmeticVector,
  applicationContract: Address,
): Promise<EncryptedVector> {
  const expectation = calculateExpectation(vector);
  const [stake, probabilityBps, outcomeBps, expectedYes, expectedNo, expectedScore] =
    await Promise.all([
      encryptField(handleClient, vector.stake, applicationContract),
      encryptField(handleClient, vector.probabilityBps, applicationContract),
      encryptField(handleClient, vector.outcomeBps, applicationContract),
      encryptField(handleClient, expectation.yesAllocation, applicationContract),
      encryptField(handleClient, expectation.noAllocation, applicationContract),
      encryptField(handleClient, expectation.scoreBps, applicationContract),
    ]);

  return {
    vectorId: vector.id,
    stake: stake.handle,
    stakeProof: stake.handleProof,
    probabilityBps: probabilityBps.handle,
    probabilityProof: probabilityBps.handleProof,
    outcomeBps: outcomeBps.handle,
    outcomeProof: outcomeBps.handleProof,
    expectedYes: expectedYes.handle,
    expectedYesProof: expectedYes.handleProof,
    expectedNo: expectedNo.handle,
    expectedNoProof: expectedNo.handleProof,
    expectedScore: expectedScore.handle,
    expectedScoreProof: expectedScore.handleProof,
  };
}

async function assertPublicBoolean(
  handleClient: Awaited<ReturnType<typeof createViemHandleClient>>,
  handle: Hex,
  expected: boolean,
): Promise<void> {
  const result = await handleClient.publicDecrypt(handle);
  if (result.value !== expected) {
    fail('A public feasibility assertion did not match its expected boolean result.');
  }
}

async function main(): Promise<void> {
  loadEnvironment();

  const dryRun = process.argv.includes('--dry-run');
  const requestedCase = process.argv.find((argument) => argument === 'FND-02');
  if (!requestedCase) {
    fail('The FND-02 case identifier is required.');
  }

  const privateKey = process.env.SEPOLIA_PRIVATE_KEY;
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!privateKey || !rpcUrl) {
    fail('The local Sepolia test configuration is incomplete.');
  }
  if (!dryRun && process.env.CONFIRM_SEPOLIA_WRITE !== CONFIRMATION_VALUE) {
    fail('Set CONFIRM_SEPOLIA_WRITE=yes only after reviewing the dry-run plan.');
  }

  const account = privateKeyToAccount(privateKey as Hex);
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl),
  });
  const artifact = loadArtifact();
  const ledger = loadLedger();

  const chainId = await publicClient.getChainId();
  if (chainId !== EXPECTED_CHAIN_ID) {
    fail('The configured RPC is not Ethereum Sepolia.');
  }
  if ((await publicClient.getBalance({ address: account.address })) === 0n) {
    fail('The configured throwaway Sepolia wallet has no balance.');
  }

  const deploymentGas = await publicClient.estimateGas({
    account: account.address,
    data: artifact.bytecode,
  });
  const fees = await publicClient.estimateFeesPerGas();
  const maxFeePerGas = fees.maxFeePerGas ?? (await publicClient.getGasPrice());
  const deploymentMaximumGasCost = deploymentGas * maxFeePerGas;
  assertBudget(ledger, deploymentMaximumGasCost);

  console.log(
    JSON.stringify({
      mode: dryRun ? 'dry-run' : 'confirmed-write',
      workItem: 'FND-02',
      firstAction: 'deploy isolated arithmetic feasibility harness',
      estimatedMaximumGasCostWei: deploymentMaximumGasCost.toString(),
      remainingAllowanceWei: (BigInt(ledger.maxTotalSpendWei) - totalSpendWei(ledger)).toString(),
    }),
  );

  if (dryRun) {
    return;
  }

  assertCleanSourceTree();
  const deploymentHash = await walletClient.deployContract({
    account,
    abi: artifact.abi,
    bytecode: artifact.bytecode,
  });
  const deploymentReceipt = await publicClient.waitForTransactionReceipt({ hash: deploymentHash });
  appendSpend(ledger, {
    workItemId: 'FND-02',
    phase: 'P0',
    sender: account.address,
    transactionHash: deploymentHash,
    blockNumber: deploymentReceipt.blockNumber.toString(),
    gasUsed: deploymentReceipt.gasUsed.toString(),
    effectiveGasPrice: deploymentReceipt.effectiveGasPrice.toString(),
    actualGasCostWei: (deploymentReceipt.gasUsed * deploymentReceipt.effectiveGasPrice).toString(),
  });
  if (deploymentReceipt.status !== 'success' || !deploymentReceipt.contractAddress) {
    fail('The isolated arithmetic deployment did not succeed.');
  }

  const contractAddress = deploymentReceipt.contractAddress;
  const handleClient = await createViemHandleClient(walletClient);
  const encryptedVectors = await Promise.all(
    REQUIRED_VECTORS.map((vector) => encryptVector(handleClient, vector, contractAddress)),
  );
  const batchData = encodeFunctionData({
    abi: artifact.abi,
    functionName: 'evaluateBatch',
    args: [encryptedVectors],
  } as never);
  const batchGas = await publicClient.estimateGas({
    account: account.address,
    to: contractAddress,
    data: batchData,
  });
  const batchMaximumGasCost = batchGas * maxFeePerGas;
  assertBudget(ledger, batchMaximumGasCost);
  console.log(
    JSON.stringify({
      mode: 'confirmed-write',
      workItem: 'FND-02',
      secondAction: 'submit encrypted arithmetic vector batch',
      estimatedMaximumGasCostWei: batchMaximumGasCost.toString(),
      remainingAllowanceWei: (BigInt(ledger.maxTotalSpendWei) - totalSpendWei(ledger)).toString(),
    }),
  );

  const batchHash = await walletClient.sendTransaction({
    account,
    to: contractAddress,
    data: batchData,
  });
  const batchReceipt = await publicClient.waitForTransactionReceipt({ hash: batchHash });
  appendSpend(ledger, {
    workItemId: 'FND-02',
    phase: 'P0',
    sender: account.address,
    transactionHash: batchHash,
    blockNumber: batchReceipt.blockNumber.toString(),
    gasUsed: batchReceipt.gasUsed.toString(),
    effectiveGasPrice: batchReceipt.effectiveGasPrice.toString(),
    actualGasCostWei: (batchReceipt.gasUsed * batchReceipt.effectiveGasPrice).toString(),
  });
  if (batchReceipt.status !== 'success') {
    fail('The encrypted arithmetic vector batch did not succeed.');
  }

  for (const vector of REQUIRED_VECTORS) {
    const handles = (await publicClient.readContract({
      address: contractAddress,
      abi: artifact.abi,
      functionName: 'resultHandles',
      args: [vector.id],
    } as never)) as readonly [Hex, Hex, Hex];
    for (const handle of handles) {
      await assertPublicBoolean(handleClient, handle, true);
    }
  }

  const safetyHandles = (await publicClient.readContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: 'safetyHandles',
  } as never)) as readonly [Hex, Hex, Hex];
  for (const handle of safetyHandles) {
    await assertPublicBoolean(handleClient, handle, false);
  }

  const assertRejected = async (data: Hex, scenario: string): Promise<void> => {
    try {
      await publicClient.call({ account: account.address, to: contractAddress, data });
    } catch {
      return;
    }
    fail(`${scenario} did not fail on Sepolia.`);
  };

  const malformedInput = { ...encryptedVectors[0]!, vectorId: 10_000n, stakeProof: '0x' as Hex };
  await assertRejected(
    encodeFunctionData({
      abi: artifact.abi,
      functionName: 'evaluateBatch',
      args: [[malformedInput]],
    } as never),
    'Malformed encrypted input',
  );

  const wrongContextVector = await encryptVector(
    handleClient,
    REQUIRED_VECTORS[0]!,
    '0x0000000000000000000000000000000000000001',
  );
  await assertRejected(
    encodeFunctionData({
      abi: artifact.abi,
      functionName: 'evaluateBatch',
      args: [[{ ...wrongContextVector, vectorId: 10_001n }]],
    } as never),
    'Wrong contract context',
  );

  const wrongTypeStake = await handleClient.encryptInput(0n, 'uint16', contractAddress);
  const wrongTypeVector = {
    ...encryptedVectors[0]!,
    vectorId: 10_002n,
    stake: wrongTypeStake.handle,
    stakeProof: wrongTypeStake.handleProof,
  };
  await assertRejected(
    encodeFunctionData({
      abi: artifact.abi,
      functionName: 'evaluateBatch',
      args: [[wrongTypeVector]],
    } as never),
    'Wrong encrypted input type',
  );

  console.log(
    JSON.stringify({
      workItem: 'FND-02',
      vectorsVerified: REQUIRED_VECTORS.length,
      publicAssertionsVerified: REQUIRED_VECTORS.length * 3 + 3,
      negativeAssertionsVerified: 3,
      status: 'passed',
    }),
  );
}

main().catch(() => {
  console.error(
    'FND-02 failed: inspect the sanitized receipt, spend ledger, and Nox feedback report.',
  );
  process.exitCode = 1;
});
