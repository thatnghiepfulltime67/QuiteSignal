import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createViemHandleClient } from '@iexec-nox/handle';
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  type Abi,
  type Address,
  type Hash,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const CHAIN_ID = 11_155_111;
const FIXTURE = '0xa0dc5ef160c9bac33fb243bae5bf010f9d0b442f' as const;
const WRAPPER = '0x29edb47017ae32c0260d7e0aa29ba6f1afc741bd' as const;
const ADAPTER = '0x036285bf998f62bad4a202e3c34af72588e0083c' as const;
const FACTORY = '0x4ba9323a61f6cf75d84e94b4cc084a6e216d1b96' as const;
const CLAIM_POOL = '0x84903e8a2480596309285f7152f6e5e7af38ea74' as const;
const REFUND_POOL = '0x05c7a8bf74f9628f4dd06cef4dd856c29ea9304b' as const;
const STAGED_PRIMARY_BALANCE = 100n;
const PRIMARY_PROBABILITY_BPS = 7_500n;
const BPS_SCALE = 10_000n;
const NON_MEMBER = '0x000000000000000000000000000000000000dEaD' as const;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PROTOCOL = resolve(ROOT, 'modules/protocol');
const LEDGER = resolve(ROOT, 'evidence/sepolia/spend-ledger.json');
const EVIDENCE = [
  resolve(ROOT, 'evidence/offline/G5/PK-07-TERMINALS.json'),
  resolve(ROOT, 'evidence/sepolia/G5/PK-07-TERMINALS.json'),
];

interface Artifact {
  abi: Abi;
  deployedBytecode: Hex;
  immutableReferences?: Record<string, readonly { start: number; length: number }[]>;
}

interface Ledger {
  chainId: number;
  entries: Array<{ workItemId: string; transactionHash: Hash }>;
}

interface Epoch {
  state: number;
  winner: number;
  participantCount: number;
  publicYes: bigint;
  publicNo: bigint;
  settledRoundId: bigint;
  settledAnswer: bigint;
}

interface Position {
  committed: boolean;
  claimed: boolean;
  refunded: boolean;
  yesAllocation: Hex;
  noAllocation: Hex;
  scoreBps: Hex;
}

function fail(message: string): never {
  throw new Error(message);
}

function loadArtifact(path: string): Artifact {
  const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<Artifact>;
  if (!Array.isArray(value.abi) || typeof value.deployedBytecode !== 'string')
    fail(`Malformed artifact: ${path}`);
  return value as Artifact;
}

function sourceCommit(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
}

function runtimeMatches(artifact: Artifact, runtime: Hex | undefined): boolean {
  if (!runtime) return false;
  const normalize = (value: Hex): Hex => {
    let output = value.slice(2);
    for (const references of Object.values(artifact.immutableReferences ?? {})) {
      for (const reference of references) {
        output = `${output.slice(0, reference.start * 2)}${'0'.repeat(reference.length * 2)}${output.slice((reference.start + reference.length) * 2)}`;
      }
    }
    return `0x${output}` as Hex;
  };
  return normalize(runtime).toLowerCase() === normalize(artifact.deployedBytecode).toLowerCase();
}

async function expectRevert(action: () => Promise<unknown>, scenario: string): Promise<void> {
  try {
    await action();
  } catch {
    return;
  }
  fail(`${scenario} did not reject on Ethereum Sepolia.`);
}

