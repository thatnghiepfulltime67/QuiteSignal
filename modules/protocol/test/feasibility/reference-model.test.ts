import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BPS_SCALE,
  calculateExpectation,
  MAX_UINT256,
  REQUIRED_VECTORS,
} from './reference-model.js';

test('T-FND-02-MODEL-01: every required probability boundary is represented', () => {
  const probabilities = new Set(REQUIRED_VECTORS.map((vector) => vector.probabilityBps));

  for (const probability of [0n, 1n, 4_999n, 5_000n, 9_999n, 10_000n, 10_001n, MAX_UINT256]) {
    assert.ok(probabilities.has(probability));
  }
});

test('T-FND-02-MODEL-02: allocation conserves every required stake boundary', () => {
  for (const vector of REQUIRED_VECTORS) {
    const expectation = calculateExpectation(vector);
    assert.equal(expectation.yesAllocation + expectation.noAllocation, vector.stake);
    assert.ok(expectation.clampedProbabilityBps <= BPS_SCALE);
  }
});

test('T-FND-02-MODEL-03: Brier-score endpoints and rounding remain bounded', () => {
  for (const vector of REQUIRED_VECTORS) {
    const expectation = calculateExpectation(vector);
    assert.ok(expectation.scoreBps >= 0n);
    assert.ok(expectation.scoreBps <= BPS_SCALE);
  }

  assert.equal(calculateExpectation(REQUIRED_VECTORS[0]!).scoreBps, BPS_SCALE);
  assert.equal(calculateExpectation(REQUIRED_VECTORS[9]!).scoreBps, 0n);
});
