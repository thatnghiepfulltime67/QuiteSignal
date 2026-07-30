import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createPublicClient,
  http,
  isAddress,
  keccak256,
  type Abi,
  type Address,
  type Hex,
} from 'viem';
import { sepolia } from 'viem/chains';

const EXPECTED_CHAIN_ID = 11_155_111;
const EXPECTED_AGGREGATE_YES = 45n;
const EXPECTED_AGGREGATE_NO = 55n;
const EXPECTED_RELEASED_COLLATERAL = 100n;
const EXPECTED_RECEIPTS = [
  ['close threshold epoch', 'success'],
  ['request aggregate disclosure', 'success'],
  ['reject cross-pool aggregate proof context', 'reverted'],
  ['reject wrong-chain aggregate proof context', 'reverted'],
  ['reject wrong-epoch aggregate proof context', 'reverted'],
  ['reject substituted aggregate plaintext', 'reverted'],
  ['finalize context-bound aggregate and request unwrap', 'success'],
  ['reject replayed aggregate proof', 'reverted'],
  ['reject early delayed-unwrap recovery', 'reverted'],
  ['permissionless finalize unwrap and rewrap recovery', 'success'],
  ['refund recovered first member', 'success'],
  ['reject duplicate first-member refund', 'reverted'],
  ['refund recovered independent member', 'success'],
  ['reject duplicate independent-member refund', 'reverted'],
] as const;

interface Artifact {
  abi: Abi;
  deployedBytecode: Hex;
  immutableReferences?: Record<string, readonly { start: number; length: number }[]>;
}

interface RecordedTransaction {
  purpose: string;
  hash: Hex;
  blockNumber: number;
  expectedStatus: 'success' | 'reverted';
}

interface RecoveryEvidence {
  schemaVersion: number;
  gate: string;
  workItem: string;
  sourceCommits: Record<string, string>;
  environment: { chainId: number; verificationBlock: number };
  contracts: {
    fixture: { address: Address };
    wrapper: { address: Address };
    recoverySpike: { address: Address };
    contextPeer: { address: Address };
  };
  transactions: RecordedTransaction[];
  observed: {
    participantCount: number;
    terminalState: string;
    aggregatePublicDecryptAccess: { yes: boolean; no: boolean; total: boolean };
    aggregateTotalsConserved: boolean;
    observedReleasedAmount: string;
    publicSpikeUnderlyingBalance: string;
    terminalFundsLocation: string;
    terminalOwnerConfidentialBalancesVerifiedLocally: boolean;
    secondaryRecoveryRecordDeletedAfterVerification: boolean;
  };
}

interface SpendLedger {
  chainId: number;
  entries: Array<{ transactionHash: Hex; blockNumber: string; workItemId: string }>;
}

interface HistoricalTransaction {
  hash?: Hex;
  transactionHashes?: Hex[];
  blockNumber?: number;
  blockRange?: string;
  expectedStatus?: 'success' | 'reverted';
}

interface HistoricalReceiptReference {
  hash: Hex;
  expectedStatus: 'success' | 'reverted';
  minimumBlock: number;
  maximumBlock: number;
}

interface ReceiptObservation {
  blockNumber: number;
  status: 'success' | 'reverted';
}

interface HistoricalContract {
  address: Address;
  runtimeBytecodeHash: Hex;
}

