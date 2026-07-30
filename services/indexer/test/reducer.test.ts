import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createCheckpoint, replayPublicEvents, type PublicLifecycleEvent } from '../src/index.js';

const HASH = `0x${'a'.repeat(64)}` as const;
const TX = `0x${'b'.repeat(64)}` as const;
const REQUEST = `0x${'c'.repeat(64)}` as const;
const events: PublicLifecycleEvent[] = [
  {
    kind: 'epoch-opened',
    blockNumber: 10n,
    blockHash: HASH,
    logIndex: 0,
    transactionHash: TX,
    deadline: 100n,
    minimumParticipants: 2,
  },
  {
    kind: 'epoch-closed',
    blockNumber: 11n,
    blockHash: HASH,
    logIndex: 0,
    transactionHash: TX,
    participantCount: 2,
  },
  {
    kind: 'aggregate-requested',
    blockNumber: 12n,
    blockHash: HASH,
    logIndex: 0,
    transactionHash: TX,
    requestId: REQUEST,
  },
  {
    kind: 'aggregate-finalized',
    blockNumber: 13n,
    blockHash: HASH,
    logIndex: 0,
    transactionHash: TX,
    requestId: REQUEST,
    publicYes: 25n,
    publicNo: 15n,
  },
  {
    kind: 'settlement-finalized',
    blockNumber: 14n,
    blockHash: HASH,
    logIndex: 0,
    transactionHash: TX,
    winner: 1,
    roundId: 9n,
    answer: 200_000_000_000n,
  },
];

test('T-IDX-01-01: ordered public events deterministically replay into one lifecycle projection', () => {
  const first = replayPublicEvents(events);
  const rebuilt = replayPublicEvents(events.slice());
  assert.deepEqual(first, replayPublicEvents(events));
  assert.deepEqual(first, rebuilt);
  assert.equal(first.phase, 'settled');
  assert.equal(first.publicYes, 25n);
  assert.equal(first.publicNo, 15n);
  assert.deepEqual(createCheckpoint({ manifestHash: HASH, model: first }), {
    schemaVersion: 1,
    reducerVersion: 1,
    chainId: 11_155_111,
    manifestHash: HASH,
    blockNumber: '14',
    blockHash: HASH,
    model: {
      phase: 'settled',
      deadline: '100',
      minimumParticipants: 2,
      participantCount: 2,
      aggregateRequestId: REQUEST,
      publicYes: '25',
      publicNo: '15',
      winner: 1,
      settledRoundId: '9',
      settledAnswer: '200000000000',
    },
  });
});

test('T-IDX-01-02: duplicate, out-of-order, and invalid transitions reject instead of mutating a cache', () => {
  assert.throws(() => replayPublicEvents([events[0]!, events[0]!]), /strictly ordered/);
  assert.throws(() => replayPublicEvents([events[1]!]), /epoch close/);
  assert.throws(
    () => replayPublicEvents([events[0]!, { ...events[1]!, blockNumber: 9n }]),
    /strictly ordered/,
  );
});

test('T-IDX-01-03: reducer source has no confidential or owner-terminal schema', () => {
  const source = readFileSync(new URL('../src/reducer.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(stake|probability|position|payout|score|handle|proof)\b/i);
  assert.doesNotMatch(source, /\bowner\b/i);
  assert.doesNotMatch(source, /\b(claim|materializeScore|wrap|approve|transfer)\b/);
});

test('T-IDX-01-07: a public terminal event proves the refundable recovery state', () => {
  const refund = {
    kind: 'refunded' as const,
    blockNumber: 15n,
    blockHash: HASH,
    logIndex: 0,
    transactionHash: TX,
  };
  const model = replayPublicEvents([...events.slice(0, 3), refund]);
  assert.equal(model.phase, 'refundable');
  assert.equal(model.participantCount, 2);
});
