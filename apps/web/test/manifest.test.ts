import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePublicManifest } from '../src/manifest.js';

test('T-WEB-01-01: canonical Sepolia manifest is accepted', () => {
  assert.equal(
    parsePublicManifest({
      schemaVersion: 1,
      chainId: 11155111,
      deployment: {
        deployedAtBlock: '1',
        configuration: {
          threshold: '200000000000',
          comparison: 'greater-or-equal',
          observationNotBefore: '1',
        },
      },
      contracts: [
        { id: 'fixture', address: '0x0000000000000000000000000000000000000003' },
        { id: 'wrapper', address: '0x0000000000000000000000000000000000000002' },
      ],
      pools: [
        {
          address: '0x0000000000000000000000000000000000000001',
          confidentialCollateral: '0x0000000000000000000000000000000000000002',
        },
      ],
    }).chainId,
    11155111,
  );
});

test('T-WEB-01-02: wrong chain and malformed pool/collateral reject', () => {
  assert.throws(() =>
    parsePublicManifest({ schemaVersion: 1, chainId: 1, deployment: {}, pools: [] }),
  );
  assert.throws(() =>
    parsePublicManifest({
      schemaVersion: 1,
      chainId: 11155111,
      deployment: { deployedAtBlock: '1', configuration: {} },
      contracts: [],
      pools: [{ address: '0x0000000000000000000000000000000000000001' }],
    }),
  );
});