interface HistoricalSliceEvidence {
  schemaVersion: number;
  gate: string;
  workItem: string;
  sourceCommits: Record<string, string>;
  contracts: {
    fixture: HistoricalContract;
    wrapper: HistoricalContract;
    belowKSpike?: HistoricalContract;
    timeoutSpike?: HistoricalContract;
  };
  transactions: HistoricalTransaction[];
  observed: {
    participantCount: number;
    terminalState: string;
    aggregatePublicDecryptAccess: { yes: boolean; no: boolean; total: boolean };
    publicAggregateDecryptDenied?: boolean;
    ownerConfidentialBalanceRestoredToFixtureBaseline?: boolean;
    duplicateRefundRejected?: boolean;
    earlyCloseRejected?: boolean;
    earlyCancellationRejected?: boolean;
    permissionlessCancellationAfterTimeout?: boolean;
    bothOwnerRefundTransactionsSucceeded?: boolean;
    terminalOwnerConfidentialBalancesVerifiedLocally?: boolean;
    secondaryRecoveryRecordDeletedAfterVerification?: boolean;
  };
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../..');
const protocolRoot = resolve(repositoryRoot, 'modules/protocol');
const artifactDirectory = resolve(protocolRoot, 'artifacts/contracts/feasibility');
const evidencePath = resolve(repositoryRoot, 'evidence/sepolia/G3/FND-05-RECOVERY.json');
const belowKEvidencePath = resolve(repositoryRoot, 'evidence/sepolia/G3/FND-05-BELOW-K.json');
const timeoutEvidencePath = resolve(repositoryRoot, 'evidence/sepolia/G3/FND-05-TIMEOUT.json');
const ledgerPath = resolve(repositoryRoot, 'evidence/sepolia/spend-ledger.json');
const secondaryActorPath = resolve(repositoryRoot, 'evidence/local/fnd-05-secondary-actor.json');
let failureStage = 'configuration';

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

function loadEvidence(): RecoveryEvidence {
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8')) as Partial<RecoveryEvidence>;
  if (
    evidence.schemaVersion !== 1 ||
    evidence.gate !== 'G3' ||
    evidence.workItem !== 'FND-05C' ||
    evidence.environment?.chainId !== EXPECTED_CHAIN_ID ||
    typeof evidence.environment.verificationBlock !== 'number' ||
    !Array.isArray(evidence.transactions) ||
    evidence.transactions.length !== EXPECTED_RECEIPTS.length ||
    !evidence.contracts ||
    !evidence.observed ||
    !evidence.sourceCommits
  ) {
    fail('The FND-05C recovery evidence is unavailable or has an invalid required shape.');
  }
  for (const address of Object.values(evidence.contracts).map((contract) => contract.address)) {
    if (!isAddress(address))
      fail('The FND-05C recovery evidence contains an invalid contract address.');
  }
  for (const [index, [purpose, expectedStatus]] of EXPECTED_RECEIPTS.entries()) {
    const transaction = evidence.transactions[index];
    if (
      !transaction ||
      transaction.purpose !== purpose ||
      transaction.expectedStatus !== expectedStatus ||
      !/^0x[0-9a-fA-F]{64}$/.test(transaction.hash) ||
      !Number.isSafeInteger(transaction.blockNumber) ||
      transaction.blockNumber <= 0
    ) {
      fail('The FND-05C recovery evidence does not contain the required receipt sequence.');
    }
  }
  return evidence as RecoveryEvidence;
}

function assertCommitReachability(sourceCommits: Record<string, string>): void {
  for (const requiredCommit of ['correctedRuntime', 'lifecycleResume', 'terminalRecovery']) {
    const commit = sourceCommits[requiredCommit];
    if (!commit || !/^[0-9a-f]{40}$/i.test(commit)) {
      fail('The FND-05C recovery evidence has an invalid required source commit.');
    }
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], {
        cwd: repositoryRoot,
        stdio: 'ignore',
      });
    } catch {
      fail('A required FND-05C recovery source commit is not reachable from HEAD.');
    }
  }
}

function loadLedger(): SpendLedger {
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) as Partial<SpendLedger>;
  if (ledger.chainId !== EXPECTED_CHAIN_ID || !Array.isArray(ledger.entries)) {
    fail('The Sepolia spend ledger is unavailable or malformed.');
  }
  return ledger as SpendLedger;
}

