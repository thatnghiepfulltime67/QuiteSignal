import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIVE_WORK_ITEM,
  LIVE_RECOVERY_WORK_ITEM,
  AUTOMATION_WORK_ITEM,
  isLifecycleWorkItem,
  lifecyclePhase,
  poolCases,
  poolSalt,
  usesAggregateLifecycle,
} from '../../src/live-runner-policy.js';

test('T-LIVE-01-01: the live runner is an explicit P2 mode with one fresh threshold case', () => {
  assert.equal(isLifecycleWorkItem(LIVE_WORK_ITEM), true);
  assert.equal(lifecyclePhase(LIVE_WORK_ITEM), 'P2');
  assert.deepEqual(poolCases(LIVE_WORK_ITEM), ['threshold']);
  assert.equal(usesAggregateLifecycle(LIVE_WORK_ITEM), true);
});

test('T-LIVE-02-01: the recovery runner has separate P2 salts for below-k and timeout', () => {
  assert.equal(isLifecycleWorkItem(LIVE_RECOVERY_WORK_ITEM), true);
  assert.equal(lifecyclePhase(LIVE_RECOVERY_WORK_ITEM), 'P2');
  assert.deepEqual(poolCases(LIVE_RECOVERY_WORK_ITEM), ['below-k', 'timeout']);
  assert.equal(usesAggregateLifecycle(LIVE_RECOVERY_WORK_ITEM), false);
  assert.notEqual(
    poolSalt(LIVE_RECOVERY_WORK_ITEM, 'below-k'),
    poolSalt(LIVE_RECOVERY_WORK_ITEM, 'timeout'),
  );
});

test('T-LIVE-01-02: the live pool salt is stable and rejects a recovery-only case', () => {
  assert.equal(poolSalt(LIVE_WORK_ITEM, 'threshold'), poolSalt(LIVE_WORK_ITEM, 'threshold'));
  assert.throws(() => poolSalt(LIVE_WORK_ITEM, 'below-k'), /not allowed/);
});

test('T-AUT-FIXTURE-01: automation receives one isolated P2 threshold fixture', () => {
  assert.equal(isLifecycleWorkItem(AUTOMATION_WORK_ITEM), true);
  assert.equal(lifecyclePhase(AUTOMATION_WORK_ITEM), 'P2');
  assert.deepEqual(poolCases(AUTOMATION_WORK_ITEM), ['threshold']);
  assert.equal(usesAggregateLifecycle(AUTOMATION_WORK_ITEM), true);
  assert.notEqual(
    poolSalt(AUTOMATION_WORK_ITEM, 'threshold'),
    poolSalt(LIVE_WORK_ITEM, 'threshold'),
  );
});
