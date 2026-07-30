import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseManifest } from '@quitesignal/verifier';
import { createPublicClient, http, type Address, type Hash, type Hex, type Log } from 'viem';
import { sepolia } from 'viem/chains';

import {
  assertCheckpointSafe,
  manifestFingerprint,
  rebuildManifestBoundReadModel,
  serializeReadModel,
  type ReplayLog,
} from '../src/index.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function repositoryPath(value: string, name: string): string {
  const path = resolve(repositoryRoot, value);
  if (!path.startsWith(`${repositoryRoot}/`)) fail(`${name} must remain inside the repository.`);
  return path;
}

const manifestArgument = argument('manifest') ?? 'deployments/sepolia/quiet-signal.json';
const outputArgument = argument('out') ?? 'evidence/sepolia/G6/IDX-01-READ-MODEL.json';
const manifestPath = repositoryPath(manifestArgument, 'manifest');
const evidencePath = repositoryPath(outputArgument, 'out');

function fail(message: string): never {
  throw new Error(`Sepolia read-model rebuild failed: ${message}`);
}

function cleanSourceCommit(): string {
  try {
    execFileSync('git', ['diff', '--quiet'], { cwd: repositoryRoot, stdio: 'ignore' });
    execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: repositoryRoot, stdio: 'ignore' });
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim();
  } catch {
    fail('commit source changes before generating evidence.');
  }
}

function toReplayLog(log: Log): ReplayLog {
  if (!log.address || !log.blockNumber || !log.topics || log.transactionHash === null) {
    fail('RPC returned an incomplete pool event.');
  }
  return {
    address: log.address as Address,
    blockNumber: log.blockNumber,
    blockHash: log.blockHash as Hash | null,
    logIndex: log.logIndex,
    transactionHash: log.transactionHash as Hash | null,
    topics: log.topics as readonly Hex[],
    data: log.data,
  };
}

const rpcUrl = process.env.SEPOLIA_RPC_URL?.trim();
if (!rpcUrl) fail('SEPOLIA_RPC_URL is required.');
const sourceCommit = cleanSourceCommit();
const rawManifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
const manifest = parseManifest(rawManifest);
const client = createPublicClient({
  chain: sepolia,
  transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
});
const replayClient = {
  getChainId: () => client.getChainId(),
  getCode: ({ address }: { address: Address }) => client.getCode({ address }),
  getTransactionReceipt: ({ hash }: { hash: Hash }) => client.getTransactionReceipt({ hash }),
  readContract: (parameters: unknown) => client.readContract(parameters as never),
  getBlockNumber: () => client.getBlockNumber(),
  getBlock: ({ blockNumber }: { blockNumber: bigint }) => client.getBlock({ blockNumber }),
  getLogs: async ({
    address,
    fromBlock,
    toBlock,
  }: {
    address: Address;
    fromBlock: bigint;
    toBlock: bigint;
  }) => (await client.getLogs({ address, fromBlock, toBlock })).map(toReplayLog),
};
const manifestHash = manifestFingerprint(rawManifest);
const replay = await rebuildManifestBoundReadModel({
  client: replayClient,
  manifest,
  manifestHash,
});
const checkpointSafe = await assertCheckpointSafe(replayClient, replay.checkpoint, manifestHash);
if (!checkpointSafe) fail('the generated checkpoint did not match its finalized block.');
const evidence = {
  schemaVersion: 1,
  workItemId: 'IDX-01',
  environment: 'sepolia-read',
  status: 'passed',
  sourceCommit,
  manifest: {
    path: manifestArgument,
    fingerprint: manifestHash,
    pool: manifest.pools[0]!.address,
    epochVerificationBlock: manifest.epochVerificationBlock?.toString() ?? null,
  },
  finalizedBlock: replay.finalizedBlock.toString(),
  eventCount: replay.events.length,
  eventKinds: replay.events.map((event) => event.kind),
  checkpoint: replay.checkpoint,
  projection: serializeReadModel(replay.model),
  checks: {
    manifestRuntimeAndBinding: true,
    finalizedDepth: true,
    orderedPublicEvents: true,
    checkpointBlockHash: true,
  },
};
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
  encoding: 'utf8',
  flag: 'wx',
});
process.stdout.write(
  `${JSON.stringify({ status: 'passed', evidence: outputArgument, eventCount: replay.events.length })}\n`,
);
