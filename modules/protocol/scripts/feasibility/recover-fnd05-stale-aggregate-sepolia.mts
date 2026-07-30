import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  isAddress,
  keccak256,
  parseEther,
  type Address,
  type Hash,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const EXPECTED_CHAIN_ID = 11_155_111;
const CONFIRMATION_VALUE = 'yes';
const CANCEL_GAS_LIMIT = 500_000n;
const REFUND_GAS_LIMIT = 1_000_000n;
const RPC_TIMEOUT_MS = 30_000;

interface SpendEntry {
  workItemId: string;
  phase: string;
  sender: Address;
  transactionHash: Hash;
  blockNumber: string;
  gasUsed: string;
  effectiveGasPrice: string;
  actualGasCostWei: string;
  sourceCommit: string;
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

interface StaleFixture {
  fixture: Address;
  wrapper: Address;
  recoverySpike: Address;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const protocolRoot = resolve(scriptDirectory, '../..');
const repositoryRoot = resolve(protocolRoot, '../..');
const evidencePath = resolve(
  repositoryRoot,
  'evidence/sepolia/G3/FND-05C-STALE-FIXTURE-RECOVERY.json',
);
const secondaryActorPath = resolve(repositoryRoot, 'evidence/local/fnd-05-secondary-actor.json');
const failureMarkerPath = resolve(
  repositoryRoot,
  'evidence/local/fnd-05-stale-recovery-last-failure.json',
);
const spendLedgerPath = resolve(repositoryRoot, 'evidence/sepolia/spend-ledger.json');
let failureStage = 'configuration validation';

const SPIKE_ABI = [
  {
    type: 'function',
    name: 'aggregatePendingSince',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'value', type: 'uint48' }],
  },
  {
    type: 'function',
    name: 'aggregateTimeout',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'value', type: 'uint48' }],
  },
  {
    type: 'function',
    name: 'cancelBeforeUnwrap',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'fundsLocation',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'value', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'participantCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'value', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'refund',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'state',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'value', type: 'uint8' }],
  },
] as const;

const WRAPPER_ABI = [
  {
    type: 'function',
    name: 'underlying',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'value', type: 'address' }],
  },
] as const;

function fail(message: string): never {
  throw new Error(message);
}

function loadEnvironment(): void {
  const environmentPath = resolve(repositoryRoot, '.env');
  if (existsSync(environmentPath)) process.loadEnvFile(environmentPath);
}

function staleFixture(): StaleFixture {
  const argument = process.argv.find((value) => value.startsWith('--stale='));
  if (!argument) {
    fail('Stale aggregate recovery requires --stale=<fixture>,<wrapper>,<recovery-spike>.');
  }
  const values = argument.slice('--stale='.length).split(',');
  if (values.length !== 3 || values.some((value) => !isAddress(value))) {
    fail('Stale aggregate recovery requires three valid fixture addresses.');
  }
  return {
    fixture: values[0] as Address,
    wrapper: values[1] as Address,
    recoverySpike: values[2] as Address,
  };
}

