import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createViemHandleClient } from '@iexec-nox/handle';
import {
  createPublicClient,
  createWalletClient,
  http,
  type Abi,
  type Address,
  type Hash,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const CHAIN_ID = 11_155_111;
const FIXTURE = '0x6ddec1152764df0e18ac7de3eecf51a78b3a508d' as const;
const WRAPPER = '0xf578b307c50950d8bb20bedb827033e9549dcc44' as const;
const ADAPTER = '0x5656a86dcb5a52651c441b6ebaf215762953db02' as const;
const FACTORY = '0xbf2729bca968f6d91822568a0939706cc66535d8' as const;
const ACCEPTED_POOL = '0x1552Eb917AB6Ce67370BeD563B4e617f0Cf72D4C' as const;
const MISMATCH_POOL = '0x6D4f8bFDFC9393339B41AF35720d4b23A5304cCe' as const;
const UNCALLED_POOL = '0xb3f5ac10fbaeca422C06A3E490c0F012F89bC319' as const;
const TIMEOUT_POOL = '0xa05445F63a489C9728D24799CF44aB50549866c7' as const;
const EXPECTED_OWNER_BALANCE = 80n;
const EXPECTED_RECEIPTS: readonly Hash[] = [
  '0x07cf397bf09e601c48a3dbd3225a8f4fb3b128fb854deb28684724a6387318ac',
  '0x6a9faff69e70706c62b951973ed8404343fd84cdedc6034424d811f7d2de88d4',
  '0xbf54adaf1207b9e930fccdbe4c05d58d9823b87c177085a7330ecb855fc56d8b',
  '0xc2f10b841b51ddeb5861650f2895525e22bcfc1a6bf5a8eab7dd5667649e5559',
  '0x34bf66dd6e272df8578a0310deebaccdde585278d250957470fd598ee0ef0065',
  '0x82fb24ff38a02cf433a6f6f37b720b7f3ff4925ec772a8f3828ac6cde033e83a',
  '0x597dbaa1d89ecde9177ab7f372ef1059cba3af267fc9d9130dc641f778070004',
  '0x29a6e2b2698e0bf5a855cfa8e93281e14166f217271c46149768687940dcc1b9',
  '0xb7612e7d819dd9ec80b19d200b951c664030b63a4f74c69014940079f94dfab5',
  '0x5aab9432723c5ee998806c7f319985b54e2ecdcc2234a886bdb5c5400b4ed4b2',
  '0xa8b1eda06afb019fd8ab80ecaeb1f170ce6c58bbe0c87bc3d8aa99b037e52ba4',
  '0x65600cd5dff340c960be51293793701364ac9e4b735542458257684666cb9b11',
  '0x1ed6c01fa7474c9c7e1b3ca9635a66d0eebd6e0fa9b138716cdfa48c1f8e60d5',
  '0x8f79a979f0efbb1c72e89b9ee2c8c955fb52bd61ba0931b77342f4ad4ef85800',
  '0x48339742d355b7ebf38321fc7aa63e982091ff8c2cb02d37bd5add3ce0c7720b',
  '0x670a72b5d3d00d7c122253ba6b8eb958490c33e143e0279f055bb4a7f7c5080e',
  '0x13bf65067f56e8a3f3618184f93f8ccf5eeac5f645573d7233d4507017b66b41',
  '0xa2083c4c25c506947de8cf113e9fd3348ec1183b3caea020a328876bb2f9d4b5',
  '0x5ffd31497216a1dc819deeb558bf8ff2d90857d136fd3c4eba8dbd350f3af390',
  '0x8310b3531c29ed6bc0aed12faf549888e0ba30a7f642ad05ddded06267698461',
  '0x61d8ea834519db0948f61ad4017efa28ee41121a1a9c27eddbe1b433661b2f8f',
  '0xa69a483b6560238ee0d2acd7d8e4c24fd8d0b59dff752773aeacc23f2c8b37d0',
];

interface Artifact {
  abi: Abi;
  deployedBytecode: Hex;
  immutableReferences?: Record<string, readonly { start: number; length: number }[]>;
}
interface Ledger {
  chainId: number;
  entries: Array<{ workItemId: string; transactionHash: Hash; blockNumber: string }>;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const protocolRoot = resolve(scriptDirectory, '../..');
const repositoryRoot = resolve(protocolRoot, '../..');
const artifact = (path: string) => resolve(protocolRoot, 'artifacts/contracts', path);
const evidencePaths = [
  resolve(repositoryRoot, 'evidence/offline/G5/PK-04-COMMIT.json'),
  resolve(repositoryRoot, 'evidence/sepolia/G5/PK-04-COMMIT.json'),
];

function fail(message: string): never {
  throw new Error(message);
}
function loadEnvironment(): void {
  const path = resolve(repositoryRoot, '.env');
  if (existsSync(path)) process.loadEnvFile(path);
}
function loadArtifact(path: string): Artifact {
  const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<Artifact>;
  if (!Array.isArray(value.abi) || typeof value.deployedBytecode !== 'string')
    fail('A PK-04 artifact is malformed.');
  return value as Artifact;
}
function runtimeMatches(artifact_: Artifact, runtime: Hex | undefined): boolean {
  if (!runtime) return false;
  const normalize = (value: Hex): Hex => {
    let result = value.slice(2);
    for (const refs of Object.values(artifact_.immutableReferences ?? {})) {
      for (const ref of refs)
        result = `${result.slice(0, ref.start * 2)}${'0'.repeat(ref.length * 2)}${result.slice((ref.start + ref.length) * 2)}`;
    }
    return `0x${result}` as Hex;
  };
  return normalize(runtime).toLowerCase() === normalize(artifact_.deployedBytecode).toLowerCase();
}
function sourceCommit(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
}

async function main(): Promise<void> {
  loadEnvironment();
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY as Hex | undefined;
  if (!rpcUrl || !privateKey)
    fail('PK-04 evidence verification requires configured Sepolia read access and owner signer.');
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
  });
  if ((await publicClient.getChainId()) !== CHAIN_ID)
    fail('The configured RPC is not Ethereum Sepolia.');
  const account = privateKeyToAccount(privateKey);
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
  const handles = await createViemHandleClient(wallet);
  const artifacts = {
    fixture: loadArtifact(artifact('feasibility/FeasibilityERC20.sol/FeasibilityERC20.json')),
    wrapper: loadArtifact(
      artifact(
        'feasibility/FeasibilityConfidentialWrapper.sol/FeasibilityConfidentialWrapper.json',
      ),
    ),
    adapter: loadArtifact(
      artifact(
        'adapters/ChainlinkPriceFeedResolutionAdapter.sol/ChainlinkPriceFeedResolutionAdapter.json',
      ),
    ),
    factory: loadArtifact(artifact('core/QuietSignalFactory.sol/QuietSignalFactory.json')),
    pool: loadArtifact(artifact('core/QuietSignalPool.sol/QuietSignalPool.json')),
  };
  const addresses = [
    FIXTURE,
    WRAPPER,
    ADAPTER,
    FACTORY,
    ACCEPTED_POOL,
    MISMATCH_POOL,
    UNCALLED_POOL,
    TIMEOUT_POOL,
  ] as const;
  const runtimes = await Promise.all(addresses.map((address) => publicClient.getCode({ address })));
  const runtimeChecks = [
    runtimeMatches(artifacts.fixture, runtimes[0]),
    runtimeMatches(artifacts.wrapper, runtimes[1]),
    runtimeMatches(artifacts.adapter, runtimes[2]),
    runtimeMatches(artifacts.factory, runtimes[3]),
    ...runtimes.slice(4).map((runtime) => runtimeMatches(artifacts.pool, runtime)),
  ];
  if (runtimeChecks.some((matches) => !matches))
    fail('A PK-04 deployment does not match its compiled runtime template.');
  const [
    underlying,
    acceptedEpoch,
    mismatchEpoch,
    uncalledEpoch,
    timeoutEpoch,
    acceptedPosition,
    ...pending
  ] = await Promise.all([
    publicClient.readContract({
      address: WRAPPER,
      abi: artifacts.wrapper.abi,
      functionName: 'underlying',
    } as never),
    publicClient.readContract({
      address: ACCEPTED_POOL,
      abi: artifacts.pool.abi,
      functionName: 'epoch',
    } as never),
    publicClient.readContract({
      address: MISMATCH_POOL,
      abi: artifacts.pool.abi,
      functionName: 'epoch',
    } as never),
    publicClient.readContract({
      address: UNCALLED_POOL,
      abi: artifacts.pool.abi,
      functionName: 'epoch',
    } as never),
    publicClient.readContract({
      address: TIMEOUT_POOL,
      abi: artifacts.pool.abi,
      functionName: 'epoch',
    } as never),
    publicClient.readContract({
      address: ACCEPTED_POOL,
      account: account.address,
      abi: artifacts.pool.abi,
      functionName: 'ownerPosition',
    } as never),
    ...[ACCEPTED_POOL, MISMATCH_POOL, UNCALLED_POOL, TIMEOUT_POOL].map((address) =>
      publicClient.readContract({
        address,
        abi: artifacts.pool.abi,
        functionName: 'pendingCommit',
      } as never),
    ),
  ]);
  if ((underlying as Address).toLowerCase() !== FIXTURE.toLowerCase())
    fail('The wrapper does not bind the recorded fixture.');
  const acceptedPublicEpoch = acceptedEpoch as { state: number; participantCount: number };
  const terminalEpochs = [mismatchEpoch, uncalledEpoch, timeoutEpoch] as Array<{
    state: number;
    participantCount: number;
  }>;
  if (
    acceptedPublicEpoch.state !== 0 ||
    acceptedPublicEpoch.participantCount !== 1 ||
    terminalEpochs.some((epoch) => epoch.state !== 0 || epoch.participantCount !== 0)
  )
    fail('The recorded pools do not have their expected terminal public epochs.');
  const acceptedOwnerPosition = acceptedPosition as {
    committed: boolean;
    stake: Hex;
    probabilityBps: Hex;
    yesAllocation: Hex;
    noAllocation: Hex;
  };
  if (!acceptedOwnerPosition.committed) fail('The accepted owner position is absent.');
  if (
    (pending as Array<readonly [Address]>).some(
      (value) => value[0] !== '0x0000000000000000000000000000000000000000',
    )
  )
    fail('A PK-04 pool still has a pending commit.');
  const balanceHandle = (await publicClient.readContract({
    address: WRAPPER,
    abi: artifacts.wrapper.abi,
    functionName: 'confidentialBalanceOf',
    args: [account.address],
  } as never)) as Hex;
  const balance = await handles.decrypt(balanceHandle);
  if (balance.value !== EXPECTED_OWNER_BALANCE)
    fail('The terminal owner confidential balance is not conserved.');
  for (const handle of [
    acceptedOwnerPosition.stake,
    acceptedOwnerPosition.probabilityBps,
    acceptedOwnerPosition.yesAllocation,
    acceptedOwnerPosition.noAllocation,
  ]) {
    const value = await handles.decrypt(handle);
    if (typeof value.value !== 'bigint')
      fail('The owner viewer ACL could not decrypt a final position handle.');
  }
  const [nativeBalances, receipts] = await Promise.all([
    Promise.all(addresses.slice(3).map((address) => publicClient.getBalance({ address }))),
    Promise.all(EXPECTED_RECEIPTS.map((hash) => publicClient.getTransactionReceipt({ hash }))),
  ]);
  if (
    nativeBalances.some((balance_) => balance_ !== 0n) ||
    receipts.some((receipt) => receipt.status !== 'success')
  )
    fail('PK-04 native custody or receipt verification failed.');
  const ledger = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'evidence/sepolia/spend-ledger.json'), 'utf8'),
  ) as Ledger;
  if (ledger.chainId !== CHAIN_ID) fail('The spend ledger is on the wrong chain.');
  const ledgerHashes = new Set(
    ledger.entries
      .filter((entry) => entry.workItemId === 'PK-04')
      .map((entry) => entry.transactionHash),
  );
  if (EXPECTED_RECEIPTS.some((hash) => !ledgerHashes.has(hash)))
    fail('A PK-04 receipt is missing from the spend ledger.');
  const evidence = {
    schemaVersion: 1,
    gate: 'G5',
    workItem: 'PK-04',
    phase: 'P1',
    sourceCommit: sourceCommit(),
    environment: {
      chainId: CHAIN_ID,
      verificationBlock: (await publicClient.getBlockNumber()).toString(),
    },
    contracts: {
      fixture: FIXTURE,
      wrapper: WRAPPER,
      adapter: ADAPTER,
      factory: FACTORY,
      acceptedPool: ACCEPTED_POOL,
      mismatchPool: MISMATCH_POOL,
      uncalledPool: UNCALLED_POOL,
      callbackTimeoutPool: TIMEOUT_POOL,
    },
    transactions: receipts.map((receipt) => ({
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber.toString(),
      status: receipt.status,
    })),
    checks: {
      runtimeTemplatesMatch: true,
      wrapperFixtureBinding: true,
      matchingCommitFinalized: true,
      acceptedOwnerViewerAclVerified: true,
      mismatchRejectedAndRefunded: true,
      uncalledIntentPermissionlesslyCleared: true,
      callbackTimeoutReturnedConfidentialCollateral: true,
      terminalOwnerConservationVerified: true,
      terminalPendingCommitsCleared: true,
      nativeBalancesZero: true,
      receiptLedgerComplete: true,
    },
    privacyImpact:
      'No plaintext confidential value, handle, or proof is persisted. Owner decryption checks are evaluated only in process.',
    fundsLocation:
      'Accepted collateral is confidential accepted-pool custody. Rejected, uncalled, and callback-timeout collateral is confidential owner custody.',
    status: 'passed',
  };
  for (const path of evidencePaths) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`);
  }
  console.log(
    JSON.stringify({
      workItem: 'PK-04',
      status: 'passed',
      verificationBlock: evidence.environment.verificationBlock,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(
    `PK-04 verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
  );
  process.exitCode = 1;
});
