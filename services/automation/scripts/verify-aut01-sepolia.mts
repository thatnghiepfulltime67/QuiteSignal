import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createPublicClient, http, toFunctionSelector, type Address } from 'viem';
import { sepolia } from 'viem/chains';

const ROOT = resolve(import.meta.dirname, '../../..');
const OUTPUT = resolve(ROOT, 'evidence/sepolia/G6/AUT-01-RELAYER.json');
const POOL = '0x2ee7fa2c3415be873e9b740954affe92dd260a26' as Address;
const ACTIONS = [
  ['close-epoch', '0xaa3804f0996c682df3883340aae74c8699596134a5c5eba0a48701b5249265e7'],
  [
    'request-aggregate-decrypt',
    '0xe738d1c3e5c967b7e6d58edc315738113d406023ac01ab63677656388d3b7e28',
  ],
  ['finalize-aggregate', '0xe4df7de2007f300187ff8aaeb4d68dd9971c3b3f4d465110fcdd04e14394fca9'],
] as const;
const SELECTORS = {
  'close-epoch': toFunctionSelector('closeEpoch()'),
  'request-aggregate-decrypt': toFunctionSelector('requestAggregateDecrypt()'),
  'finalize-aggregate': toFunctionSelector('finalizeAggregate(bytes32,bytes,bytes)'),
} as const;
const POOL_ABI = [
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

function fail(message: string): never {
  throw new Error(`AUT-01 verifier failed: ${message}`);
}
function commit(): string {
  if (execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim())
    fail('commit source changes before generating evidence.');
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
}
function asNumber(value: unknown, name: string): number {
  if (typeof value !== 'number') fail(`${name} is malformed.`);
  return value;
}
function asBigint(value: unknown, name: string): bigint {
  if (typeof value !== 'bigint') fail(`${name} is malformed.`);
  return value;
}

process.loadEnvFile(resolve(ROOT, '.env'));
const rpcUrl = process.env.SEPOLIA_RPC_URL;
if (!rpcUrl) fail('SEPOLIA_RPC_URL is required.');
const sourceCommit = commit();
const client = createPublicClient({
  chain: sepolia,
  transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
});
if ((await client.getChainId()) !== 11_155_111) fail('configured RPC is not Ethereum Sepolia.');
const [epoch, transactions, receipts] = await Promise.all([
  client.readContract({ address: POOL, abi: POOL_ABI, functionName: 'epoch' }),
  Promise.all(ACTIONS.map(([, hash]) => client.getTransaction({ hash }))),
  Promise.all(ACTIONS.map(([, hash]) => client.getTransactionReceipt({ hash }))),
]);
for (const [index, [action]] of ACTIONS.entries()) {
  const transaction = transactions[index]!;
  const receipt = receipts[index]!;
  if (
    transaction.to?.toLowerCase() !== POOL ||
    transaction.input.slice(0, 10).toLowerCase() !== SELECTORS[action].toLowerCase() ||
    receipt.status !== 'success'
  ) {
    fail(`${action} receipt binding is invalid.`);
  }
}
if (
  asNumber(epoch.state, 'epoch.state') !== 3 ||
  asNumber(epoch.participantCount, 'epoch.participantCount') !== 2 ||
  asBigint(epoch.publicYes, 'epoch.publicYes') !== 25n ||
  asBigint(epoch.publicNo, 'epoch.publicNo') !== 15n
) {
  fail('the public aggregate result was not finalized.');
}
const evidence = {
  schemaVersion: 1,
  workItemId: 'AUT-01',
  environment: 'sepolia-read',
  status: 'passed',
  sourceCommit,
  verificationBlock: (await client.getBlockNumber()).toString(),
  pool: POOL,
  actions: ACTIONS.map(([action, transactionHash], index) => ({
    action,
    transactionHash,
    blockNumber: receipts[index]!.blockNumber.toString(),
  })),
  publicEpoch: {
    state: asNumber(epoch.state, 'epoch.state'),
    participantCount: asNumber(epoch.participantCount, 'epoch.participantCount'),
    publicYes: asBigint(epoch.publicYes, 'epoch.publicYes').toString(),
    publicNo: asBigint(epoch.publicNo, 'epoch.publicNo').toString(),
  },
  checks: {
    sepoliaChain: true,
    oneActionPerRun: true,
    frozenFunctionSelectors: true,
    receiptStatuses: true,
    publicAggregateFinalization: true,
  },
};
writeFileSync(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
process.stdout.write(
  `${JSON.stringify({ status: 'passed', evidence: 'evidence/sepolia/G6/AUT-01-RELAYER.json' })}\n`,
);
