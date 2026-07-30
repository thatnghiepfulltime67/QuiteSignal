import assert from 'node:assert/strict';
import test from 'node:test';

import { toFunctionSelector, type Address, type Hash } from 'viem';

import {
  parseG7BrowserEvidence,
  parseManifest,
  verifyG7BrowserEvidence,
  type G7TransactionObservation,
  type ProtocolManifest,
} from '../src/index.js';

const POOL = '0x0000000000000000000000000000000000000004' as Address;
const COLLATERAL = '0x0000000000000000000000000000000000000002' as Address;
const ADAPTER = '0x0000000000000000000000000000000000000003' as Address;
const FACTORY = '0x0000000000000000000000000000000000000005' as Address;
const FEED = '0x0000000000000000000000000000000000000006' as Address;
const RUNTIME = `0x${'11'.repeat(32)}` as Hash;
const HASHES = [1, 2, 3, 4].map(
  (value) => `0x${value.toString(16).padStart(2, '0').repeat(32)}` as Hash,
);

function manifest(releaseId: string): ProtocolManifest {
  return parseManifest({
    schemaVersion: 1,
    chainId: 11_155_111,
    contracts: [
      { id: 'wrapper', address: COLLATERAL, runtimeCodeHash: RUNTIME },
      { id: 'adapter', address: ADAPTER, runtimeCodeHash: RUNTIME },
      { id: 'pool', address: POOL, runtimeCodeHash: RUNTIME },
      { id: 'factory', address: FACTORY, runtimeCodeHash: RUNTIME },
    ],
    pools: [
      {
        contractId: 'pool',
        address: POOL,
        confidentialCollateral: COLLATERAL,
        resolutionAdapter: ADAPTER,
        epoch: {
          state: 0,
          winner: 0,
          participantCount: 0,
          publicYes: '0',
          publicNo: '0',
          settledRoundId: '0',
          settledAnswer: '0',
        },
      },
    ],
    receipts: [{ transactionHash: RUNTIME }],
    deployment: {
      workItemId: releaseId,
      deployedAtBlock: '1',
      deployer: FACTORY,
      configuration: {
        feed: FEED,
        feedRuntimeCodeHash: RUNTIME,
        threshold: '1',
        comparison: 'greater-or-equal',
        observationNotBefore: '1',
        maximumFeedAgeSeconds: '1',
        poolId: RUNTIME,
        deploymentSalt: `0x${'22'.repeat(32)}`,
      },
    },
  });
}

function evidence(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    workItemId: 'WEB-08',
    mode: 'real-browser-wallet',
    sourceCommit: 'a'.repeat(40),
    chainId: 11_155_111,
    browser: {
      application: 'production Vite build',
      walletProvider: 'external EIP-1193',
      walletApproval: 'explicit extension confirmation',
      unexpectedConsoleOrExceptionEvents: 0,
      persistedTraceOrScreenshot: false,
      capturedConfidentialMaterial: false,
    },
    primary: {
      releaseId: 'DEP-02',
      pool: POOL,
      collateral: COLLATERAL,
      signalIntentTransactionHash: HASHES[0],
      collateralCallbackTransactionHash: HASHES[1],
      finalizationTransactionHash: HASHES[2],
    },
    recovery: {
      releaseId: 'DEP-02',
      pool: POOL,
      kind: 'closeEpoch',
      transactionHash: HASHES[3],
    },
  };
}

function observations(): G7TransactionObservation[] {
  return [
    {
      hash: HASHES[0]!,
      status: 'success',
      to: POOL,
      input: toFunctionSelector('commitSignal(bytes32,bytes,bytes32,bytes)'),
    },
    {
      hash: HASHES[1]!,
      status: 'success',
      to: COLLATERAL,
      input: toFunctionSelector('confidentialTransferAndCall(address,bytes32,bytes,bytes)'),
    },
    {
      hash: HASHES[2]!,
      status: 'success',
      to: POOL,
      input: toFunctionSelector('finalizeCommit(bytes)'),
    },
    {
      hash: HASHES[3]!,
      status: 'success',
      to: POOL,
      input: toFunctionSelector('closeEpoch()'),
    },
  ];
}

test('T-VERIFIER-WEB-08-01: public-only browser evidence binds to release manifests and receipts', () => {
  const parsed = parseG7BrowserEvidence(evidence());
  const report = verifyG7BrowserEvidence(
    parsed,
    { primary: manifest('DEP-02'), recovery: manifest('DEP-02') },
    observations(),
  );
  assert.equal(report.status, 'passed');
  assert.equal(report.receiptCount, 4);
});

test('T-VERIFIER-WEB-08-02: browser evidence rejects sensitive fields and wallet/recovery shortcuts', () => {
  assert.throws(
    () => parseG7BrowserEvidence({ ...evidence(), calldata: 'not-permitted' }),
    /not permitted/,
  );
  assert.throws(
    () =>
      parseG7BrowserEvidence({
        ...evidence(),
        browser: {
          ...(evidence().browser as Record<string, unknown>),
          walletProvider: 'simulated provider',
        },
      }),
    /not permitted/,
  );
  assert.throws(
    () =>
      parseG7BrowserEvidence({
        ...evidence(),
        recovery: {
          ...(evidence().recovery as Record<string, unknown>),
          transactionHash: HASHES[0],
        },
      }),
    /unique/,
  );
  const parsed = parseG7BrowserEvidence(evidence());
  assert.throws(
    () =>
      verifyG7BrowserEvidence(
        parsed,
        { primary: manifest('DEP-02'), recovery: manifest('DEP-02') },
        observations().map((item) =>
          item.hash === HASHES[3] ? { ...item, input: toFunctionSelector('refund()') } : item,
        ),
      ),
    /selector/,
  );
});
