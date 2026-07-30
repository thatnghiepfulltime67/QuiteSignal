import assert from 'node:assert/strict';
import test from 'node:test';
import { presentMarket } from '../src/market.js';

test('T-WEB-02-01: market copy is bound to the canonical public manifest', () => {
  const view = presentMarket({
    chainId: 11155111,
    poolAddress: '0x0000000000000000000000000000000000000001',
    deployedAtBlock: '1',
  });
  assert.equal(view.chainLabel, 'Ethereum Sepolia');
  assert.match(view.privateNotice, /encrypted/);
});

test('T-WEB-02-02: onboarding does not claim anonymity', () => {
  const copy = Object.values(
    presentMarket({
      chainId: 11155111,
      poolAddress: '0x0000000000000000000000000000000000000001',
      deployedAtBlock: '1',
    }),
  )
    .join(' ')
    .toLowerCase();
  assert.doesNotMatch(copy, /anonymous|untraceable|sybil resistance/);
});
