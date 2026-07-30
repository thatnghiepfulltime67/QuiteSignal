import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPublicClient, http, keccak256, parseAbi, type Address, type Hex } from 'viem';
import { sepolia } from 'viem/chains';

const EXPECTED_CHAIN_ID = 11_155_111;
const ETH_USD_FEED = '0x694AA1769357215DE4FAC081bf1f309aDC325306' as const;
const EXPECTED_DESCRIPTION = 'ETH / USD';
const EXPECTED_DECIMALS = 8;
const MAX_INT256 = (1n << 255n) - 1n;
const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const offlineEvidencePath = resolve(repositoryRoot, 'evidence/offline/G4/FND-06-RESOLUTION.json');
const sepoliaEvidencePath = resolve(repositoryRoot, 'evidence/sepolia/G4/FND-06-RESOLUTION.json');
const artifactPath = resolve(
  repositoryRoot,
  'modules/protocol/artifacts/contracts/feasibility/PriceFeedResolutionSpike.sol/PriceFeedResolutionSpike.json',
);

const feedAbi = parseAbi([
  'function decimals() view returns (uint8)',
  'function description() view returns (string)',
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
]);
const spikeAbi = parseAbi([
  'function target() view returns (address)',
  'function targetRuntimeCodeHash() view returns (bytes32)',
  'function greaterOrEqual() view returns (bool)',
  'function threshold() view returns (int256)',
  'function observationNotBefore() view returns (uint256)',
  'function maximumFeedAge() view returns (uint256)',
  'function resolution() view returns (bool yes, int256 answer, uint80 roundId, uint256 updatedAt)',
]);
let failureStage = 'configuration validation';

interface Artifact {
  deployedBytecode: Hex;
  immutableReferences: Record<string, Array<{ start: number; length: number }>>;
}

interface DeploymentEvidence {
  name: 'yes' | 'no' | 'stale' | 'future';
  address: Address;
  deploymentHash: Hex;
  blockNumber: string;
  runtimeBytecodeHash: Hex;
}

interface G4Evidence {
  schemaVersion: number;
  workItem: string;
  gate: string;
  chainId: number;
  sourceCommit: string;
  verificationBlock: string;
  target: {
    address: Address;
    decimals: number;
    description: string;
    runtimeBytecodeHash: Hex;
  };
  latestRoundAtPlan: {
    roundId: string;
    answer: string;
    startedAt: string;
    updatedAt: string;
    answeredInRound: string;
    ageSeconds: string;
  };
  spikeRuntimeTemplateHash: Hex;
  deployments: DeploymentEvidence[];
  checks: Record<string, boolean>;
  status: string;
}

function fail(message: string): never {
  throw new Error(message);
}

function loadEvidence(path: string): G4Evidence {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<G4Evidence>;
  if (
    parsed.schemaVersion !== 1 ||
    parsed.workItem !== 'FND-06B' ||
    parsed.gate !== 'G4' ||
    parsed.chainId !== EXPECTED_CHAIN_ID ||
    typeof parsed.sourceCommit !== 'string' ||
    typeof parsed.verificationBlock !== 'string' ||
    !parsed.target ||
    !parsed.latestRoundAtPlan ||
    !Array.isArray(parsed.deployments) ||
    !parsed.checks ||
    parsed.status !== 'passed'
  ) {
    fail('The G4 evidence artifact is malformed or does not claim a passed FND-06B run.');
  }
  return parsed as G4Evidence;
}

function loadArtifact(): Artifact {
  const parsed = JSON.parse(readFileSync(artifactPath, 'utf8')) as Partial<Artifact>;
  if (
    typeof parsed.deployedBytecode !== 'string' ||
    typeof parsed.immutableReferences !== 'object' ||
    parsed.immutableReferences === null
  ) {
    fail('The compiled G4 spike artifact is unavailable or malformed.');
  }
  return parsed as Artifact;
}

function normalizedRuntimeTemplate(artifact: Artifact, runtime: Hex): Hex {
  const bytes = runtime.slice(2).split('');
  for (const references of Object.values(artifact.immutableReferences)) {
    for (const reference of references) {
      const start = reference.start * 2;
      const end = start + reference.length * 2;
      if (reference.length <= 0 || start < 0 || end > bytes.length) {
        fail('The compiled G4 spike immutable-reference metadata is invalid.');
      }
      bytes.fill('0', start, end);
    }
  }
  return `0x${bytes.join('')}` as Hex;
}

function assertSourceCommitReachable(sourceCommit: string): void {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sourceCommit, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
  } catch {
    fail('The G4 evidence source commit is not reachable from the current history.');
  }
}

async function expectRevert(call: () => Promise<unknown>, scenario: string): Promise<void> {
  try {
    await call();
  } catch {
    return;
  }
  fail(`${scenario} did not reject on Ethereum Sepolia.`);
}

