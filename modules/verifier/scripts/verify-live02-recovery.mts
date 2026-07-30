import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseManifest, verifyManifest } from '@quitesignal/verifier';
import {
  createPublicClient,
  http,
  toFunctionSelector,
  zeroHash,
  type Address,
  type Hash,
  type Hex,
} from 'viem';
import { sepolia } from 'viem/chains';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUTPUT_PATH = resolve(ROOT, 'evidence/sepolia/G6/LIVE-02-RECOVERY.json');
const CHAIN_ID = 11_155_111;
const CASES = [
  {
    id: 'below-k',
    manifest: 'evidence/sepolia/G6/LIVE-02-BELOW-K-MANIFEST.json',
    pool: '0x53f14f513519e4247E6443fe042495Ebb1839A6F' as Address,
    participants: 1,
    aggregateRequest: false,
  },
  {
    id: 'timeout',
    manifest: 'evidence/sepolia/G6/LIVE-02-TIMEOUT-MANIFEST.json',
    pool: '0x7C7E4428767520A99B2bfb4f196B5558c64efEC8' as Address,
    participants: 2,
    aggregateRequest: true,
  },
] as const;
const POOL_ABI = [
  {
    type: 'function',
    name: 'config',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'confidentialCollateral', type: 'address' },
          { name: 'resolutionAdapter', type: 'address' },
          { name: 'deadline', type: 'uint64' },
          { name: 'commitTimeout', type: 'uint64' },
          { name: 'kMin', type: 'uint32' },
          { name: 'aggregateTimeout', type: 'uint64' },
          { name: 'resolutionGrace', type: 'uint64' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'epoch',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'state', type: 'uint8' },
          { name: 'winner', type: 'uint8' },
          { name: 'deadline', type: 'uint64' },
          { name: 'participantCount', type: 'uint32' },
          { name: 'aggregateRequestId', type: 'bytes32' },
          { name: 'aggregatePendingAt', type: 'uint64' },
          { name: 'resolutionPendingAt', type: 'uint64' },
          { name: 'publicYes', type: 'uint256' },
          { name: 'publicNo', type: 'uint256' },
          { name: 'settledRoundId', type: 'uint80' },
          { name: 'settledAnswer', type: 'int256' },
        ],
      },
    ],
  },
] as const;
const SELECTOR = {
  close: toFunctionSelector('closeEpoch()'),
  request: toFunctionSelector('requestAggregateDecrypt()'),
  cancel: toFunctionSelector('cancelBeforeResolution()'),
  refund: toFunctionSelector('refund()'),
} as const;

