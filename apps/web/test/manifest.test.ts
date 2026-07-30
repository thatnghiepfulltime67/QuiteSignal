import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePublicManifest } from '../src/manifest.js';

test('T-WEB-01-01: canonical Sepolia manifest is accepted', () => {
  assert.equal(
    parsePublicManifest({
      schemaVersion: 1,
      chainId: 11155111,
      deployment: { deployedAtBlock: '1' },
      pools: [{ address: '0x0000000000000000000000000000000000000001' }],
    }).chainId,
    11155111,
  );
});

test('T-WEB-01-02: wrong chain and malformed pool reject', () => {
  assert.throws(() =>
    parsePublicManifest({ schemaVersion: 1, chainId: 1, deployment: {}, pools: [] }),
  );
});
