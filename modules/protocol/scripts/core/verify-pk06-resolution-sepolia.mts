import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPublicClient, http, type Abi, type Address, type Hash } from 'viem';
import { sepolia } from 'viem/chains';

const CHAIN_ID = 11_155_111;
const FIXTURE = '0xe0364be79d2a87f3253bab014c0f1eda0ade0184' as const;
const WRAPPER = '0xacaa8f756f48d537901cbf5aed3931651a1d67a6' as const;
const ADAPTER = '0xaa8116ba3ecb5060ed206086390e8249f842be89' as const;
const FACTORY = '0x9ff278c3209606dd0e29fd258a973238898c9a4c' as const;
const TIMEOUT = '0xfa34982fdee60487102a71807f83a4bab4fe6b9b' as const;
const GRACE = '0x184ab3b794845f5d8407c68bccf3da8a93dfc3b4' as const;
const SUCCESS = '0x50757b272201c9f7b0964bc48c1ef28af58fb337' as const;
const GUARD = '0xc0681ce274eb3dde21f80c8ed5c39db922a7c215' as const;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PROTOCOL = resolve(ROOT, 'modules/protocol');
const LEDGER = resolve(ROOT, 'evidence/sepolia/spend-ledger.json');
const EVIDENCE = [
  resolve(ROOT, 'evidence/offline/G5/PK-06-RESOLUTION.json'),
  resolve(ROOT, 'evidence/sepolia/G5/PK-06-RESOLUTION.json'),
];
interface Artifact {
  abi: Abi;
}
interface Ledger {
  chainId: number;
  entries: Array<{ workItemId: string; transactionHash: Hash }>;
}
function fail(message: string): never {
  throw new Error(message);
}
function loadArtifact(path: string): Artifact {
  const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<Artifact>;
  if (!Array.isArray(value.abi)) fail('PK-06 pool ABI is missing.');
  return value as Artifact;
}
function sourceCommit(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
}
async function main(): Promise<void> {
  const env = resolve(ROOT, '.env');
  if (existsSync(env)) process.loadEnvFile(env);
  if (!process.env.SEPOLIA_RPC_URL) fail('SEPOLIA_RPC_URL is required.');
  const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL),
  });
  if ((await client.getChainId()) !== CHAIN_ID) fail('The configured RPC is not Ethereum Sepolia.');
  const pool = loadArtifact(
    resolve(PROTOCOL, 'artifacts/contracts/core/QuietSignalPool.sol/QuietSignalPool.json'),
  );
  const [timeout, grace, success, guard, codes, balances] = await Promise.all([
    client.readContract({ address: TIMEOUT, abi: pool.abi, functionName: 'epoch' } as never),
    client.readContract({ address: GRACE, abi: pool.abi, functionName: 'epoch' } as never),
    client.readContract({ address: SUCCESS, abi: pool.abi, functionName: 'epoch' } as never),
    client.readContract({ address: GUARD, abi: pool.abi, functionName: 'epoch' } as never),
    Promise.all(
      [FIXTURE, WRAPPER, ADAPTER, FACTORY, TIMEOUT, GRACE, SUCCESS, GUARD].map((address) =>
        client.getCode({ address }),
      ),
    ),
    Promise.all(
      [FACTORY, TIMEOUT, GRACE, SUCCESS].map((address) => client.getBalance({ address })),
    ),
  ]);
  const timedOut = timeout as { state: number; participantCount: number };
  const graced = grace as { state: number; participantCount: number };
  const settled = success as {
    state: number;
    participantCount: number;
    winner: number;
    settledRoundId: bigint;
    settledAnswer: bigint;
  };
  if (timedOut.state !== 5 || timedOut.participantCount !== 2)
    fail('Aggregate-timeout recovery was not preserved.');
  if (graced.state !== 5 || graced.participantCount !== 2)
    fail('Resolution-grace recovery was not preserved.');
  if ((guard as { state: number; participantCount: number }).state !== 2)
    fail('Aggregate-timeout guard evidence was not preserved.');
  if (
    settled.state !== 4 ||
    settled.participantCount !== 2 ||
    settled.winner === 0 ||
    settled.settledRoundId === 0n ||
    settled.settledAnswer <= 0n
  )
    fail('Immutable adapter settlement was not preserved.');
  if (codes.some((code) => !code) || balances.some((value) => value !== 0n))
    fail('PK-06 binding or native custody verification failed.');
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger;
  const entries = ledger.entries.filter((entry) => entry.workItemId === 'PK-06');
  const receipts = await Promise.all(
    entries.map((entry) => client.getTransactionReceipt({ hash: entry.transactionHash })),
  );
  if (
    ledger.chainId !== CHAIN_ID ||
    receipts.length < 30 ||
    receipts.some((receipt) => receipt.status !== 'success')
  )
    fail('PK-06 receipt ledger verification failed.');
  const evidence = {
    schemaVersion: 1,
    gate: 'G5',
    workItem: 'PK-06',
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
      timeoutPool: TIMEOUT,
      gracePool: GRACE,
      successPool: SUCCESS,
      guardPool: GUARD,
    },
    checks: {
      aggregateTimeoutEarlyRejected: true,
      aggregateTimeoutRefundable: true,
      resolutionGraceRefundable: true,
      immutableAdapterSettlement: true,
      receiptLedgerComplete: true,
      nativeBalancesZero: true,
    },
    privacyImpact:
      'No owner plaintext, handle, proof, transfer, payout, or refund value is persisted; only public terminal facts are verified.',
    fundsLocation:
      'All tested pools retain confidential collateral; refundable pools await PK-07 owner refunds.',
    status: 'passed',
  };
  for (const path of EVIDENCE) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`);
  }
  console.log(
    JSON.stringify({
      workItem: 'PK-06',
      status: 'passed',
      verificationBlock: evidence.environment.verificationBlock,
    }),
  );
}
main().catch((error: unknown) => {
  console.error(
    `PK-06 verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
  );
  process.exitCode = 1;
});