function loadHistoricalSliceEvidence(
  path: string,
  expectedWorkItem: 'FND-05A' | 'FND-05B',
): HistoricalSliceEvidence {
  const evidence = JSON.parse(readFileSync(path, 'utf8')) as Partial<HistoricalSliceEvidence>;
  const spikeKey = expectedWorkItem === 'FND-05A' ? 'belowKSpike' : 'timeoutSpike';
  const spike = evidence.contracts?.[spikeKey];
  if (
    evidence.schemaVersion !== 1 ||
    evidence.gate !== 'G3' ||
    evidence.workItem !== expectedWorkItem ||
    !evidence.sourceCommits ||
    !evidence.contracts ||
    !evidence.contracts.fixture ||
    !evidence.contracts.wrapper ||
    !spike ||
    !Array.isArray(evidence.transactions) ||
    evidence.transactions.length === 0 ||
    !evidence.observed
  ) {
    fail(
      `The ${expectedWorkItem} terminal evidence is unavailable or has an invalid required shape.`,
    );
  }
  const contracts = [evidence.contracts.fixture, evidence.contracts.wrapper, spike];
  for (const contract of contracts) {
    if (!isAddress(contract.address) || !/^0x[0-9a-fA-F]{64}$/.test(contract.runtimeBytecodeHash)) {
      fail(`The ${expectedWorkItem} terminal evidence contains an invalid contract record.`);
    }
  }
  for (const transaction of evidence.transactions) {
    const hashes =
      typeof transaction.hash === 'string'
        ? [transaction.hash]
        : Array.isArray(transaction.transactionHashes)
          ? transaction.transactionHashes
          : [];
    const hasExactBlock =
      Number.isSafeInteger(transaction.blockNumber) && (transaction.blockNumber ?? 0) > 0;
    const hasBlockRange =
      typeof transaction.blockRange === 'string' &&
      /^\d+-\d+$/.test(transaction.blockRange) &&
      Number(transaction.blockRange.split('-')[0]) <= Number(transaction.blockRange.split('-')[1]);
    if (
      hashes.length === 0 ||
      hashes.some((hash) => !/^0x[0-9a-fA-F]{64}$/.test(hash)) ||
      (typeof transaction.hash === 'string' ? !hasExactBlock : !hasBlockRange) ||
      (transaction.expectedStatus !== undefined &&
        transaction.expectedStatus !== 'success' &&
        transaction.expectedStatus !== 'reverted')
    ) {
      fail(`The ${expectedWorkItem} terminal evidence contains an invalid receipt record.`);
    }
  }
  return evidence as HistoricalSliceEvidence;
}

function historicalReceiptReferences(
  transactions: HistoricalTransaction[],
): HistoricalReceiptReference[] {
  return transactions.flatMap((transaction) => {
    const expectedStatus = transaction.expectedStatus ?? 'success';
    if (typeof transaction.hash === 'string') {
      return [
        {
          hash: transaction.hash,
          expectedStatus,
          minimumBlock: transaction.blockNumber as number,
          maximumBlock: transaction.blockNumber as number,
        },
      ];
    }
    const [minimum, maximum] = (transaction.blockRange as string).split('-').map(Number) as [
      number,
      number,
    ];
    return (transaction.transactionHashes as Hex[]).map((hash) => ({
      hash,
      expectedStatus,
      minimumBlock: minimum,
      maximumBlock: maximum,
    }));
  });
}

function assertAllSourceCommitsReachable(
  sourceCommits: Record<string, string>,
  workItem: string,
): void {
  for (const commit of Object.values(sourceCommits)) {
    if (!/^[0-9a-f]{40}$/i.test(commit)) {
      fail(`The ${workItem} terminal evidence has an invalid source commit.`);
    }
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], {
        cwd: repositoryRoot,
        stdio: 'ignore',
      });
    } catch {
      fail(`A required ${workItem} source commit is not reachable from HEAD.`);
    }
  }
}

async function readReceiptBatch(
  rpcUrl: string,
  hashes: readonly Hex[],
): Promise<ReceiptObservation[]> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      hashes.map((hash, index) => ({
        jsonrpc: '2.0',
        id: index + 1,
        method: 'eth_getTransactionReceipt',
        params: [hash],
      })),
    ),
  });
  if (!response.ok) fail('The configured Sepolia RPC did not return receipt observations.');
  const replies = (await response.json()) as unknown;
  if (!Array.isArray(replies)) fail('The configured Sepolia RPC returned malformed receipts.');
  const byId = new Map<number, { blockNumber?: string; status?: string }>();
  for (const reply of replies) {
    if (
      reply !== null &&
      typeof reply === 'object' &&
      typeof (reply as { id?: unknown }).id === 'number' &&
      'result' in reply &&
      (reply as { result?: unknown }).result !== null &&
      typeof (reply as { result?: unknown }).result === 'object'
    ) {
      byId.set(
        (reply as { id: number }).id,
        (reply as { result: { blockNumber?: string; status?: string } }).result,
      );
    }
  }
  return hashes.map((_, index) => {
    const receipt = byId.get(index + 1);
    if (
      !receipt ||
      typeof receipt.blockNumber !== 'string' ||
      !/^0x[0-9a-f]+$/i.test(receipt.blockNumber) ||
      (receipt.status !== '0x1' && receipt.status !== '0x0')
    ) {
      fail('A required Sepolia receipt is unavailable or malformed.');
    }
    return {
      blockNumber: Number.parseInt(receipt.blockNumber, 16),
      status: receipt.status === '0x1' ? 'success' : 'reverted',
    };
  });
}