function fail(message: string): never {
  throw new Error(`LIVE-02 recovery verifier failed: ${message}`);
}
function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} is malformed.`);
  return value as Record<string, unknown>;
}
function number(value: unknown, path: string): number {
  if (typeof value !== 'number') fail(`${path} is malformed.`);
  return value;
}
function bigint(value: unknown, path: string): bigint {
  if (typeof value !== 'bigint') fail(`${path} is malformed.`);
  return value;
}
function cleanCommit(): string {
  if (execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim()) {
    fail('commit source changes before generating evidence.');
  }
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
}
function selector(data: Hex): Hex {
  if (data.length < 10) fail('transaction input is too short.');
  return data.slice(0, 10) as Hex;
}

process.loadEnvFile(resolve(ROOT, '.env'));
const rpcUrl = process.env.SEPOLIA_RPC_URL;
const archiveRpcUrl = process.env.SEPOLIA_ARCHIVE_RPC_URL;
if (!rpcUrl || !archiveRpcUrl) fail('SEPOLIA_RPC_URL and SEPOLIA_ARCHIVE_RPC_URL are required.');
const sourceCommit = cleanCommit();
const currentClient = createPublicClient({
  chain: sepolia,
  transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
});
const archiveClient = createPublicClient({
  chain: sepolia,
  transport: http(archiveRpcUrl, { retryCount: 0, timeout: 30_000 }),
});
if (
  (await currentClient.getChainId()) !== CHAIN_ID ||
  (await archiveClient.getChainId()) !== CHAIN_ID
) {
  fail('configured RPC is not Ethereum Sepolia.');
}

const results = [];
for (const scenario of CASES) {
  const rawManifest = JSON.parse(readFileSync(resolve(ROOT, scenario.manifest), 'utf8')) as unknown;
  const manifest = parseManifest(rawManifest);
  const historical = await verifyManifest(archiveClient as never, manifest);
  const [configRaw, epochRaw, transactions] = await Promise.all([
    currentClient.readContract({ address: scenario.pool, abi: POOL_ABI, functionName: 'config' }),
    currentClient.readContract({ address: scenario.pool, abi: POOL_ABI, functionName: 'epoch' }),
    Promise.all(
      manifest.receipts.map(async ({ transactionHash }) =>
        currentClient.getTransaction({ hash: transactionHash }),
      ),
    ),
  ]);
  const config = record(configRaw, `${scenario.id}.config`);
  const epoch = record(epochRaw, `${scenario.id}.epoch`);
  if (
    number(epoch.state, `${scenario.id}.state`) !== 5 ||
    number(epoch.winner, `${scenario.id}.winner`) !== 0 ||
    number(epoch.participantCount, `${scenario.id}.participants`) !== scenario.participants ||
    bigint(epoch.publicYes, `${scenario.id}.publicYes`) !== 0n ||
    bigint(epoch.publicNo, `${scenario.id}.publicNo`) !== 0n
  ) {
    fail(`${scenario.id} did not reach the expected refundable public state.`);
  }
  const selectors = transactions.map((transaction) => ({
    hash: transaction.hash,
    selector: selector(transaction.input),
    blockNumber: transaction.blockNumber,
  }));
  const count = (target: Hex) => selectors.filter((item) => item.selector === target);
  const close = count(SELECTOR.close);
  const request = count(SELECTOR.request);
  const cancel = count(SELECTOR.cancel);
  const refunds = count(SELECTOR.refund);
  if (close.length !== 1 || refunds.length !== scenario.participants) {
    fail(`${scenario.id} terminal selector set is incomplete.`);
  }
  if (scenario.aggregateRequest) {
    if (
      request.length !== 1 ||
      cancel.length !== 1 ||
      String(epoch.aggregateRequestId).toLowerCase() === zeroHash ||
      bigint(epoch.aggregatePendingAt, `${scenario.id}.aggregatePendingAt`) === 0n
    ) {
      fail('timeout recovery selector/state set is incomplete.');
    }
    const cancellationBlock = await currentClient.getBlock({
      blockNumber: cancel[0]!.blockNumber as bigint,
    });
    const eligibleAt =
      bigint(epoch.aggregatePendingAt, 'timeout.aggregatePendingAt') +
      bigint(config.aggregateTimeout, 'timeout.aggregateTimeout');
    if (cancellationBlock.timestamp < eligibleAt)
      fail('timeout cancellation occurred before eligibility.');
  } else if (request.length !== 0 || cancel.length !== 0 || epoch.aggregateRequestId !== zeroHash) {
    fail('below-k must not expose an aggregate request or cancellation.');
  }
  results.push({
    id: scenario.id,
    pool: scenario.pool,
    publicEpoch: {
      state: number(epoch.state, 'state'),
      winner: number(epoch.winner, 'winner'),
      participantCount: number(epoch.participantCount, 'participants'),
      aggregateRequestId: epoch.aggregateRequestId,
      aggregatePendingAt: bigint(epoch.aggregatePendingAt, 'aggregatePendingAt').toString(),
      publicYes: bigint(epoch.publicYes, 'publicYes').toString(),
      publicNo: bigint(epoch.publicNo, 'publicNo').toString(),
    },
    selectorReceipts: {
      close: close.map((item) => item.hash),
      request: request.map((item) => item.hash),
      cancel: cancel.map((item) => item.hash),
      refunds: refunds.map((item) => item.hash),
    },
    historicalVerification: historical,
  });
}
const evidence = {
  schemaVersion: 1,
  workItemId: 'LIVE-02',
  environment: 'sepolia-read',
  status: 'passed',
  sourceCommit,
  verificationBlock: (await currentClient.getBlockNumber()).toString(),
  cases: results,
  checks: {
    historicalManifests: true,
    currentRefundableState: true,
    belowKNoAggregateRequest: true,
    timeoutCancellationAfterEligibility: true,
    ownerScopedTerminalSelectors: true,
  },
};
writeFileSync(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, {
  encoding: 'utf8',
  flag: 'wx',
});
process.stdout.write(
  `${JSON.stringify({ status: 'passed', evidence: 'evidence/sepolia/G6/LIVE-02-RECOVERY.json' })}\n`,
);