async function main(): Promise<void> {
  failureStage = 'configuration validation';
  if (existsSync(resolve(repositoryRoot, '.env')))
    process.loadEnvFile(resolve(repositoryRoot, '.env'));
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) fail('SEPOLIA_RPC_URL is required for read-only G4 evidence verification.');

  failureStage = 'evidence artifact validation';
  const offlineRaw = readFileSync(offlineEvidencePath, 'utf8');
  const sepoliaRaw = readFileSync(sepoliaEvidencePath, 'utf8');
  if (offlineRaw !== sepoliaRaw) fail('The offline and Sepolia G4 evidence artifacts differ.');
  const evidence = loadEvidence(sepoliaEvidencePath);
  assertSourceCommitReachable(evidence.sourceCommit);

  failureStage = 'Ethereum Sepolia preflight';
  const publicClient = createPublicClient({
    cacheTime: 0,
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
  });
  if ((await publicClient.getChainId()) !== EXPECTED_CHAIN_ID) {
    fail('The configured RPC is not Ethereum Sepolia.');
  }

  failureStage = 'target runtime and round verification';
  const verificationBlock = BigInt(evidence.verificationBlock);
  const [targetRuntime, decimals, description, round] = await Promise.all([
    publicClient.getCode({ address: ETH_USD_FEED }),
    publicClient.readContract({ address: ETH_USD_FEED, abi: feedAbi, functionName: 'decimals' }),
    publicClient.readContract({
      address: ETH_USD_FEED,
      abi: feedAbi,
      functionName: 'description',
    }),
    publicClient.readContract({
      address: ETH_USD_FEED,
      abi: feedAbi,
      functionName: 'latestRoundData',
      blockNumber: verificationBlock,
    }),
  ]);
  if (!targetRuntime || evidence.target.address.toLowerCase() !== ETH_USD_FEED.toLowerCase()) {
    fail('The recorded G4 target address or runtime is invalid.');
  }
  if (
    decimals !== EXPECTED_DECIMALS ||
    description !== EXPECTED_DESCRIPTION ||
    evidence.target.decimals !== EXPECTED_DECIMALS ||
    evidence.target.description !== EXPECTED_DESCRIPTION ||
    keccak256(targetRuntime).toLowerCase() !== evidence.target.runtimeBytecodeHash.toLowerCase()
  ) {
    fail('The recorded G4 target metadata or runtime hash does not match Sepolia.');
  }
  const [roundId, answer, startedAt, updatedAt, answeredInRound] = round;
  if (
    roundId.toString() !== evidence.latestRoundAtPlan.roundId ||
    answer.toString() !== evidence.latestRoundAtPlan.answer ||
    startedAt.toString() !== evidence.latestRoundAtPlan.startedAt ||
    updatedAt.toString() !== evidence.latestRoundAtPlan.updatedAt ||
    answeredInRound.toString() !== evidence.latestRoundAtPlan.answeredInRound
  ) {
    fail('The recorded G4 feed round does not match the Sepolia verification block.');
  }

  failureStage = 'compiled spike template verification';
  const artifact = loadArtifact();
  if (
    keccak256(normalizedRuntimeTemplate(artifact, artifact.deployedBytecode)).toLowerCase() !==
    evidence.spikeRuntimeTemplateHash.toLowerCase()
  ) {
    fail('The recorded G4 spike runtime template does not match the compiled artifact.');
  }
  const expectedNames = ['yes', 'no', 'stale', 'future'] as const;
  if (
    evidence.deployments.length !== expectedNames.length ||
    new Set(evidence.deployments.map((deployment) => deployment.name)).size !== expectedNames.length
  ) {
    fail('The G4 evidence does not contain exactly one deployment for every required scenario.');
  }
  for (const requiredCheck of [
    'targetRuntime',
    'expectedMetadata',
    'validRound',
    'invalidConfigurationRejected',
    'noCallerResultInput',
    'immutableTargetBinding',
    'yesThreshold',
    'noThreshold',
    'staleRoundRejected',
    'prematureObservationRejected',
    'valueTransferRejected',
    'zeroCustodyBalances',
  ]) {
    if (evidence.checks[requiredCheck] !== true) {
      fail(`The G4 evidence is missing its required ${requiredCheck} conclusion.`);
    }
  }

  const deployments = Object.fromEntries(
    evidence.deployments.map((deployment) => [deployment.name, deployment]),
  ) as Record<(typeof expectedNames)[number], DeploymentEvidence>;
  const observedTimes: bigint[] = [];
  for (const name of expectedNames) {
    failureStage = `${name} deployment verification`;
    const deployment = deployments[name];
    if (!deployment) fail('The G4 evidence deployment set is incomplete.');
    const [receipt, runtime, target, targetRuntimeHash, greaterOrEqual, threshold, observation] =
      await Promise.all([
        publicClient.getTransactionReceipt({ hash: deployment.deploymentHash }),
        publicClient.getCode({ address: deployment.address }),
        publicClient.readContract({
          address: deployment.address,
          abi: spikeAbi,
          functionName: 'target',
        }),
        publicClient.readContract({
          address: deployment.address,
          abi: spikeAbi,
          functionName: 'targetRuntimeCodeHash',
        }),
        publicClient.readContract({
          address: deployment.address,
          abi: spikeAbi,
          functionName: 'greaterOrEqual',
        }),
        publicClient.readContract({
          address: deployment.address,
          abi: spikeAbi,
          functionName: 'threshold',
        }),
        publicClient.readContract({
          address: deployment.address,
          abi: spikeAbi,
          functionName: 'observationNotBefore',
        }),
      ]);
    if (
      receipt.status !== 'success' ||
      receipt.contractAddress?.toLowerCase() !== deployment.address.toLowerCase() ||
      receipt.blockNumber.toString() !== deployment.blockNumber ||
      !runtime ||
      keccak256(runtime).toLowerCase() !== deployment.runtimeBytecodeHash.toLowerCase() ||
      normalizedRuntimeTemplate(artifact, runtime).toLowerCase() !==
        normalizedRuntimeTemplate(artifact, artifact.deployedBytecode).toLowerCase() ||
      target.toLowerCase() !== ETH_USD_FEED.toLowerCase() ||
      targetRuntimeHash.toLowerCase() !== evidence.target.runtimeBytecodeHash.toLowerCase() ||
      !greaterOrEqual
    ) {
      fail(`The ${name} G4 deployment binding is invalid.`);
    }
    if (name === 'yes' || name === 'stale' || name === 'future') {
      if (threshold !== 1n) fail(`The ${name} G4 threshold is invalid.`);
    } else if (threshold !== MAX_INT256) {
      fail('The no G4 threshold is invalid.');
    }
    observedTimes.push(observation);
  }
  failureStage = 'immutable observation-time verification';
  const [yesObservation, noObservation, staleObservation, futureObservation] = observedTimes;
  if (
    yesObservation === undefined ||
    noObservation === undefined ||
    staleObservation === undefined ||
    futureObservation === undefined
  ) {
    fail('The G4 observation-time verification set is incomplete.');
  }
  if (yesObservation !== noObservation || yesObservation !== staleObservation) {
    fail('The same-feed G4 scenarios do not share an observation time.');
  }
  if (futureObservation !== yesObservation + 3_600n) {
    fail('The future-observation G4 scenario is not immutably delayed.');
  }

  failureStage = 'historical threshold verification';
  const yes = await publicClient.readContract({
    address: deployments.yes.address,
    abi: spikeAbi,
    functionName: 'resolution',
    blockNumber: verificationBlock,
  });
  const no = await publicClient.readContract({
    address: deployments.no.address,
    abi: spikeAbi,
    functionName: 'resolution',
    blockNumber: verificationBlock,
  });
  if (!yes[0] || no[0] || yes[1] <= 0n || no[1] <= 0n || yes[2] === 0n || no[2] === 0n) {
    fail('The historical G4 threshold outcomes do not match the recorded live result.');
  }
  failureStage = 'historical negative resolution verification';
  await expectRevert(
    () =>
      publicClient.readContract({
        address: deployments.stale.address,
        abi: spikeAbi,
        functionName: 'resolution',
        blockNumber: verificationBlock,
      }),
    'Historical stale feed round',
  );
  failureStage = 'zero-custody transfer verification';
  await expectRevert(
    () =>
      publicClient.readContract({
        address: deployments.future.address,
        abi: spikeAbi,
        functionName: 'resolution',
        blockNumber: verificationBlock,
      }),
    'Historical premature observation',
  );
  await expectRevert(
    () => publicClient.call({ to: deployments.yes.address, value: 1n }),
    'Value transfer to zero-custody adapter',
  );
  failureStage = 'zero-balance verification';
  for (const deployment of evidence.deployments) {
    if ((await publicClient.getBalance({ address: deployment.address })) !== 0n) {
      fail(`The ${deployment.name} G4 spike retains a balance.`);
    }
  }

  console.log(
    JSON.stringify({
      gate: 'G4',
      chainId: EXPECTED_CHAIN_ID,
      verificationBlock: evidence.verificationBlock,
      verifiedDeployments: evidence.deployments.length,
      status: 'passed',
    }),
  );
}

main().catch(() => {
  console.error(`G4 evidence verification failed during ${failureStage}.`);
  process.exitCode = 1;
});
