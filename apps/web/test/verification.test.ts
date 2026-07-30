import assert from 'node:assert/strict';
import test from 'node:test';
import { presentVerification } from '../src/verification.js';
const manifest = {
  chainId: 11155111 as const,
  poolAddress: '0x0000000000000000000000000000000000000001',
  collateralAddress: '0x0000000000000000000000000000000000000002',
  faucetAddress: '0x0000000000000000000000000000000000000003',
  deployedAtBlock: '1',
  threshold: '200000000000',
  comparison: 'greater-or-equal' as const,
  observationNotBefore: '1',
};
test('T-WEB-06-01: canonical pool verifies', () =>
  assert.equal(presentVerification(manifest, manifest.poolAddress).manifest, 'canonical'));
test('T-WEB-06-02: unrelated pool fails closed', () =>
  assert.throws(() => presentVerification(manifest, '0x0000000000000000000000000000000000000002')));
