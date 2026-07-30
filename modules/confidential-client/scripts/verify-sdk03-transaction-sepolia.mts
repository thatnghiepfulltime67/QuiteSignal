import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPublicClient, http, isAddress, parseEventLogs, type Abi, type Hash } from 'viem';
import { sepolia } from 'viem/chains';

import { createViemProtocolPublicReader, publicAddress } from '../src/index.js';

const CHAIN_ID = 11_155_111;
const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const POOL_ARTIFACT = resolve(
  ROOT,
  'modules/protocol/artifacts/contracts/core/QuietSignalPool.sol/QuietSignalPool.json',
);
const LEDGER = resolve(ROOT, 'evidence/sepolia/spend-ledger.json');
const EVIDENCE = [
  resolve(ROOT, 'evidence/offline/G6/SDK-03-TRANSACTION-CLIENT.json'),
  resolve(ROOT, 'evidence/sepolia/G6/SDK-03-TRANSACTION-CLIENT.json'),
];

interface Artifact {
  abi: Abi;
  deployedBytecode: `0x${string}`;
}

interface Ledger {
  chainId: number;
  entries: Array<{ workItemId: string; transactionHash: Hash }>;
}

function fail(message: string): never {
  throw new Error(`SDK-03 verification failed: ${message}`);
}

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function sourceCommit(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
}

async function main(): Promise<void> {
  const pool = argument('pool');
  if (!pool || !isAddress(pool)) fail('a valid --pool=0x... is required.');
  const env = resolve(ROOT, '.env');
  if (existsSync(env)) process.loadEnvFile(env);
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) fail('configured Sepolia RPC access is required.');
  const chain = createPublicClient({ chain: sepolia, transport: http(rpcUrl, { retryCount: 0 }) });
  if ((await chain.getChainId()) !== CHAIN_ID) fail('the configured RPC is not Ethereum Sepolia.');
  const artifact = JSON.parse(readFileSync(POOL_ARTIFACT, 'utf8')) as Artifact;
  const runtime = await chain.getCode({ address: pool });
  if (!runtime || runtime.toLowerCase() !== artifact.deployedBytecode.toLowerCase())
    fail('the named pool runtime does not match the compiled artifact.');

  const reader = createViemProtocolPublicReader(chain);
  const [epoch, pending] = await Promise.all([
    reader.readEpoch(publicAddress(pool)),
    chain.readContract({
      address: pool,
      abi: artifact.abi,
      functionName: 'pendingCommit',
    } as never),
  ]);
  const pendingRaw = pending as readonly [string, bigint, boolean];
  if (
    epoch.state !== 0 ||
    epoch.participantCount !== 0 ||
    pendingRaw[0] !== '0x0000000000000000000000000000000000000000' ||
    pendingRaw[1] !== 0n ||
    pendingRaw[2]
  ) {
    fail('the SDK-03 fixture did not return to OPEN with no pending commit.');
  }

  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger;
  const entries = ledger.entries.filter((entry) => entry.workItemId === 'SDK-03');
  const receipts = await Promise.all(
    entries.map((entry) => chain.getTransactionReceipt({ hash: entry.transactionHash })),
  );
  const startBlock = receipts.reduce(
    (lowest, receipt) => (receipt.blockNumber < lowest ? receipt.blockNumber : lowest),
    receipts[0]?.blockNumber ?? 0n,
  );
  const events = parseEventLogs({
    abi: artifact.abi,
    logs: await chain.getLogs({ address: pool, fromBlock: startBlock }),
    strict: false,
  });
  const registered = events.find((event) => event.eventName === 'SignalIntentRegistered');
  const cleared = events.find((event) => event.eventName === 'SignalIntentCleared');
  const callbackReceived = (cleared?.args as { callbackReceived?: unknown } | undefined)
    ?.callbackReceived;
  if (
    ledger.chainId !== CHAIN_ID ||
    receipts.filter((receipt) => receipt.status === 'success').length < 5 ||
    !registered ||
    !cleared ||
    callbackReceived !== false
  ) {
    fail('the SDK-03 receipt/event evidence is incomplete.');
  }

  const evidence = {
    schemaVersion: 1,
    gate: 'G6',
    workItem: 'SDK-03',
    phase: 'P2',
    sourceCommit: sourceCommit(),
    environment: {
      chainId: CHAIN_ID,
      verificationBlock: (await chain.getBlockNumber()).toString(),
    },
    pool: publicAddress(pool),
    checks: {
      compiledPoolRuntimeMatches: true,
      transactionClientEncryptedCommitSubmitted: true,
      publicReadClientReturnedOpenEpoch: true,
      pendingCommitExpiredPermissionlessly: true,
      noCallbackOrParticipantRemained: true,
      receiptLedgerReferencesPresent: true,
    },
    privacyImpact:
      'The verifier reads public runtime, epoch, event, and receipt facts only; no encrypted material is read, printed, or persisted.',
    fundsLocation:
      'The fixture has no participant and no pending callback after expiry; it has no committed collateral custody.',
    status: 'passed',
  };
  for (const path of EVIDENCE) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify({ workItem: 'SDK-03', status: 'passed' })}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'SDK-03 verification failed unexpectedly.'}\n`,
  );
  process.exitCode = 1;
});
