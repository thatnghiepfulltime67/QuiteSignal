import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPublicClient, http, type Abi, type Address, type Hash } from 'viem';
import { sepolia } from 'viem/chains';

const CHAIN_ID = 11_155_111;
const FIXTURE = '0x70221c360c71b902c38d0d621d663dd495900cde' as const;
const WRAPPER = '0x0049a83e3ced7d99ca22bb3fbd546665c43a0217' as const;
const ADAPTER = '0x67add5088910cd38ebfd4cc2b376d6c96f0d075b' as const;
const FACTORY = '0x1e13b9314ccd471bd85bff2393a3489f2ab7a116' as const;
const BELOW_K = '0x494993d6d8eAC81cF278027B3093644f24b727ad' as const;
const THRESHOLD = '0xa39F144cBfCc641D16dF166457F29E68d3480B45' as const;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PROTOCOL = resolve(ROOT, 'modules/protocol');
const ledgerPath = resolve(ROOT, 'evidence/sepolia/spend-ledger.json');
const evidencePaths = [
  resolve(ROOT, 'evidence/offline/G5/PK-05-AGGREGATE.json'),
  resolve(ROOT, 'evidence/sepolia/G5/PK-05-AGGREGATE.json'),
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
  if (!Array.isArray(value.abi)) fail('PK-05 pool ABI is missing.');
  return value as Artifact;
}
function sourceCommit(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
}
async function expectRevert(action: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await action();
  } catch {
    return;
  }
  fail(message);
}
async function main(): Promise<void> {
  const env = resolve(ROOT, '.env');
  if (existsSync(env)) process.loadEnvFile(env);
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) fail('SEPOLIA_RPC_URL is required.');
  const client = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
  });
  if ((await client.getChainId()) !== CHAIN_ID) fail('The configured RPC is not Ethereum Sepolia.');
  const pool = loadArtifact(
    resolve(PROTOCOL, 'artifacts/contracts/core/QuietSignalPool.sol/QuietSignalPool.json'),
  );
  const [below, threshold, codes, nativeBalances] = await Promise.all([
    client.readContract({ address: BELOW_K, abi: pool.abi, functionName: 'epoch' } as never),
    client.readContract({ address: THRESHOLD, abi: pool.abi, functionName: 'epoch' } as never),
    Promise.all(
      [FIXTURE, WRAPPER, ADAPTER, FACTORY, BELOW_K, THRESHOLD].map((address) =>
        client.getCode({ address }),
      ),
    ),
    Promise.all([FACTORY, BELOW_K, THRESHOLD].map((address) => client.getBalance({ address }))),
  ]);
  const belowEpoch = below as {
    state: number;
    participantCount: number;
    aggregateRequestId: Hash;
    publicYes: bigint;
    publicNo: bigint;
  };
  const thresholdEpoch = threshold as {
    state: number;
    participantCount: number;
    aggregateRequestId: Hash;
    publicYes: bigint;
    publicNo: bigint;
  };
  if (
    belowEpoch.state !== 5 ||
    belowEpoch.participantCount !== 1 ||
    belowEpoch.aggregateRequestId !==
      '0x0000000000000000000000000000000000000000000000000000000000000000' ||
    belowEpoch.publicYes !== 0n ||
    belowEpoch.publicNo !== 0n
  )
    fail('The below-k epoch disclosed or transitioned incorrectly.');
  if (
    thresholdEpoch.state !== 3 ||
    thresholdEpoch.participantCount !== 2 ||
    thresholdEpoch.aggregateRequestId ===
      '0x0000000000000000000000000000000000000000000000000000000000000000' ||
    thresholdEpoch.publicYes !== 25n ||
    thresholdEpoch.publicNo !== 15n
  )
    fail('The threshold aggregate result is incorrect.');
  await expectRevert(
    () =>
      client.readContract({
        address: BELOW_K,
        abi: pool.abi,
        functionName: 'aggregateDisclosureHandles',
      } as never),
    'Below-k disclosure handles were available.',
  );
  if (codes.some((code) => !code) || nativeBalances.some((value) => value !== 0n))
    fail('PK-05 binding or native custody verification failed.');
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) as Ledger;
  const entries = ledger.entries.filter((entry) => entry.workItemId === 'PK-05');
  const receipts = await Promise.all(
    entries.map((entry) => client.getTransactionReceipt({ hash: entry.transactionHash })),
  );
  if (
    ledger.chainId !== CHAIN_ID ||
    receipts.length < 24 ||
    receipts.some((receipt) => receipt.status !== 'success')
  )
    fail('PK-05 receipt ledger verification failed.');
  const evidence = {
    schemaVersion: 1,
    gate: 'G5',
    workItem: 'PK-05',
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
      belowKPool: BELOW_K,
      thresholdPool: THRESHOLD,
    },
    checks: {
      belowKNoDisclosure: true,
      belowKRefundable: true,
      thresholdAggregateFinalized: true,
      requestContextPresent: true,
      publicYesNoOnly: true,
      receiptLedgerComplete: true,
      nativeBalancesZero: true,
    },
    privacyImpact:
      'Only proof-verified aggregate YES and NO are recorded; no handle, proof, owner value, or aggregate total is persisted.',
    fundsLocation: 'Both pools retain confidential collateral; PK-06 owns all timeout recovery.',
    status: 'passed',
  };
  for (const path of evidencePaths) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`);
  }
  console.log(
    JSON.stringify({
      workItem: 'PK-05',
      status: 'passed',
      verificationBlock: evidence.environment.verificationBlock,
    }),
  );
}
main().catch((error: unknown) => {
  console.error(
    `PK-05 verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
  );
  process.exitCode = 1;
});
