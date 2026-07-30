import assert from 'node:assert/strict';
import test from 'node:test';

import { keccak256, type Address, type Hash, type Hex } from 'viem';

import { parseManifest, type ProtocolManifest } from '../src/manifest.js';
import { verifyManifest, type ReadOnlyClient } from '../src/verify.js';

const FIXTURE = '0x0000000000000000000000000000000000000001' as Address;
const WRAPPER = '0x0000000000000000000000000000000000000002' as Address;
const ADAPTER = '0x0000000000000000000000000000000000000003' as Address;
const POOL = '0x0000000000000000000000000000000000000004' as Address;
const TX = `0x${'11'.repeat(32)}` as Hash;
const RUNTIME = '0x60006000' as Hex;

function manifest(): ProtocolManifest {
  return parseManifest({
    schemaVersion: 1,
    chainId: 11_155_111,
    contracts: [
      { id: 'fixture', address: FIXTURE, runtimeCodeHash: keccak256(RUNTIME) },
      { id: 'wrapper', address: WRAPPER, runtimeCodeHash: keccak256(RUNTIME) },
      { id: 'adapter', address: ADAPTER, runtimeCodeHash: keccak256(RUNTIME) },
      { id: 'pool', address: POOL, runtimeCodeHash: keccak256(RUNTIME) },
    ],
    pools: [
      {
        contractId: 'pool',
        address: POOL,
        confidentialCollateral: WRAPPER,
        resolutionAdapter: ADAPTER,
        epoch: {
          state: 4,
          winner: 1,
          participantCount: 2,
          publicYes: '25',
          publicNo: '15',
          settledRoundId: '7',
          settledAnswer: '123',
        },
      },
    ],
    receipts: [{ transactionHash: TX }],
  });
}

function client(
  options: {
    badRuntime?: boolean;
    missingRuntime?: boolean;
    wrongChain?: boolean;
    wrongConfig?: boolean;
    wrongEpoch?: boolean;
    failedReceipt?: boolean;
  } = {},
): ReadOnlyClient {
  return {
    getChainId: async () => (options.wrongChain ? 1 : 11_155_111),
    getCode: async () => {
      if (options.missingRuntime) return undefined;
      return options.badRuntime ? ('0x6001' as Hex) : RUNTIME;
    },
    getTransactionReceipt: async () => ({ status: options.failedReceipt ? 'reverted' : 'success' }),
    readContract: async (parameters: unknown) => {
      const name = (parameters as { functionName: string }).functionName;
      if (name === 'config') {
        return {
          confidentialCollateral: options.wrongConfig ? FIXTURE : WRAPPER,
          resolutionAdapter: ADAPTER,
        };
      }
      return {
        state: options.wrongEpoch ? 5 : 4,
        winner: 1,
        participantCount: 2,
        publicYes: 25n,
        publicNo: 15n,
        settledRoundId: 7n,
        settledAnswer: 123n,
      };
    },
    getBlockNumber: async () => 123n,
  };
}

test('T-VERIFIER-PK08-01: public-only manifest rejects schema and privacy mutations', () => {
  assert.throws(() => parseManifest({ ...manifest(), chainId: 1 }), /chainId/);
  assert.throws(
    () => parseManifest({ ...manifest(), privateKey: 'not-permitted' }),
    /privateKey is not permitted/,
  );
  assert.throws(
    () =>
      parseManifest({
        ...manifest(),
        contracts: [...manifest().contracts, manifest().contracts[0]],
      }),
    /unique/,
  );
});

test('T-VERIFIER-PK08-02: independent reads accept matching runtime, immutable bindings, epoch, and receipt', async () => {
  const report = await verifyManifest(client(), manifest());
  assert.equal(report.status, 'passed');
  assert.equal(report.verificationBlock, '123');
  assert.equal(report.contractCount, 4);
  assert.equal(report.poolCount, 1);
  assert.equal(report.receiptCount, 1);
});

test('T-VERIFIER-PK08-03: chain, runtime, binding, epoch, and receipt mutations are rejected', async () => {
  await assert.rejects(verifyManifest(client({ wrongChain: true }), manifest()), /chain id/);
  await assert.rejects(
    verifyManifest(client({ missingRuntime: true }), manifest()),
    /Missing runtime/,
  );
  await assert.rejects(
    verifyManifest(client({ badRuntime: true }), manifest()),
    /Runtime code hash mismatch/,
  );
  await assert.rejects(
    verifyManifest(client({ wrongConfig: true }), manifest()),
    /Immutable pool binding mismatch/,
  );
  await assert.rejects(
    verifyManifest(client({ wrongEpoch: true }), manifest()),
    /Public epoch mismatch/,
  );
  await assert.rejects(
    verifyManifest(client({ failedReceipt: true }), manifest()),
    /manifest receipt failed/,
  );
});
