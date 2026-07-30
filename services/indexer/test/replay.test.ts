import assert from 'node:assert/strict';
import test from 'node:test';

import { encodeAbiParameters, toEventSelector, type Hash, type Hex } from 'viem';

import {
  assertCheckpointSafe,
  createCheckpoint,
  mapPublicLifecycleLog,
  replayPublicEvents,
  type ReplayLog,
} from '../src/index.js';

const HASH = `0x${'a'.repeat(64)}` as Hash;
const OTHER_HASH = `0x${'b'.repeat(64)}` as Hash;
const TX = `0x${'c'.repeat(64)}` as Hash;
const REQUEST = `0x${'d'.repeat(64)}` as Hash;
const POOL = `0x${'e'.repeat(40)}` as const;

function log(topics: readonly Hex[], data: Hex, blockNumber: bigint, logIndex: number): ReplayLog {
  return {
    address: POOL,
    blockNumber,
    blockHash: HASH,
    logIndex,
    transactionHash: TX,
    topics,
    data,
  };
}

const opened = log(
  [
    toEventSelector('EpochOpened(bytes32,address,uint64,uint32)'),
    HASH,
    `0x${POOL.slice(2).padStart(64, '0')}` as Hex,
  ],
  encodeAbiParameters([{ type: 'uint64' }, { type: 'uint32' }], [100n, 2]),
  10n,
  0,
);
const closed = log(
  [toEventSelector('EpochClosed(bytes32,uint32)'), HASH],
  encodeAbiParameters([{ type: 'uint32' }], [2]),
  11n,
  0,
);
const requested = log(
  [toEventSelector('AggregateDecryptRequested(bytes32,bytes32)'), HASH, REQUEST],
  '0x',
  12n,
  0,
);
const finalized = log(
  [toEventSelector('AggregateFinalized(bytes32,bytes32,uint256,uint256)'), HASH, REQUEST],
  encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [25n, 15n]),
  13n,
  0,
);
const settled = log(
  [toEventSelector('SettlementFinalized(bytes32,uint8,uint256,uint256,uint80,int256)'), HASH],
  encodeAbiParameters(
    [
      { type: 'uint8' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint80' },
      { type: 'int256' },
    ],
    [1, 40n, 25n, 9n, 200_000_000_000n],
  ),
  14n,
  0,
);

test('T-IDX-01-04: frozen public event logs map into the deterministic reducer', () => {
  const events = [opened, closed, requested, finalized, settled].map((entry) =>
    mapPublicLifecycleLog(entry),
  );
  assert.ok(events.every((event) => event !== null));
  const model = replayPublicEvents(
    events.filter((event): event is NonNullable<typeof event> => event !== null),
  );
  assert.equal(model.phase, 'settled');
  assert.equal(model.publicYes, 25n);
  assert.equal(model.settledRoundId, 9n);
});

test('T-IDX-01-05: unknown logs reject and known owner-specific events are ignored', () => {
  assert.throws(
    () => mapPublicLifecycleLog(log(`0x${'1'.repeat(64)}` as Hex, '0x', 15n, 0)),
    /frozen pool surface/,
  );
  assert.equal(
    mapPublicLifecycleLog(
      log(
        [toEventSelector('SignalCommitted(bytes32,address,bytes32)'), HASH, HASH, HASH],
        '0x',
        15n,
        0,
      ),
    ),
    null,
  );
});

test('T-IDX-01-06: a checkpoint whose hash or manifest binding changed is unsafe for replay', async () => {
  const event = mapPublicLifecycleLog(opened);
  assert.ok(event);
  const checkpoint = createCheckpoint({ manifestHash: HASH, model: replayPublicEvents([event]) });
  const matching = { getBlock: async () => ({ hash: HASH }) };
  const reorged = { getBlock: async () => ({ hash: OTHER_HASH }) };
  assert.equal(await assertCheckpointSafe(matching, checkpoint, HASH), true);
  assert.equal(await assertCheckpointSafe(reorged, checkpoint, HASH), false);
  assert.equal(await assertCheckpointSafe(matching, checkpoint, OTHER_HASH), false);
});
