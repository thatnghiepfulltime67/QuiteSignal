import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseManifest } from '@quitesignal/verifier';
import { createPublicClient, http, keccak256, type Address, type Hash, type Hex } from 'viem';
import { sepolia } from 'viem/chains';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const LEDGER_PATH = resolve(ROOT, 'evidence/sepolia/spend-ledger.json');
const OUTPUT_PATH = resolve(ROOT, 'evidence/sepolia/G6/LIVE-01-MANIFEST.json');
const CHAIN_ID = 11_155_111;
const CONTRACTS = {
  fixture: '0x0cb082c6ab865de63a60386f090a0d6012544723',
  wrapper: '0x6ab40c7656d161922aa4e95ab8a5b8d1f069c638',
  adapter: '0xd9e07d95f2803df9bea44ee06e538132c3d1e30c',
  factory: '0x0f126d665ca27b78373e9d59339a846386479165',
  pool: '0xc900494624d7A785503104e7f98bb5C54Df950DB',
} as const satisfies Record<string, Address>;
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

function fail(message: string): never {
  throw new Error(`LIVE-01 manifest writer failed: ${message}`);
}
function cleanCommit(): string {
  if (execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim())
    fail('commit source changes before generating evidence.');
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
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

const envPath = resolve(ROOT, '.env');
process.loadEnvFile(envPath);
const rpcUrl = process.env.SEPOLIA_ARCHIVE_RPC_URL ?? process.env.SEPOLIA_RPC_URL;
if (!rpcUrl) fail('SEPOLIA_ARCHIVE_RPC_URL or SEPOLIA_RPC_URL is required.');
const sourceCommit = cleanCommit();
const ledger = record(JSON.parse(readFileSync(LEDGER_PATH, 'utf8')), 'ledger');
if (ledger.chainId !== CHAIN_ID || !Array.isArray(ledger.entries))
  fail('ledger is not Ethereum Sepolia.');
const entries = ledger.entries.filter(
  (entry) => record(entry, 'ledger.entry').workItemId === 'LIVE-01',
);
if (entries.length < 21) fail('LIVE-01 receipt set is incomplete.');
const hashes = entries.map((entry) => {
  const hash = record(entry, 'ledger.entry').transactionHash;
  if (typeof hash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(hash))
    fail('ledger transaction hash is malformed.');
  return hash as Hash;
});
const creationBlock = record(entries[4], 'ledger.poolCreation').blockNumber;
if (typeof creationBlock !== 'string' || !/^[1-9][0-9]*$/.test(creationBlock))
  fail('pool creation block is malformed.');
const client = createPublicClient({
  chain: sepolia,
  transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
});
if ((await client.getChainId()) !== CHAIN_ID) fail('configured RPC is not Ethereum Sepolia.');
const [codes, configRaw, epochRaw, receipts] = await Promise.all([
  Promise.all(
    Object.entries(CONTRACTS).map(
      async ([id, contract]) => [id, await client.getCode({ address: contract })] as const,
    ),
  ),
  client.readContract({ address: CONTRACTS.pool, abi: POOL_ABI, functionName: 'config' }),
  client.readContract({
    address: CONTRACTS.pool,
    abi: POOL_ABI,
    functionName: 'epoch',
    blockNumber: BigInt(creationBlock),
  }),
  Promise.all(hashes.map((hash) => client.getTransactionReceipt({ hash }))),
]);
if (receipts.some((receipt) => receipt.status !== 'success'))
  fail('a LIVE-01 receipt did not succeed.');
const config = record(configRaw, 'pool.config');
const epoch = record(epochRaw, 'pool.initialEpoch');
const manifest = {
  schemaVersion: 1,
  chainId: CHAIN_ID,
  sourceCommit,
  deployment: { workItemId: 'LIVE-01', deployedAtBlock: creationBlock },
  contracts: codes.map(([id, code]) => {
    if (!code || code === '0x') fail(`missing runtime at ${id}.`);
    return {
      id,
      address: CONTRACTS[id as keyof typeof CONTRACTS],
      runtimeCodeHash: keccak256(code as Hex),
    };
  }),
  pools: [
    {
      contractId: 'pool',
      address: CONTRACTS.pool,
      confidentialCollateral: address(
        config.confidentialCollateral,
        'pool.config.confidentialCollateral',
      ),
      resolutionAdapter: address(config.resolutionAdapter, 'pool.config.resolutionAdapter'),
      epoch: {
        state: number(epoch.state, 'epoch.state'),
        winner: number(epoch.winner, 'epoch.winner'),
        participantCount: number(epoch.participantCount, 'epoch.participantCount'),
        publicYes: bigint(epoch.publicYes, 'epoch.publicYes').toString(),
        publicNo: bigint(epoch.publicNo, 'epoch.publicNo').toString(),
        settledRoundId: bigint(epoch.settledRoundId, 'epoch.settledRoundId').toString(),
        settledAnswer: bigint(epoch.settledAnswer, 'epoch.settledAnswer').toString(),
      },
    },
  ],
  receipts: hashes.map((transactionHash) => ({ transactionHash })),
};
parseManifest(manifest);
writeFileSync(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`, {
  encoding: 'utf8',
  flag: 'wx',
});
process.stdout.write(
  `${JSON.stringify({ status: 'passed', manifest: 'evidence/sepolia/G6/LIVE-01-MANIFEST.json', receiptCount: hashes.length })}\n`,
);
