import assert from 'node:assert/strict';
import test from 'node:test';
import { presentLifecycle } from '../src/lifecycle.js';

test('T-WEB-04-01: every public epoch state has explicit recovery copy', () => {
  for (let state = 0; state <= 5; state += 1) assert.notEqual(presentLifecycle(state).recovery, '');
});
test('T-WEB-04-02: unknown public state never implies success', () => {
  assert.equal(presentLifecycle(99).tone, 'warning');
});
