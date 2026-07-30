import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createViemHandleClient } from '@iexec-nox/handle';
import {
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  encodeFunctionData,
  http,
  isAddress,
  keccak256,
  parseEther,
  type Abi,
  type Address,
  type Hash,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const EXPECTED_CHAIN_ID = 11_155_111;
const EXPECTED_AGGREGATE_NO = 55n;
const EXPECTED_AGGREGATE_YES = 45n;
const NOX_COMPUTE_ADDRESS = '0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF' as const;
const CONFIRMATION_VALUE = 'yes';
const PROBE_GAS_LIMIT = 2_000_000n;
const RPC_TIMEOUT_MS = 30_000;

interface Artifact {
  abi: Abi;
  bytecode: Hex;
  deployedBytecode: Hex;
  immutableReferences?: Record<string, readonly { start: number; length: number }[]>;
}

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

interface RecoveryFixture {
  fixture: Address;
  wrapper: Address;
  recoverySpike: Address;
}

interface ProofObservation {
  noxComputeAccepted: true;
  proofByteLength: number;
  resultByteLength: number;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const protocolRoot = resolve(scriptDirectory, '../..');
const repositoryRoot = resolve(protocolRoot, '../..');
const artifactDirectory = resolve(protocolRoot, 'artifacts/contracts/feasibility');
const evidencePath = resolve(repositoryRoot, 'evidence/sepolia/G3/FND-05-PROOF-DIAGNOSTIC.json');
const spendLedgerPath = resolve(repositoryRoot, 'evidence/sepolia/spend-ledger.json');
const spikeArtifactPath = resolve(
  artifactDirectory,
  'AggregateRecoverySpike.sol/AggregateRecoverySpike.json',
);
const probeArtifactPath = resolve(
  artifactDirectory,
  'AggregateFinalizationProbe.sol/AggregateFinalizationProbe.json',
);

const COMPUTE_ABI = [
  {
    type: 'function',
    name: 'isAllowed',
    stateMutability: 'view',
    inputs: [
      { name: 'handle', type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ name: 'allowed', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'validateDecryptionProof',
    stateMutability: 'view',
    inputs: [
      { name: 'handle', type: 'bytes32' },
      { name: 'decryptionProof', type: 'bytes' },
    ],
    outputs: [{ name: 'result', type: 'bytes' }],
  },
] as const satisfies Abi;

const RESULT_NAMES = [
  'Succeeded',
  'InvalidLifecycleState',
  'AggregateNotFinalized',
  'InvalidAggregateProofContext',
  'PublicDecryptMismatch',
  'MissingTransientAccess',
  'WrapperUnauthorizedAmount',
  'NoxNotAllowed',
  'NoxUnauthorizedSender',
  'InvalidProof',
  'MalformedDecryptedData',
  'UnknownFailure',
] as const;

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

function recoveryFixture(): RecoveryFixture {
  const argument = process.argv.find((value) => value.startsWith('--recovery='));
  if (!argument) {
    fail(
      'The aggregate proof diagnostic requires --recovery=<fixture>,<wrapper>,<recovery-spike>.',
    );
  }
  const values = argument.slice('--recovery='.length).split(',');
  if (values.length !== 3 || values.some((value) => !isAddress(value))) {
    fail('The aggregate proof diagnostic requires three valid recovery fixture addresses.');
  }
  return {
    fixture: values[0] as Address,
    wrapper: values[1] as Address,
    recoverySpike: values[2] as Address,
  };
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
    fail('The proposed Sepolia write exceeds the committed cumulative gas allowance.');
  }
  for (const maximumCost of maximumCosts) {
    if (maximumCost > singleTransactionCapWei(ledger)) {
      fail('The proposed Sepolia write exceeds the single-transaction gas allowance.');
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

async function main(): Promise<void> {
  loadEnvironment();
  const fixture = recoveryFixture();
  const dryRun = process.argv.includes('--dry-run');
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY as Hex | undefined;
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!privateKey || !rpcUrl) fail('The local Sepolia diagnostic configuration is incomplete.');
  if (!dryRun && process.env.CONFIRM_SEPOLIA_WRITE !== CONFIRMATION_VALUE) {
    fail('Set CONFIRM_SEPOLIA_WRITE=yes only after reviewing the diagnostic dry run.');
  }

  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl, { retryCount: 0, timeout: RPC_TIMEOUT_MS });
  const publicClient = createPublicClient({ cacheTime: 0, chain: sepolia, transport });
  const walletClient = createWalletClient({ account, chain: sepolia, transport });
  const handleClient = await createViemHandleClient(walletClient);
  const spikeArtifact = loadArtifact(spikeArtifactPath, 'aggregate recovery spike');
  const probeArtifact = loadArtifact(probeArtifactPath, 'aggregate finalization probe');
  const ledger = loadLedger();

  if ((await publicClient.getChainId()) !== EXPECTED_CHAIN_ID) {
    fail('The configured RPC is not Ethereum Sepolia.');
  }
  if ((await publicClient.getBalance({ address: account.address })) === 0n) {
    fail('The configured Sepolia deployer has no balance.');
  }

  const [fixtureRuntime, wrapperRuntime, spikeRuntime] = await Promise.all([
    publicClient.getCode({ address: fixture.fixture }),
    publicClient.getCode({ address: fixture.wrapper }),
    publicClient.getCode({ address: fixture.recoverySpike }),
  ]);
  if (
    !fixtureRuntime ||
    !wrapperRuntime ||
    !spikeRuntime ||
    !runtimeMatchesArtifact(spikeRuntime, spikeArtifact)
  ) {
    fail('The documented FND-05C fixture runtime does not match the compiled recovery artifact.');
  }

  const [underlying, state, participants, access, handles, requestId, wrapperBalanceHandle] =
    await Promise.all([
      publicClient.readContract({
        address: fixture.wrapper,
        abi: spikeArtifact.abi,
        functionName: 'underlying',
      } as never),
      publicClient.readContract({
        address: fixture.recoverySpike,
        abi: spikeArtifact.abi,
        functionName: 'state',
      } as never),
      publicClient.readContract({
        address: fixture.recoverySpike,
        abi: spikeArtifact.abi,
        functionName: 'participantCount',
      } as never),
      publicClient.readContract({
        address: fixture.recoverySpike,
        abi: spikeArtifact.abi,
        functionName: 'aggregateAccess',
      } as never),
      publicClient.readContract({
        address: fixture.recoverySpike,
        abi: spikeArtifact.abi,
        functionName: 'aggregateHandles',
      } as never),
      publicClient.readContract({
        address: fixture.recoverySpike,
        abi: spikeArtifact.abi,
        functionName: 'aggregateRequestId',
      } as never),
      publicClient.readContract({
        address: fixture.wrapper,
        abi: [
          {
            type: 'function',
            name: 'confidentialBalanceOf',
            stateMutability: 'view',
            inputs: [{ name: 'account', type: 'address' }],
            outputs: [{ name: 'balance', type: 'bytes32' }],
          },
        ] as const,
        functionName: 'confidentialBalanceOf',
        args: [fixture.recoverySpike],
      }),
    ]);
  if (
    (underlying as Address).toLowerCase() !== fixture.fixture.toLowerCase() ||
    Number(state) !== 2 ||
    participants !== 2n ||
    !Array.isArray(access) ||
    access.length !== 3 ||
    !access[0] ||
    !access[1] ||
    access[2] ||
    requestId === `0x${'0'.repeat(64)}`
  ) {
    fail('The FND-05C fixture is not in the documented aggregate-pending diagnostic state.');
  }

  const expected = [EXPECTED_AGGREGATE_YES, EXPECTED_AGGREGATE_NO] as const;
  const proofs: { value: bigint; decryptionProof: Hex; observation: ProofObservation }[] = [];
  for (let index = 0; index < expected.length; index += 1) {
    const decrypted = await handleClient.publicDecrypt((handles as readonly Hex[])[index]!);
    if (typeof decrypted.value !== 'bigint') fail('The aggregate proof did not decode as uint256.');
    const result = await publicClient.readContract({
      address: NOX_COMPUTE_ADDRESS,
      abi: COMPUTE_ABI,
      functionName: 'validateDecryptionProof',
      args: [(handles as readonly Hex[])[index]!, decrypted.decryptionProof as Hex],
    });
    if (
      result.length !== 66 ||
      BigInt(result) !== expected[index] ||
      decrypted.value !== expected[index]
    ) {
      fail('The public proof did not validate to the expected aggregate without disclosure.');
    }
    proofs.push({
      value: decrypted.value,
      decryptionProof: decrypted.decryptionProof as Hex,
      observation: {
        noxComputeAccepted: true,
        proofByteLength: (decrypted.decryptionProof.length - 2) / 2,
        resultByteLength: (result.length - 2) / 2,
      },
    });
  }

  const [aggregateToSpike, wrapperBalanceToWrapper] = await Promise.all([
    publicClient.readContract({
      address: NOX_COMPUTE_ADDRESS,
      abi: COMPUTE_ABI,
      functionName: 'isAllowed',
      args: [(handles as readonly Hex[])[2]!, fixture.recoverySpike],
    }),
    publicClient.readContract({
      address: NOX_COMPUTE_ADDRESS,
      abi: COMPUTE_ABI,
      functionName: 'isAllowed',
      args: [wrapperBalanceHandle as Hex, fixture.wrapper],
    }),
  ]);
  if (!aggregateToSpike || !wrapperBalanceToWrapper) {
    fail('The documented aggregate or wrapper ACL prerequisite is absent.');
  }

  const deploymentData = encodeDeployData({
    abi: probeArtifact.abi,
    bytecode: probeArtifact.bytecode,
  });
  const probeData = encodeFunctionData({
    abi: probeArtifact.abi,
    functionName: 'probe',
    args: [
      fixture.recoverySpike,
      requestId as Hex,
      proofs[0]!.value,
      proofs[1]!.value,
      proofs[0]!.decryptionProof,
      proofs[1]!.decryptionProof,
    ],
  } as never);
  const [deploymentGas, fees] = await Promise.all([
    publicClient.estimateGas({ account: account.address, data: deploymentData }),
    publicClient.estimateFeesPerGas(),
  ]);
  const maxFeePerGas = fees.maxFeePerGas ?? (await publicClient.getGasPrice());
  assertBudget(ledger, [deploymentGas * maxFeePerGas, PROBE_GAS_LIMIT * maxFeePerGas]);

  if (dryRun) {
    console.log(
      JSON.stringify({
        chainId: EXPECTED_CHAIN_ID,
        mode: 'confirmed-write',
        workItem: 'FND-05C-PROOF-DIAGNOSTIC',
        firstAction: 'deploy a no-custody sanitized finalization classifier',
        deploymentGas: deploymentGas.toString(),
        maximumDeploymentCostWei: (deploymentGas * maxFeePerGas).toString(),
        probeGasLimit: PROBE_GAS_LIMIT.toString(),
        maximumProbeCostWei: (PROBE_GAS_LIMIT * maxFeePerGas).toString(),
        maximumDiagnosticCostWei: ((deploymentGas + PROBE_GAS_LIMIT) * maxFeePerGas).toString(),
        remainingAllowanceWei: (BigInt(ledger.maxTotalSpendWei) - totalSpendWei(ledger)).toString(),
        proofChecks: proofs.map((proof) => proof.observation),
        targetState: 'AggregatePending',
      }),
    );
    return;
  }

  assertCleanSourceTree();
  const deploymentHash = await walletClient.deployContract({
    account,
    abi: probeArtifact.abi,
    bytecode: probeArtifact.bytecode,
    gas: deploymentGas,
    maxFeePerGas,
  });
  const deploymentReceipt = await publicClient.waitForTransactionReceipt({ hash: deploymentHash });
  appendSpend(ledger, {
    workItemId: 'FND-05C',
    phase: 'P0',
    sender: account.address,
    transactionHash: deploymentHash,
    blockNumber: deploymentReceipt.blockNumber.toString(),
    gasUsed: deploymentReceipt.gasUsed.toString(),
    effectiveGasPrice: deploymentReceipt.effectiveGasPrice.toString(),
    actualGasCostWei: (deploymentReceipt.gasUsed * deploymentReceipt.effectiveGasPrice).toString(),
  });
  if (deploymentReceipt.status !== 'success' || !deploymentReceipt.contractAddress) {
    fail('The sanitized finalization classifier deployment did not succeed.');
  }
  const probeAddress = deploymentReceipt.contractAddress;

  const liveFees = await publicClient.estimateFeesPerGas();
  const liveMaxFeePerGas = liveFees.maxFeePerGas ?? (await publicClient.getGasPrice());
  assertBudget(ledger, [PROBE_GAS_LIMIT * liveMaxFeePerGas]);
  const probeHash = await walletClient.sendTransaction({
    account,
    to: probeAddress,
    data: probeData,
    gas: PROBE_GAS_LIMIT,
    maxFeePerGas: liveMaxFeePerGas,
  });
  const probeReceipt = await publicClient.waitForTransactionReceipt({ hash: probeHash });
  appendSpend(ledger, {
    workItemId: 'FND-05C',
    phase: 'P0',
    sender: account.address,
    transactionHash: probeHash,
    blockNumber: probeReceipt.blockNumber.toString(),
    gasUsed: probeReceipt.gasUsed.toString(),
    effectiveGasPrice: probeReceipt.effectiveGasPrice.toString(),
    actualGasCostWei: (probeReceipt.gasUsed * probeReceipt.effectiveGasPrice).toString(),
  });
  if (probeReceipt.status !== 'success')
    fail('The sanitized finalization classifier call did not succeed.');

  const [lastResult, stateAfter, verificationBlock] = await Promise.all([
    publicClient.readContract({
      address: probeAddress,
      abi: probeArtifact.abi,
      functionName: 'lastResult',
    }),
    publicClient.readContract({
      address: fixture.recoverySpike,
      abi: spikeArtifact.abi,
      functionName: 'state',
    }),
    publicClient.getBlockNumber(),
  ]);
  const resultIndex = Number(lastResult);
  const result = RESULT_NAMES[resultIndex];
  if (!result) fail('The classifier returned an out-of-range result.');
  if (
    (result === 'Succeeded' && Number(stateAfter) !== 3) ||
    (result !== 'Succeeded' && Number(stateAfter) !== 2)
  ) {
    fail('The classifier observation did not preserve the expected target state transition.');
  }

  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(
    evidencePath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        gate: 'G3',
        workItem: 'FND-05C-PROOF-DIAGNOSTIC',
        phase: 'P0',
        timestampUtc: new Date().toISOString(),
        sourceCommit: sourceCommit(),
        environment: {
          class: 'sepolia-write-and-read',
          chainId: EXPECTED_CHAIN_ID,
          verificationBlock: verificationBlock.toString(),
          noxComputeAddress: NOX_COMPUTE_ADDRESS,
        },
        contracts: {
          fixture: fixture.fixture,
          wrapper: fixture.wrapper,
          recoverySpike: fixture.recoverySpike,
          probe: probeAddress,
          recoveryRuntimeMatchesCompiledArtifact: runtimeMatchesArtifact(
            spikeRuntime,
            spikeArtifact,
          ),
          recoveryRuntimeHash: keccak256(spikeRuntime),
        },
        transactions: [
          {
            purpose: 'sanitized finalization classifier deployment',
            hash: deploymentHash,
            blockNumber: deploymentReceipt.blockNumber.toString(),
          },
          {
            purpose: 'single permissionless aggregate finalization classification',
            hash: probeHash,
            blockNumber: probeReceipt.blockNumber.toString(),
          },
        ],
        observed: {
          targetStateBefore: 'AggregatePending',
          targetStateAfter: result === 'Succeeded' ? 'UnwrapPending' : 'AggregatePending',
          classifierResult: result,
          directNoxProofValidation: proofs.map((proof) => proof.observation),
          aggregateAmountAllowedToRecoverySpike: aggregateToSpike,
          wrapperBalanceAllowedToWrapper: wrapperBalanceToWrapper,
        },
        privacyAndCustody: {
          plaintextCommitted: false,
          rawHandlesCommitted: false,
          proofsOrCalldataCommitted: false,
          walletSignaturesCommitted: false,
          probeHasCustody: false,
          probeHasExclusiveAuthority: false,
          targetSubcallFailureLeavesTargetStateUnchanged: result !== 'Succeeded',
        },
        knownLimitations: [
          'This diagnostic classifies one live finalization result only. It cannot satisfy FND-05C or G3.',
          'A succeeded classification still requires the real delayed unwrap finalization, measured rewrap, and both owner refunds.',
        ],
        reproduction: [
          'Run npm run test:nox:sepolia -- FND-05-PROOF-DIAGNOSTIC --dry-run --recovery=<fixture>,<wrapper>,<recovery-spike>.',
          'Review the declared gas maximum and remaining cumulative Sepolia allowance before setting CONFIRM_SEPOLIA_WRITE=yes.',
          'Inspect this sanitized artifact and the two referenced Sepolia receipts without exposing local configuration or proof material.',
        ],
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    JSON.stringify({
      chainId: EXPECTED_CHAIN_ID,
      classifierResult: result,
      targetStateAfter: result === 'Succeeded' ? 'UnwrapPending' : 'AggregatePending',
      status: 'classified',
      workItem: 'FND-05C-PROOF-DIAGNOSTIC',
    }),
  );
}

main().catch(() => {
  console.error(
    'aggregate proof diagnostic failed: inspect the sanitized marker and documented fixture state.',
  );
  process.exitCode = 1;
});