async function main(): Promise<void> {
  if (process.argv[2] !== 'G3') fail('Specify G3 for the currently supported evidence verifier.');
  loadEnvironment();
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) fail('SEPOLIA_RPC_URL is required for read-only evidence verification.');

  failureStage = 'FND-05C artifact and local-record validation';
  const evidence = loadEvidence();
  assertCommitReachability(evidence.sourceCommits);
  if (existsSync(secondaryActorPath)) {
    fail('The terminal FND-05C secondary-actor recovery record was not deleted.');
  }

  const fixtureArtifact = loadArtifact(
    resolve(artifactDirectory, 'FeasibilityERC20.sol/FeasibilityERC20.json'),
    'ERC-20 fixture',
  );
  const wrapperArtifact = loadArtifact(
    resolve(
      artifactDirectory,
      'FeasibilityConfidentialWrapper.sol/FeasibilityConfidentialWrapper.json',
    ),
    'confidential wrapper',
  );
  const spikeArtifact = loadArtifact(
    resolve(artifactDirectory, 'AggregateRecoverySpike.sol/AggregateRecoverySpike.json'),
    'aggregate recovery spike',
  );
  failureStage = 'Ethereum Sepolia preflight';
  const publicClient = createPublicClient({
    cacheTime: 0,
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
  });
  if ((await publicClient.getChainId()) !== EXPECTED_CHAIN_ID) {
    fail('The configured RPC is not Ethereum Sepolia.');
  }

  const { fixture, wrapper, recoverySpike, contextPeer } = evidence.contracts;
  const [fixtureRuntime, wrapperRuntime, recoveryRuntime, peerRuntime] = await Promise.all([
    publicClient.getCode({ address: fixture.address }),
    publicClient.getCode({ address: wrapper.address }),
    publicClient.getCode({ address: recoverySpike.address }),
    publicClient.getCode({ address: contextPeer.address }),
  ]);
  if (
    !fixtureRuntime ||
    !wrapperRuntime ||
    !recoveryRuntime ||
    !peerRuntime ||
    !runtimeMatchesArtifact(fixtureRuntime, fixtureArtifact) ||
    !runtimeMatchesArtifact(wrapperRuntime, wrapperArtifact) ||
    !runtimeMatchesArtifact(recoveryRuntime, spikeArtifact) ||
    !runtimeMatchesArtifact(peerRuntime, spikeArtifact)
  ) {
    fail('The FND-05C recovery runtime does not match the compiled artifact template.');
  }

  const read = async (address: Address, abi: Abi, functionName: string, args: unknown[] = []) =>
    publicClient.readContract({ address, abi, functionName, args } as never);
  const verifyHistoricalSlice = async (
    historical: HistoricalSliceEvidence,
    spikeKey: 'belowKSpike' | 'timeoutSpike',
    expectedParticipantCount: bigint,
    expectedAccess: readonly [boolean, boolean, boolean],
  ): Promise<number> => {
    assertAllSourceCommitsReachable(historical.sourceCommits, historical.workItem);
    const spike = historical.contracts[spikeKey];
    if (!spike) fail(`The ${historical.workItem} terminal evidence has no recorded spike.`);
    const { fixture: historicalFixture, wrapper: historicalWrapper } = historical.contracts;
    const [fixtureRuntime, wrapperRuntime, spikeRuntime] = await Promise.all([
      publicClient.getCode({ address: historicalFixture.address }),
      publicClient.getCode({ address: historicalWrapper.address }),
      publicClient.getCode({ address: spike.address }),
    ]);
    if (
      !fixtureRuntime ||
      !wrapperRuntime ||
      !spikeRuntime ||
      keccak256(fixtureRuntime).toLowerCase() !==
        historicalFixture.runtimeBytecodeHash.toLowerCase() ||
      keccak256(wrapperRuntime).toLowerCase() !==
        historicalWrapper.runtimeBytecodeHash.toLowerCase() ||
      keccak256(spikeRuntime).toLowerCase() !== spike.runtimeBytecodeHash.toLowerCase()
    ) {
      fail(`The ${historical.workItem} terminal runtime no longer matches its evidence record.`);
    }
    const [
      underlying,
      spikeWrapper,
      spikeUnderlying,
      state,
      participantCount,
      aggregateAccess,
      balance,
    ] = await Promise.all([
      read(historicalWrapper.address, wrapperArtifact.abi, 'underlying'),
      read(spike.address, spikeArtifact.abi, 'wrapper'),
      read(spike.address, spikeArtifact.abi, 'underlying'),
      read(spike.address, spikeArtifact.abi, 'state'),
      read(spike.address, spikeArtifact.abi, 'participantCount'),
      read(spike.address, spikeArtifact.abi, 'aggregateAccess'),
      read(historicalFixture.address, fixtureArtifact.abi, 'balanceOf', [spike.address]),
    ]);
    const access = aggregateAccess as readonly boolean[];
    if (
      (underlying as Address).toLowerCase() !== historicalFixture.address.toLowerCase() ||
      (spikeWrapper as Address).toLowerCase() !== historicalWrapper.address.toLowerCase() ||
      (spikeUnderlying as Address).toLowerCase() !== historicalFixture.address.toLowerCase() ||
      state !== 4 ||
      participantCount !== expectedParticipantCount ||
      access.length !== 3 ||
      access[0] !== expectedAccess[0] ||
      access[1] !== expectedAccess[1] ||
      access[2] !== expectedAccess[2] ||
      balance !== 0n
    ) {
      fail(`The ${historical.workItem} terminal state no longer matches its evidence record.`);
    }
    const receiptReferences = historicalReceiptReferences(historical.transactions);
    const receipts = await readReceiptBatch(
      rpcUrl,
      receiptReferences.map((transaction) => transaction.hash),
    );
    for (const [index, transaction] of receiptReferences.entries()) {
      const receipt = receipts[index];
      if (
        !receipt ||
        receipt.status !== transaction.expectedStatus ||
        receipt.blockNumber < transaction.minimumBlock ||
        receipt.blockNumber > transaction.maximumBlock
      ) {
        fail(`A ${historical.workItem} terminal receipt no longer matches its evidence record.`);
      }
    }
    const observed = historical.observed;
    const observedAccess = observed.aggregatePublicDecryptAccess;
    if (
      observed.participantCount !== Number(expectedParticipantCount) ||
      observed.terminalState !== 'Refundable' ||
      observedAccess.yes !== expectedAccess[0] ||
      observedAccess.no !== expectedAccess[1] ||
      observedAccess.total !== expectedAccess[2]
    ) {
      fail(`The ${historical.workItem} terminal observations are incomplete or inconsistent.`);
    }
    if (
      (historical.workItem === 'FND-05A' &&
        (observed.publicAggregateDecryptDenied !== true ||
          observed.ownerConfidentialBalanceRestoredToFixtureBaseline !== true ||
          observed.duplicateRefundRejected !== true ||
          observed.earlyCloseRejected !== true)) ||
      (historical.workItem === 'FND-05B' &&
        (observed.earlyCancellationRejected !== true ||
          observed.permissionlessCancellationAfterTimeout !== true ||
          observed.bothOwnerRefundTransactionsSucceeded !== true ||
          observed.terminalOwnerConfidentialBalancesVerifiedLocally !== true ||
          observed.secondaryRecoveryRecordDeletedAfterVerification !== true))
    ) {
      fail(`The ${historical.workItem} terminal recovery observations are incomplete.`);
    }
    return receiptReferences.length;
  };
  failureStage = 'historical FND-05A and FND-05B terminal validation';
  const belowKEvidence = loadHistoricalSliceEvidence(belowKEvidencePath, 'FND-05A');
  const timeoutEvidence = loadHistoricalSliceEvidence(timeoutEvidencePath, 'FND-05B');
  const [verifiedBelowKReceipts, verifiedTimeoutReceipts] = await Promise.all([
    verifyHistoricalSlice(belowKEvidence, 'belowKSpike', 1n, [false, false, false]),
    verifyHistoricalSlice(timeoutEvidence, 'timeoutSpike', 2n, [true, true, false]),
  ]);
  failureStage = 'corrected FND-05C terminal-state validation';
  const [
    wrapperUnderlying,
    spikeWrapper,
    spikeUnderlying,
    participantCount,
    state,
    aggregateAccess,
    fundsLocation,
    observedReleasedAmount,
    publicSpikeUnderlyingBalance,
  ] = await Promise.all([
    read(wrapper.address, wrapperArtifact.abi, 'underlying'),
    read(recoverySpike.address, spikeArtifact.abi, 'wrapper'),
    read(recoverySpike.address, spikeArtifact.abi, 'underlying'),
    read(recoverySpike.address, spikeArtifact.abi, 'participantCount'),
    read(recoverySpike.address, spikeArtifact.abi, 'state'),
    read(recoverySpike.address, spikeArtifact.abi, 'aggregateAccess'),
    read(recoverySpike.address, spikeArtifact.abi, 'fundsLocation'),
    read(recoverySpike.address, spikeArtifact.abi, 'observedReleasedAmount'),
    read(fixture.address, fixtureArtifact.abi, 'balanceOf', [recoverySpike.address]),
  ]);
  const [aggregateYes, aggregateNo] = await Promise.all([
    read(recoverySpike.address, spikeArtifact.abi, 'publicYes'),
    read(recoverySpike.address, spikeArtifact.abi, 'publicNo'),
  ]);
  const access = aggregateAccess as readonly boolean[];
  if (
    (wrapperUnderlying as Address).toLowerCase() !== fixture.address.toLowerCase() ||
    (spikeWrapper as Address).toLowerCase() !== wrapper.address.toLowerCase() ||
    (spikeUnderlying as Address).toLowerCase() !== fixture.address.toLowerCase() ||
    participantCount !== 2n ||
    state !== 4 ||
    access.length !== 3 ||
    access[0] !== true ||
    access[1] !== true ||
    access[2] !== false ||
    fundsLocation !== 2 ||
    observedReleasedAmount !== EXPECTED_RELEASED_COLLATERAL ||
    publicSpikeUnderlyingBalance !== 0n ||
    aggregateYes !== EXPECTED_AGGREGATE_YES ||
    aggregateNo !== EXPECTED_AGGREGATE_NO ||
    aggregateYes + aggregateNo !== observedReleasedAmount
  ) {
    fail('The FND-05C recovery terminal state does not satisfy the required G3 invariants.');
  }

  failureStage = 'corrected FND-05C receipt and spend-ledger validation';
  const ledger = loadLedger();
  let previousBlock = 0;
  const receiptObservations = await Promise.all(
    evidence.transactions.map(async (transaction) => ({
      sourceTransaction: await publicClient.getTransaction({ hash: transaction.hash }),
      transaction,
    })),
  );
  const receipts = await readReceiptBatch(
    rpcUrl,
    evidence.transactions.map((transaction) => transaction.hash),
  );
  for (const [index, { sourceTransaction, transaction }] of receiptObservations.entries()) {
    const receipt = receipts[index];
    const matchingLedgerEntry = ledger.entries.find(
      (entry) =>
        entry.transactionHash.toLowerCase() === transaction.hash.toLowerCase() &&
        entry.blockNumber === transaction.blockNumber.toString() &&
        entry.workItemId === 'FND-05C',
    );
    if (
      !receipt ||
      receipt.status !== transaction.expectedStatus ||
      receipt.blockNumber !== transaction.blockNumber ||
      transaction.blockNumber < previousBlock ||
      sourceTransaction.to?.toLowerCase() !== recoverySpike.address.toLowerCase() ||
      !matchingLedgerEntry
    ) {
      fail('An FND-05C recovery receipt or its spend-ledger reference did not verify.');
    }
    previousBlock = transaction.blockNumber;
  }

  const observed = evidence.observed;
  if (
    observed.participantCount !== 2 ||
    observed.terminalState !== 'Refundable' ||
    observed.aggregatePublicDecryptAccess.yes !== true ||
    observed.aggregatePublicDecryptAccess.no !== true ||
    observed.aggregatePublicDecryptAccess.total !== false ||
    observed.aggregateTotalsConserved !== true ||
    observed.observedReleasedAmount !== EXPECTED_RELEASED_COLLATERAL.toString() ||
    observed.publicSpikeUnderlyingBalance !== '0' ||
    observed.terminalFundsLocation !== 'PoolConfidentialCustody' ||
    observed.terminalOwnerConfidentialBalancesVerifiedLocally !== true ||
    observed.secondaryRecoveryRecordDeletedAfterVerification !== true
  ) {
    fail('The FND-05C recovery evidence observations are incomplete or inconsistent.');
  }

  console.log(
    JSON.stringify({
      gate: 'G3',
      chainId: EXPECTED_CHAIN_ID,
      verificationBlock: (await publicClient.getBlockNumber()).toString(),
      verifiedReceipts:
        verifiedBelowKReceipts + verifiedTimeoutReceipts + evidence.transactions.length,
      verifiedRecoveryReceipts: evidence.transactions.length,
      verifiedSlices: 3,
      status: 'passed',
    }),
  );
}

main().catch(() => {
  console.error(`evidence verification failed during ${failureStage}.`);
  process.exitCode = 1;
});
