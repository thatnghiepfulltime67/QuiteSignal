import { type ProtocolManifest, verifyManifest } from '@quitesignal/verifier';
import {
  decodeEventLog,
  keccak256,
  stringToHex,
  toEventSelector,
  type Address,
  type Hash,
  type Hex,
} from 'viem';

import {
  createCheckpoint,
  reducePublicEvent,
  type PublicLifecycleEvent,
  type PublicReadModel,
  type ReadModelCheckpoint,
} from './reducer.js';

export const SEPOLIA_CHAIN_ID = 11_155_111;
export const FINALITY_BLOCKS = 4n;

const PUBLIC_EVENT_ABI = [
  {
    type: 'event',
    name: 'EpochOpened',
    inputs: [
      { indexed: true, name: 'epochId', type: 'bytes32' },
      { indexed: true, name: 'pool', type: 'address' },
      { indexed: false, name: 'deadline', type: 'uint64' },
      { indexed: false, name: 'kMin', type: 'uint32' },
    ],
  },
  {
    type: 'event',
    name: 'EpochClosed',
    inputs: [
      { indexed: true, name: 'epochId', type: 'bytes32' },
      { indexed: false, name: 'participantCount', type: 'uint32' },
    ],
  },
  {
    type: 'event',
    name: 'AggregateDecryptRequested',
    inputs: [
      { indexed: true, name: 'epochId', type: 'bytes32' },
      { indexed: true, name: 'requestId', type: 'bytes32' },
    ],
  },
  {
    type: 'event',
    name: 'AggregateFinalized',
    inputs: [
      { indexed: true, name: 'epochId', type: 'bytes32' },
      { indexed: true, name: 'requestId', type: 'bytes32' },
      { indexed: false, name: 'publicYes', type: 'uint256' },
      { indexed: false, name: 'publicNo', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'SettlementFinalized',
    inputs: [
      { indexed: true, name: 'epochId', type: 'bytes32' },
      { indexed: false, name: 'winner', type: 'uint8' },
      { indexed: false, name: 'aggregateCollateral', type: 'uint256' },
      { indexed: false, name: 'winningAggregate', type: 'uint256' },
      { indexed: false, name: 'roundId', type: 'uint80' },
      { indexed: false, name: 'answer', type: 'int256' },
    ],
  },
  {
    type: 'event',
    name: 'Refunded',
    inputs: [
      { indexed: true, name: 'epochId', type: 'bytes32' },
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: false, name: 'refundId', type: 'bytes32' },
    ],
  },
] as const;

const PUBLIC_EVENT_TOPICS = new Set<string>([
  toEventSelector('EpochOpened(bytes32,address,uint64,uint32)'),
  toEventSelector('EpochClosed(bytes32,uint32)'),
  toEventSelector('AggregateDecryptRequested(bytes32,bytes32)'),
  toEventSelector('AggregateFinalized(bytes32,bytes32,uint256,uint256)'),
  toEventSelector('SettlementFinalized(bytes32,uint8,uint256,uint256,uint80,int256)'),
  toEventSelector('Refunded(bytes32,address,bytes32)'),
]);

const IGNORED_EVENT_TOPICS = new Set<string>([
  toEventSelector('SignalIntentRegistered(bytes32,address,uint64)'),
  toEventSelector('SignalIntentCleared(bytes32,address,bool)'),
  toEventSelector('SignalCommitted(bytes32,address,bytes32)'),
  toEventSelector('ScoreMaterialized(bytes32,address)'),
  toEventSelector('PayoutClaimed(bytes32,address,bytes32)'),
]);

export interface ReplayLog {
  address: Address;
  blockNumber: bigint;
  blockHash: Hash | null;
  logIndex: number | null;
  transactionHash: Hash | null;
  topics: readonly Hex[];
  data: Hex;
}

export interface ReplayClient {
  getChainId(): Promise<number>;
  getCode(parameters: { address: Address }): Promise<Hex | undefined>;
  getTransactionReceipt(parameters: { hash: Hash }): Promise<{ status: string }>;
  readContract(parameters: unknown): Promise<unknown>;
  getBlockNumber(): Promise<bigint>;
  getBlock(parameters: { blockNumber: bigint }): Promise<{ hash: Hash | null }>;
  getLogs(parameters: {
    address: Address;
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<ReplayLog[]>;
}

export interface FinalizedReplay {
  finalizedBlock: bigint;
  manifestHash: Hash;
  events: PublicLifecycleEvent[];
  model: PublicReadModel;
  checkpoint: ReadModelCheckpoint;
}

function fail(message: string): never {
  throw new Error(`Read model replay failed: ${message}`);
}

function eventCursor(log: ReplayLog) {
  if (!log.blockHash || !log.transactionHash || log.logIndex === null || log.logIndex < 0) {
    fail('a finalized log has an incomplete cursor.');
  }
  return {
    blockNumber: log.blockNumber,
    blockHash: log.blockHash,
    logIndex: log.logIndex,
    transactionHash: log.transactionHash,
  };
}

function eventArgs(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('event arguments are malformed.');
  return value as Record<string, unknown>;
}

function bigint(value: unknown, path: string): bigint {
  if (typeof value !== 'bigint') fail(`${path} is malformed.`);
  return value;
}

function number(value: unknown, path: string): number {
  if (typeof value !== 'number') fail(`${path} is malformed.`);
  return value;
}

function hash(value: unknown, path: string): Hash {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/i.test(value)) fail(`${path} is malformed.`);
  return value as Hash;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function manifestFingerprint(value: unknown): Hash {
  return keccak256(stringToHex(canonicalJson(value)));
}

export function mapPublicLifecycleLog(log: ReplayLog): PublicLifecycleEvent | null {
  const topic = log.topics[0];
  if (!topic) fail('event topic is missing.');
  if (IGNORED_EVENT_TOPICS.has(topic)) return null;
  if (!PUBLIC_EVENT_TOPICS.has(topic)) fail('event topic is not in the frozen pool surface.');
  const decoded = decodeEventLog({ abi: PUBLIC_EVENT_ABI, data: log.data, topics: log.topics });
  const args = eventArgs(decoded.args);
  const cursor = eventCursor(log);
  switch (decoded.eventName) {
    case 'EpochOpened':
      return {
        ...cursor,
        kind: 'epoch-opened',
        deadline: bigint(args.deadline, 'EpochOpened.deadline'),
        minimumParticipants: number(args.kMin, 'EpochOpened.kMin'),
      };
    case 'EpochClosed':
      return {
        ...cursor,
        kind: 'epoch-closed',
        participantCount: number(args.participantCount, 'EpochClosed.participantCount'),
      };
    case 'AggregateDecryptRequested':
      return {
        ...cursor,
        kind: 'aggregate-requested',
        requestId: hash(args.requestId, 'AggregateDecryptRequested.requestId'),
      };
    case 'AggregateFinalized':
      return {
        ...cursor,
        kind: 'aggregate-finalized',
        requestId: hash(args.requestId, 'AggregateFinalized.requestId'),
        publicYes: bigint(args.publicYes, 'AggregateFinalized.publicYes'),
        publicNo: bigint(args.publicNo, 'AggregateFinalized.publicNo'),
      };
    case 'Refunded':
      return { ...cursor, kind: 'refunded' };
    case 'SettlementFinalized':
      return {
        ...cursor,
        kind: 'settlement-finalized',
        winner: number(args.winner, 'SettlementFinalized.winner') as 1 | 2,
        roundId: bigint(args.roundId, 'SettlementFinalized.roundId'),
        answer: bigint(args.answer, 'SettlementFinalized.answer'),
      };
  }
}

function ordered(logs: ReplayLog[]): ReplayLog[] {
  return [...logs].sort((left, right) => {
    if (left.blockNumber !== right.blockNumber)
      return left.blockNumber < right.blockNumber ? -1 : 1;
    return (left.logIndex ?? -1) - (right.logIndex ?? -1);
  });
}

export async function assertCheckpointSafe(
  client: Pick<ReplayClient, 'getBlock'>,
  checkpoint: ReadModelCheckpoint,
  manifestHash: Hash,
): Promise<boolean> {
  if (
    checkpoint.chainId !== SEPOLIA_CHAIN_ID ||
    checkpoint.manifestHash.toLowerCase() !== manifestHash.toLowerCase()
  )
    return false;
  const block = await client.getBlock({ blockNumber: BigInt(checkpoint.blockNumber) });
  return block.hash?.toLowerCase() === checkpoint.blockHash.toLowerCase();
}

export async function loadFinalizedPublicEvents(input: {
  client: ReplayClient;
  manifest: ProtocolManifest;
  manifestHash: Hash;
}): Promise<{ finalizedBlock: bigint; events: PublicLifecycleEvent[] }> {
  if (input.manifest.chainId !== SEPOLIA_CHAIN_ID) fail('manifest is not Ethereum Sepolia.');
  if (input.manifest.pools.length !== 1) fail('the MVP replay requires exactly one manifest pool.');
  await verifyManifest(input.client, input.manifest);
  const head = await input.client.getBlockNumber();
  if (head <= FINALITY_BLOCKS) fail('chain head does not have the required finality depth.');
  const finalizedBlock = head - FINALITY_BLOCKS;
  const fromBlock = input.manifest.epochVerificationBlock;
  if (!fromBlock || fromBlock > finalizedBlock) fail('manifest epoch block is not finalized.');
  const logs = ordered(
    await input.client.getLogs({
      address: input.manifest.pools[0]!.address,
      fromBlock,
      toBlock: finalizedBlock,
    }),
  );
  return {
    finalizedBlock,
    events: logs
      .map(mapPublicLifecycleLog)
      .filter((event): event is PublicLifecycleEvent => event !== null),
  };
}

export async function rebuildManifestBoundReadModel(input: {
  client: ReplayClient;
  manifest: ProtocolManifest;
  manifestHash: Hash;
}): Promise<FinalizedReplay> {
  const loaded = await loadFinalizedPublicEvents(input);
  if (loaded.events.length === 0) fail('no public lifecycle events were found.');
  const model = loaded.events.reduce(reducePublicEvent, {
    phase: 'open',
    deadline: 0n,
    minimumParticipants: 0,
    participantCount: 0,
    aggregateRequestId: null,
    publicYes: 0n,
    publicNo: 0n,
    winner: 0,
    settledRoundId: 0n,
    settledAnswer: 0n,
    cursor: null,
  });
  return {
    finalizedBlock: loaded.finalizedBlock,
    manifestHash: input.manifestHash,
    events: loaded.events,
    model,
    checkpoint: createCheckpoint({ manifestHash: input.manifestHash, model }),
  };
}
