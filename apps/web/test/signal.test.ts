import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSignalDraft } from '../src/signal.js';

test('T-WEB-03-01: signal values validate without numbers or serialization', () => {
  assert.deepEqual(validateSignalDraft({ stake: '1.25', probability: '7500' }), {
    stakeBaseUnits: 1250000000000000000n,
    probabilityBps: 7500n,
  });
});
test('T-WEB-03-02: unsafe draft values reject before encryption', () => {
  assert.throws(() => validateSignalDraft({ stake: '0', probability: '10001' }));
  assert.throws(() => validateSignalDraft({ stake: '1e2', probability: '50.5' }));
});