async function main(): Promise<void> {
  const env = resolve(ROOT, '.env');
  if (existsSync(env)) process.loadEnvFile(env);
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY as Hex | undefined;
  if (!rpcUrl || !privateKey)
    fail('PK-07 verification requires configured Sepolia RPC access and the owner signer.');

  const client = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
  });
  if ((await client.getChainId()) !== CHAIN_ID) fail('The configured RPC is not Ethereum Sepolia.');
  const account = privateKeyToAccount(privateKey);
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
  const handles = await createViemHandleClient(wallet);
  const artifacts = {
    fixture: loadArtifact(
      resolve(
        PROTOCOL,
        'artifacts/contracts/feasibility/FeasibilityERC20.sol/FeasibilityERC20.json',
      ),
    ),
    wrapper: loadArtifact(
      resolve(
        PROTOCOL,
        'artifacts/contracts/feasibility/FeasibilityConfidentialWrapper.sol/FeasibilityConfidentialWrapper.json',
      ),
    ),
    adapter: loadArtifact(
      resolve(
        PROTOCOL,
        'artifacts/contracts/adapters/ChainlinkPriceFeedResolutionAdapter.sol/ChainlinkPriceFeedResolutionAdapter.json',
      ),
    ),
    factory: loadArtifact(
      resolve(PROTOCOL, 'artifacts/contracts/core/QuietSignalFactory.sol/QuietSignalFactory.json'),
    ),
    pool: loadArtifact(
      resolve(PROTOCOL, 'artifacts/contracts/core/QuietSignalPool.sol/QuietSignalPool.json'),
    ),
  };
  const addresses = [FIXTURE, WRAPPER, ADAPTER, FACTORY, CLAIM_POOL, REFUND_POOL] as const;
  const [runtimes, claimEpochRaw, refundEpochRaw, claimPositionRaw, refundPositionRaw, configRaw] =
    await Promise.all([
      Promise.all(addresses.map((address) => client.getCode({ address }))),
      client.readContract({
        address: CLAIM_POOL,
        abi: artifacts.pool.abi,
        functionName: 'epoch',
      } as never),
      client.readContract({
        address: REFUND_POOL,
        abi: artifacts.pool.abi,
        functionName: 'epoch',
      } as never),
      client.readContract({
        address: CLAIM_POOL,
        account: account.address,
        abi: artifacts.pool.abi,
        functionName: 'ownerPosition',
      } as never),
      client.readContract({
        address: REFUND_POOL,
        account: account.address,
        abi: artifacts.pool.abi,
        functionName: 'ownerPosition',
      } as never),
      client.readContract({
        address: CLAIM_POOL,
        abi: artifacts.pool.abi,
        functionName: 'config',
      } as never),
    ]);
  const runtimeChecks = [
    runtimeMatches(artifacts.fixture, runtimes[0]),
    runtimeMatches(artifacts.wrapper, runtimes[1]),
    runtimeMatches(artifacts.adapter, runtimes[2]),
    runtimeMatches(artifacts.factory, runtimes[3]),
    runtimeMatches(artifacts.pool, runtimes[4]),
    runtimeMatches(artifacts.pool, runtimes[5]),
  ];
  if (runtimeChecks.some((matches) => !matches))
    fail('A PK-07 runtime does not match its artifact.');

  const claimEpoch = claimEpochRaw as Epoch;
  const refundEpoch = refundEpochRaw as Epoch;
  const claimPosition = claimPositionRaw as Position;
  const refundPosition = refundPositionRaw as Position;
  const config = configRaw as { confidentialCollateral: Address; resolutionAdapter: Address };
  if (
    claimEpoch.state !== 4 ||
    claimEpoch.participantCount !== 2 ||
    claimEpoch.winner === 0 ||
    claimEpoch.settledRoundId === 0n ||
    claimEpoch.settledAnswer <= 0n ||
    refundEpoch.state !== 5 ||
    refundEpoch.participantCount !== 1 ||
    !claimPosition.committed ||
    !claimPosition.claimed ||
    claimPosition.refunded ||
    !refundPosition.committed ||
    refundPosition.claimed ||
    !refundPosition.refunded ||
    config.confidentialCollateral.toLowerCase() !== WRAPPER.toLowerCase() ||
    config.resolutionAdapter.toLowerCase() !== ADAPTER.toLowerCase()
  ) {
    fail('The expected PK-07 terminal states, flags, or immutable bindings were not preserved.');
  }

  const winningAllocationHandle =
    claimEpoch.winner === 1 ? claimPosition.yesAllocation : claimPosition.noAllocation;
  const [winningAllocation, score, ownerBalance] = await Promise.all([
    handles.decrypt(winningAllocationHandle),
    handles.decrypt(claimPosition.scoreBps),
    (async () => {
      const balanceHandle = (await client.readContract({
        address: WRAPPER,
        abi: artifacts.wrapper.abi,
        functionName: 'confidentialBalanceOf',
        args: [account.address],
      } as never)) as Hex;
      return handles.decrypt(balanceHandle);
    })(),
  ]);
  if (
    typeof winningAllocation.value !== 'bigint' ||
    typeof score.value !== 'bigint' ||
    typeof ownerBalance.value !== 'bigint'
  ) {
    fail('The owner-scoped PK-07 values did not decode as uint256.');
  }
  const winningAggregate = claimEpoch.winner === 1 ? claimEpoch.publicYes : claimEpoch.publicNo;
  if (winningAggregate === 0n) fail('The settled PK-07 winning aggregate is zero.');
  const expectedPayout =
    (winningAllocation.value * (claimEpoch.publicYes + claimEpoch.publicNo)) / winningAggregate;
  const outcomeBps = claimEpoch.winner === 1 ? BPS_SCALE : 0n;
  const absoluteError =
    PRIMARY_PROBABILITY_BPS >= outcomeBps
      ? PRIMARY_PROBABILITY_BPS - outcomeBps
      : outcomeBps - PRIMARY_PROBABILITY_BPS;
  const expectedScore = BPS_SCALE - (absoluteError * absoluteError) / BPS_SCALE;
  if (
    score.value !== expectedScore ||
    ownerBalance.value !== STAGED_PRIMARY_BALANCE + expectedPayout
  ) {
    fail('The PK-07 confidential score or terminal-transfer conservation check failed.');
  }

  const call = (pool: Address, functionName: string, account_: Address = account.address) =>
    client.call({
      account: account_,
      to: pool,
      data: encodeFunctionData({ abi: artifacts.pool.abi, functionName } as never),
    });
  await Promise.all([
    expectRevert(() => call(CLAIM_POOL, 'claim'), 'Duplicate settled claim'),
    expectRevert(() => call(CLAIM_POOL, 'refund'), 'Refund from a settled pool'),
    expectRevert(() => call(REFUND_POOL, 'refund'), 'Duplicate refundable refund'),
    expectRevert(() => call(REFUND_POOL, 'claim'), 'Claim from a refundable pool'),
    expectRevert(() => call(CLAIM_POOL, 'claim', NON_MEMBER), 'Non-member settled claim'),
    expectRevert(() => call(REFUND_POOL, 'refund', NON_MEMBER), 'Non-member refundable refund'),
  ]);

  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger;
  const entries = ledger.entries.filter((entry) => entry.workItemId === 'PK-07');
  const receipts = await Promise.all(
    entries.map((entry) => client.getTransactionReceipt({ hash: entry.transactionHash })),
  );
  const nativeBalances = await Promise.all(
    [FACTORY, CLAIM_POOL, REFUND_POOL].map((address) => client.getBalance({ address })),
  );
  if (
    ledger.chainId !== CHAIN_ID ||
    receipts.length < 25 ||
    receipts.some((receipt) => receipt.status !== 'success') ||
    nativeBalances.some((balance) => balance !== 0n)
  ) {
    fail('The PK-07 receipt-ledger or native-custody verification failed.');
  }

  const evidence = {
    schemaVersion: 1,
    gate: 'G5',
    workItem: 'PK-07',
    phase: 'P1',
    sourceCommit: sourceCommit(),
    environment: {
      chainId: CHAIN_ID,
      verificationBlock: (await client.getBlockNumber()).toString(),
    },
    contracts: {
      fixture: FIXTURE,
      wrapper: WRAPPER,
      adapter: ADAPTER,
      factory: FACTORY,
      claimPool: CLAIM_POOL,
      refundPool: REFUND_POOL,
    },
    checks: {
      runtimeTemplatesMatch: true,
      immutableBindingsMatch: true,
      settledScoreMaterialized: true,
      ownerViewerScoreAclVerified: true,
      winnerPayoutTransferredConfidentially: true,
      refundableStakeReturnedConfidentially: true,
      duplicateTerminalActionsRejected: true,
      opposingTerminalActionsRejected: true,
      nonMemberTerminalActionsRejected: true,
      terminalTransferConservationVerified: true,
      receiptLedgerComplete: true,
      nativeBalancesZero: true,
    },
    privacyImpact:
      'Owner score, allocation, payout, refund, and balance values are decrypted only in process and never persisted; the report records public state facts only.',
    fundsLocation:
      'The claimed owner and refundable owner have received their respective confidential terminal transfers; any remaining claim-pool collateral stays confidentially claimable by its committed owner.',
    status: 'passed',
  };
  for (const path of EVIDENCE) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`);
  }
  console.log(
    JSON.stringify({
      workItem: 'PK-07',
      status: 'passed',
      verificationBlock: evidence.environment.verificationBlock,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(
    `PK-07 verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
  );
  process.exitCode = 1;
});