function loadSecondaryAccount(): Hex {
  if (!existsSync(secondaryActorPath))
    fail('The local stale-fixture recovery record is unavailable.');
  const stored = JSON.parse(
    readFileSync(secondaryActorPath, 'utf8'),
  ) as Partial<StoredSecondaryActor>;
  if (
    stored.schemaVersion !== 1 ||
    typeof stored.privateKey !== 'string' ||
    !/^0x[0-9a-fA-F]{64}$/.test(stored.privateKey)
  ) {
    fail('The local stale-fixture recovery record is malformed.');
  }
  chmodSync(secondaryActorPath, 0o600);
  return stored.privateKey as Hex;
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

function singleTransactionCapWei(ledger: SpendLedger): bigint {
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

function assertBudget(ledger: SpendLedger, maximumCosts: readonly bigint[]): void {
  const plannedCost = maximumCosts.reduce((total, cost) => total + cost, 0n);
  if (totalSpendWei(ledger) + plannedCost > BigInt(ledger.maxTotalSpendWei)) {
    fail('The proposed Sepolia recovery exceeds the committed cumulative gas allowance.');
  }
  for (const maximumCost of maximumCosts) {
    if (maximumCost > singleTransactionCapWei(ledger)) {
      fail('The proposed Sepolia recovery exceeds the single-transaction gas allowance.');
    }
  }
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
  if (status.length > 0) fail('Sepolia recovery writes require a clean source tree.');
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

function writeFailureMarker(error: unknown): void {
  try {
    mkdirSync(dirname(failureMarkerPath), { recursive: true, mode: 0o700 });
    writeFileSync(
      failureMarkerPath,
      `${JSON.stringify({
        errorCategory: error instanceof Error ? error.name : typeof error,
        failureStage,
        schemaVersion: 1,
        workItem: 'FND-05C-STALE-RECOVERY',
      })}\n`,
      { mode: 0o600 },
    );
    chmodSync(failureMarkerPath, 0o600);
  } catch {
    // Preserve the original sanitized failure path if local diagnostics are unavailable.
  }
}

function clearFailureMarker(): void {
  if (existsSync(failureMarkerPath)) unlinkSync(failureMarkerPath);
}

async function main(): Promise<void> {
  failureStage = 'configuration validation';
  loadEnvironment();
  const fixture = staleFixture();
  const dryRun = process.argv.includes('--dry-run');
  const terminalResume = process.argv.includes('--resume-terminal');
  const primaryKey = process.env.SEPOLIA_PRIVATE_KEY as Hex | undefined;
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!primaryKey || !rpcUrl) fail('The local Sepolia stale-fixture configuration is incomplete.');
  if (!dryRun && !terminalResume && process.env.CONFIRM_SEPOLIA_WRITE !== CONFIRMATION_VALUE) {
    fail('Set CONFIRM_SEPOLIA_WRITE=yes only after reviewing the stale-fixture dry run.');
  }

  const primary = privateKeyToAccount(primaryKey);
  const secondary = privateKeyToAccount(loadSecondaryAccount());
  const transport = http(rpcUrl, { retryCount: 0, timeout: RPC_TIMEOUT_MS });
  const publicClient = createPublicClient({ cacheTime: 0, chain: sepolia, transport });
  const primaryWallet = createWalletClient({ account: primary, chain: sepolia, transport });
  const secondaryWallet = createWalletClient({ account: secondary, chain: sepolia, transport });
  const ledger = loadLedger();

  failureStage = 'Sepolia preflight';
  if ((await publicClient.getChainId()) !== EXPECTED_CHAIN_ID) {
    fail('The configured RPC is not Ethereum Sepolia.');
  }
  const [primaryBalance, secondaryBalance] = await Promise.all([
    publicClient.getBalance({ address: primary.address }),
    publicClient.getBalance({ address: secondary.address }),
  ]);
  if (primaryBalance === 0n || secondaryBalance === 0n) {
    fail('A stale-fixture refund actor has no Sepolia gas balance.');
  }

  failureStage = 'stale fixture verification';
  const [runtime, underlying, state, participants, pendingSince, timeout, currentBlock] =
    await Promise.all([
      publicClient.getCode({ address: fixture.recoverySpike }),
      publicClient.readContract({
        address: fixture.wrapper,
        abi: WRAPPER_ABI,
        functionName: 'underlying',
      }),
      publicClient.readContract({
        address: fixture.recoverySpike,
        abi: SPIKE_ABI,
        functionName: 'state',
      }),
      publicClient.readContract({
        address: fixture.recoverySpike,
        abi: SPIKE_ABI,
        functionName: 'participantCount',
      }),
      publicClient.readContract({
        address: fixture.recoverySpike,
        abi: SPIKE_ABI,
        functionName: 'aggregatePendingSince',
      }),
      publicClient.readContract({
        address: fixture.recoverySpike,
        abi: SPIKE_ABI,
        functionName: 'aggregateTimeout',
      }),
      publicClient.getBlock(),
    ]);
  if (
    !runtime ||
    (underlying as Address).toLowerCase() !== fixture.fixture.toLowerCase() ||
    participants !== 2n ||
    (terminalResume
      ? Number(state) !== 4
      : Number(state) !== 2 || currentBlock.timestamp < BigInt(pendingSince) + BigInt(timeout))
  ) {
    fail('The documented stale fixture is not eligible for its timeout recovery.');
  }

  if (terminalResume) {
    failureStage = 'terminal stale fixture verification';
    const [fundsLocation, terminalBlock] = await Promise.all([
      publicClient.readContract({
        address: fixture.recoverySpike,
        abi: SPIKE_ABI,
        functionName: 'fundsLocation',
      }),
      publicClient.getBlockNumber(),
    ]);
    const recoveryEntries = ledger.entries.slice(-3);
    const receipts = await Promise.all(
      recoveryEntries.map((entry) =>
        publicClient.getTransactionReceipt({ hash: entry.transactionHash }),
      ),
    );
    if (
      Number(fundsLocation) !== 2 ||
      recoveryEntries.length !== 3 ||
      recoveryEntries.some((entry) => entry.workItemId !== 'FND-05C') ||
      receipts.some((receipt) => receipt.status !== 'success')
    ) {
      fail('The stale fixture terminal resume could not verify its recorded cleanup receipts.');
    }
    unlinkSync(secondaryActorPath);
    clearFailureMarker();
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(
      evidencePath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          gate: 'G3',
          workItem: 'FND-05C-STALE-RECOVERY',
          phase: 'P0',
          timestampUtc: new Date().toISOString(),
          sourceCommit: sourceCommit(),
          environment: {
            class: 'sepolia-write-and-read',
            chainId: EXPECTED_CHAIN_ID,
            verificationBlock: terminalBlock.toString(),
          },
          contracts: {
            fixture: fixture.fixture,
            wrapper: fixture.wrapper,
            recoverySpike: fixture.recoverySpike,
            staleRecoveryRuntimeHash: keccak256(runtime),
            wrapperUnderlyingMatchesFixture: true,
          },
          transactions: recoveryEntries.map((entry, index) => ({
            purpose:
              index === 0
                ? 'permissionless cancellation of the timed-out pre-fix fixture'
                : index === 1
                  ? 'first recorded-owner confidential refund'
                  : 'second recorded-owner confidential refund',
            hash: entry.transactionHash,
            blockNumber: entry.blockNumber,
          })),
          observed: {
            stateBefore: 'AggregatePending',
            timeoutElapsedBeforeCancellation: true,
            terminalState: 'Refundable',
            terminalFundsLocation: 'PoolConfidentialCustody',
            participantCount: participants.toString(),
            bothOwnerRefundTransactionsSucceeded: true,
            localSecondaryRecoveryRecordDeletedAfterTerminalRead: true,
          },
          privacyAndCustody: {
            plaintextCommitted: false,
            rawHandlesCommitted: false,
            proofsOrCalldataCommitted: false,
            walletSignaturesCommitted: false,
            preFixFixtureExcludedFromGateEvidence: true,
            terminalFundsLocation:
              'Refunded confidential collateral is back with the recorded owners.',
          },
          knownLimitations: [
            'This cleanup recovers only the pre-fix fixture. It cannot satisfy FND-05C or G3.',
            'A fresh fixture running the corrected runtime must prove every FND-05C proof-context and recovery requirement.',
          ],
          reproduction: [
            'Run npm run test:nox:sepolia -- FND-05-STALE-RECOVERY --resume-terminal --stale=<fixture>,<wrapper>,<recovery-spike>.',
            'Inspect this sanitized artifact and the three referenced Sepolia receipts without exposing the ignored recovery record.',
          ],
        },
        null,
        2,
      )}\n`,
    );
    console.log(
      JSON.stringify({
        chainId: EXPECTED_CHAIN_ID,
        status: 'recovered',
        terminalState: 'Refundable',
        workItem: 'FND-05C-STALE-RECOVERY',
      }),
    );
    return;
  }

  const fees = await publicClient.estimateFeesPerGas();
  const maxFeePerGas = fees.maxFeePerGas ?? (await publicClient.getGasPrice());
  assertBudget(ledger, [
    CANCEL_GAS_LIMIT * maxFeePerGas,
    REFUND_GAS_LIMIT * maxFeePerGas,
    REFUND_GAS_LIMIT * maxFeePerGas,
  ]);
  if (dryRun) {
    console.log(
      JSON.stringify({
        chainId: EXPECTED_CHAIN_ID,
        mode: 'confirmed-write',
        workItem: 'FND-05C-STALE-RECOVERY',
        firstAction: 'cancel the timed-out pre-fix aggregate fixture',
        cancelGasLimit: CANCEL_GAS_LIMIT.toString(),
        refundGasLimit: REFUND_GAS_LIMIT.toString(),
        maximumRecoveryCostWei: (
          (CANCEL_GAS_LIMIT + REFUND_GAS_LIMIT * 2n) *
          maxFeePerGas
        ).toString(),
        remainingAllowanceWei: (BigInt(ledger.maxTotalSpendWei) - totalSpendWei(ledger)).toString(),
        targetState: 'AggregatePending',
        participantCount: participants.toString(),
      }),
    );
    return;
  }

  failureStage = 'clean source verification';
  assertCleanSourceTree();
  const send = async (
    wallet: typeof primaryWallet,
    account: typeof primary,
    functionName: 'cancelBeforeUnwrap' | 'refund',
    gas: bigint,
  ): Promise<{ hash: Hash; blockNumber: bigint }> => {
    failureStage = `${functionName} budget and broadcast`;
    const liveFees = await publicClient.estimateFeesPerGas();
    const liveMaxFeePerGas = liveFees.maxFeePerGas ?? (await publicClient.getGasPrice());
    assertBudget(ledger, [gas * liveMaxFeePerGas]);
    const data = encodeFunctionData({ abi: SPIKE_ABI, functionName });
    const hash = await wallet.sendTransaction({
      account,
      to: fixture.recoverySpike,
      data,
      gas,
      maxFeePerGas: liveMaxFeePerGas,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    appendSpend(ledger, {
      workItemId: 'FND-05C',
      phase: 'P0',
      sender: account.address,
      transactionHash: hash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice.toString(),
      actualGasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
    });
    if (receipt.status !== 'success') fail('A stale-fixture recovery transaction reverted.');
    return { hash, blockNumber: receipt.blockNumber };
  };

  const cancellation = await send(primaryWallet, primary, 'cancelBeforeUnwrap', CANCEL_GAS_LIMIT);
  const primaryRefund = await send(primaryWallet, primary, 'refund', REFUND_GAS_LIMIT);
  const secondaryRefund = await send(secondaryWallet, secondary, 'refund', REFUND_GAS_LIMIT);
  const [terminalState, fundsLocation, terminalBlock] = await Promise.all([
    publicClient.readContract({
      address: fixture.recoverySpike,
      abi: SPIKE_ABI,
      functionName: 'state',
    }),
    publicClient.readContract({
      address: fixture.recoverySpike,
      abi: SPIKE_ABI,
      functionName: 'fundsLocation',
    }),
    publicClient.getBlockNumber(),
  ]);
  if (Number(terminalState) !== 4 || Number(fundsLocation) !== 2) {
    fail('The stale fixture did not return to documented confidential refund custody.');
  }
  unlinkSync(secondaryActorPath);
  clearFailureMarker();

  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(
    evidencePath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        gate: 'G3',
        workItem: 'FND-05C-STALE-RECOVERY',
        phase: 'P0',
        timestampUtc: new Date().toISOString(),
        sourceCommit: sourceCommit(),
        environment: {
          class: 'sepolia-write-and-read',
          chainId: EXPECTED_CHAIN_ID,
          verificationBlock: terminalBlock.toString(),
        },
        contracts: {
          fixture: fixture.fixture,
          wrapper: fixture.wrapper,
          recoverySpike: fixture.recoverySpike,
          staleRecoveryRuntimeHash: keccak256(runtime),
          wrapperUnderlyingMatchesFixture: true,
        },
        transactions: [
          {
            purpose: 'permissionless cancellation of the timed-out pre-fix fixture',
            hash: cancellation.hash,
            blockNumber: cancellation.blockNumber.toString(),
          },
          {
            purpose: 'first recorded-owner confidential refund',
            hash: primaryRefund.hash,
            blockNumber: primaryRefund.blockNumber.toString(),
          },
          {
            purpose: 'second recorded-owner confidential refund',
            hash: secondaryRefund.hash,
            blockNumber: secondaryRefund.blockNumber.toString(),
          },
        ],
        observed: {
          stateBefore: 'AggregatePending',
          timeoutElapsedBeforeCancellation: true,
          terminalState: 'Refundable',
          terminalFundsLocation: 'PoolConfidentialCustody',
          participantCount: participants.toString(),
          bothOwnerRefundTransactionsSucceeded: true,
          localSecondaryRecoveryRecordDeletedAfterTerminalRead: true,
        },
        privacyAndCustody: {
          plaintextCommitted: false,
          rawHandlesCommitted: false,
          proofsOrCalldataCommitted: false,
          walletSignaturesCommitted: false,
          preFixFixtureExcludedFromGateEvidence: true,
          terminalFundsLocation:
            'Refunded confidential collateral is back with the recorded owners.',
        },
        knownLimitations: [
          'This cleanup recovers only the pre-fix fixture. It cannot satisfy FND-05C or G3.',
          'A fresh fixture running the corrected runtime must prove every FND-05C proof-context and recovery requirement.',
        ],
        reproduction: [
          'Run npm run test:nox:sepolia -- FND-05-STALE-RECOVERY --dry-run --stale=<fixture>,<wrapper>,<recovery-spike>.',
          'Review the capped recovery cost and remaining allowance before setting CONFIRM_SEPOLIA_WRITE=yes.',
          'Inspect this sanitized artifact and the referenced Sepolia receipts without exposing the ignored recovery record.',
        ],
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    JSON.stringify({
      chainId: EXPECTED_CHAIN_ID,
      status: 'recovered',
      terminalState: 'Refundable',
      workItem: 'FND-05C-STALE-RECOVERY',
    }),
  );
}

main().catch((error) => {
  writeFailureMarker(error);
  console.error('stale aggregate recovery failed: inspect the documented fixture state.');
  process.exitCode = 1;
});
