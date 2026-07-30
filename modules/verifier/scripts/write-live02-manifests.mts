import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseManifest } from '@quitesignal/verifier';
import {
  createPublicClient,
  http,
  keccak256,
  toEventSelector,
  type Address,
  type Hash,
  type Hex,
} from 'viem';
import { sepolia } from 'viem/chains';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const LEDGER_PATH = resolve(ROOT, 'evidence/sepolia/spend-ledger.json');
const OUTPUT_DIRECTORY = resolve(ROOT, 'evidence/sepolia/G6');
const CHAIN_ID = 11_155_111;
const CONTRACTS = {
  fixture: '0x0cb082c6ab865de63a60386f090a0d6012544723',
  wrapper: '0x6ab40c7656d161922aa4e95ab8a5b8d1f069c638',
  adapter: '0x56fcb610959bcd58e0fad3cdad5898654b47942a',
  factory: '0x0f126d665ca27b78373e9d59339a846386479165',
} as const satisfies Record<string, Address>;
const CASES = [
  {
    id: 'below-k',
    pool: '0x53f14f513519e4247E6443fe042495Ebb1839A6F' as Address,
    output: 'LIVE-02-BELOW-K-MANIFEST.json',
    minimumPoolReceipts: 5,
  },
  {
    id: 'timeout',
    pool: '0x7C7E4428767520A99B2bfb4f196B5558c64efEC8' as Address,
    output: 'LIVE-02-TIMEOUT-MANIFEST.json',
    minimumPoolReceipts: 10,
  },
] as const;
const OPENED_TOPIC = toEventSelector('EpochOpened(bytes32,address,uint64,uint32)').toLowerCase();
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

interface LedgerEntry {
  workItemId: string;
  transactionHash: Hash;
}

function fail(message: string): never {
  throw new Error(`LIVE-02 manifest writer failed: ${message}`);
}
function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} is malformed.`);
  return value as Record<string, unknown>;
}
function address(value: unknown, path: string): Address {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{40}$/i.test(value)) fail(`${path} is malformed.`);
  return value as Address;
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

process.loadEnvFile(resolve(ROOT, '.env'));
const rpcUrl = process.env.SEPOLIA_ARCHIVE_RPC_URL ?? process.env.SEPOLIA_RPC_URL;
if (!rpcUrl) fail('SEPOLIA_ARCHIVE_RPC_URL or SEPOLIA_RPC_URL is required.');
const sourceCommit = cleanCommit();
const rawLedger = record(JSON.parse(readFileSync(LEDGER_PATH, 'utf8')), 'ledger');
if (rawLedger.chainId !== CHAIN_ID || !Array.isArray(rawLedger.entries))
  fail('ledger is not Sepolia.');
const entries = rawLedger.entries
  .map((entry, index) => record(entry, `ledger.entries[${index}]`))
  .filter((entry) => entry.workItemId === 'LIVE-02')
  .map((entry): LedgerEntry => {
    if (
      typeof entry.transactionHash !== 'string' ||
      !/^0x[0-9a-f]{64}$/i.test(entry.transactionHash)
    ) {
      fail('LIVE-02 receipt hash is malformed.');
    }
    return { workItemId: 'LIVE-02', transactionHash: entry.transactionHash as Hash };
  });
if (entries.length < 20) fail('LIVE-02 receipt set is incomplete.');
const client = createPublicClient({
  chain: sepolia,
  transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
});
if ((await client.getChainId()) !== CHAIN_ID) fail('configured RPC is not Ethereum Sepolia.');
const receipts = await Promise.all(
  entries.map(async (entry) => ({
    ...entry,
    receipt: await client.getTransactionReceipt({ hash: entry.transactionHash }),
  })),
);
if (receipts.some(({ receipt }) => receipt.status !== 'success')) fail('a LIVE-02 receipt failed.');
const runtimeEntries = await Promise.all(
  Object.entries(CONTRACTS).map(async ([id, contract]) => {
    const code = await client.getCode({ address: contract });
    if (!code || code === '0x') fail(`missing runtime at ${id}.`);
    return [id, { address: contract, runtimeCodeHash: keccak256(code as Hex) }] as const;
  }),
);

for (const scenario of CASES) {
  const pool = scenario.pool.toLowerCase();
  const related = receipts.filter(
    ({ receipt }) =>
      receipt.to?.toLowerCase() === pool ||
      receipt.logs.some((log) => log.address.toLowerCase() === pool),
  );
  const opening = related.find(({ receipt }) =>
    receipt.logs.some(
      (log) => log.address.toLowerCase() === pool && log.topics[0]?.toLowerCase() === OPENED_TOPIC,
    ),
  );
  if (!opening || related.length < scenario.minimumPoolReceipts) {
    fail(`${scenario.id} receipts do not contain the required public lifecycle.`);
  }
  const [configRaw, epochRaw, code] = await Promise.all([
    client.readContract({ address: scenario.pool, abi: POOL_ABI, functionName: 'config' }),
    client.readContract({
      address: scenario.pool,
      abi: POOL_ABI,
      functionName: 'epoch',
      blockNumber: opening.receipt.blockNumber,
    }),
    client.getCode({ address: scenario.pool }),
  ]);
  if (!code || code === '0x') fail(`missing runtime at ${scenario.id} pool.`);
  const config = record(configRaw, `${scenario.id}.config`);
  const epoch = record(epochRaw, `${scenario.id}.initialEpoch`);
  if (
    number(epoch.state, 'initial.state') !== 0 ||
    number(epoch.participantCount, 'initial.participantCount') !== 0
  ) {
    fail(`${scenario.id} was not open at creation.`);
  }
  const manifest = {
    schemaVersion: 1,
    chainId: CHAIN_ID,
    sourceCommit,
    deployment: { workItemId: 'LIVE-02', deployedAtBlock: opening.receipt.blockNumber.toString() },
    contracts: [
      ...runtimeEntries.map(([id, binding]) => ({ id, ...binding })),
      { id: 'pool', address: scenario.pool, runtimeCodeHash: keccak256(code as Hex) },
    ],
    pools: [
      {
        contractId: 'pool',
        address: scenario.pool,
        confidentialCollateral: address(config.confidentialCollateral, `${scenario.id}.collateral`),
        resolutionAdapter: address(config.resolutionAdapter, `${scenario.id}.adapter`),
        epoch: {
          state: number(epoch.state, 'initial.state'),
          winner: number(epoch.winner, 'initial.winner'),
          participantCount: number(epoch.participantCount, 'initial.participantCount'),
          publicYes: bigint(epoch.publicYes, 'initial.publicYes').toString(),
          publicNo: bigint(epoch.publicNo, 'initial.publicNo').toString(),
          settledRoundId: bigint(epoch.settledRoundId, 'initial.settledRoundId').toString(),
          settledAnswer: bigint(epoch.settledAnswer, 'initial.settledAnswer').toString(),
        },
      },
    ],
    receipts: related.map(({ transactionHash }) => ({ transactionHash })),
  };
  parseManifest(manifest);
  writeFileSync(
    resolve(OUTPUT_DIRECTORY, scenario.output),
    `${JSON.stringify(manifest, null, 2)}\n`,
    {
      encoding: 'utf8',
      flag: 'wx',
    },
  );
}
process.stdout.write(
  `${JSON.stringify({ status: 'passed', manifests: CASES.map((scenario) => scenario.output) })}\n`,
);
