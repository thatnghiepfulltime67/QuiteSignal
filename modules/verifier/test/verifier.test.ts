import assert from 'node:assert/strict';
import test from 'node:test';

import { keccak256, type Address, type Hash, type Hex } from 'viem';

import { parseManifest, type ProtocolManifest } from '../src/manifest.js';
import {
  verifyManifest,
  verifyReleaseManifest,
  type ReleaseReadOnlyClient,
  type ReadOnlyClient,
} from '../src/verify.js';

const FIXTURE = '0x0000000000000000000000000000000000000001' as Address;
const WRAPPER = '0x0000000000000000000000000000000000000002' as Address;
const ADAPTER = '0x0000000000000000000000000000000000000003' as Address;
const POOL = '0x0000000000000000000000000000000000000004' as Address;
const FACTORY = '0x0000000000000000000000000000000000000005' as Address;
const FEED = '0x0000000000000000000000000000000000000006' as Address;
const TX = `0x${'11'.repeat(32)}` as Hash;
const RUNTIME = '0x60006000' as Hex;
const POOL_ID = `0x${'22'.repeat(32)}` as Hash;
const DEPLOYMENT_SALT = `0x${'33'.repeat(32)}` as Hash;

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

test('T-VERIFIER-DEP-01-01: a deployment manifest verifies its initial epoch at the recorded block', async () => {
  const deploymentManifest = parseManifest({
    ...manifest(),
    deployment: { deployedAtBlock: '11383123' },
  });
  let epochBlock: unknown;
  const readClient = client();
  const originalRead = readClient.readContract;
  readClient.readContract = async (parameters: unknown) => {
    if ((parameters as { functionName?: string }).functionName === 'epoch') {
      epochBlock = (parameters as { blockNumber?: bigint }).blockNumber;
    }
    return originalRead(parameters);
  };
  const report = await verifyManifest(readClient, deploymentManifest);
  assert.equal(epochBlock, 11_383_123n);
  assert.equal(report.epochVerificationBlock, '11383123');
});

test('T-VERIFIER-DEP-01-02: malformed deployment epoch blocks fail before an RPC read', () => {
  assert.throws(
    () => parseManifest({ ...manifest(), deployment: { deployedAtBlock: '0' } }),
    /must be positive/,
  );
  assert.throws(
    () => parseManifest({ ...manifest(), deployment: { deployedAtBlock: '11.3' } }),
    /canonical decimal/,
  );
});

test('T-VERIFIER-DEP-02-01: an append-only deployment revision keeps canonical checks', () => {
  const revision = parseManifest({
    ...manifest(),
    deployment: {
      workItemId: 'DEP-02',
      deployedAtBlock: '11383123',
      deployer: FIXTURE,
      configuration: {
        feed: FEED,
        feedRuntimeCodeHash: keccak256(RUNTIME),
        threshold: '200000000000',
        comparison: 'greater-or-equal',
        observationNotBefore: '100',
        maximumFeedAgeSeconds: '86400',
        poolId: `0x${'01'.repeat(32)}`,
        deploymentSalt: `0x${'02'.repeat(32)}`,
      },
    },
  });
  assert.equal(revision.canonicalDeployment?.workItemId, 'DEP-02');
  assert.throws(() =>
    parseManifest({
      ...manifest(),
      deployment: {
        workItemId: 'WEB-08',
        deployedAtBlock: '11383123',
        deployer: FIXTURE,
        configuration: {
          feed: FEED,
          feedRuntimeCodeHash: keccak256(RUNTIME),
          threshold: '200000000000',
          comparison: 'greater-or-equal',
          observationNotBefore: '100',
          maximumFeedAgeSeconds: '86400',
          poolId: `0x${'01'.repeat(32)}`,
          deploymentSalt: `0x${'02'.repeat(32)}`,
        },
      },
    }),
  );
});

function releaseManifest(): ProtocolManifest {
  return parseManifest({
    ...manifest(),
    contracts: [
      ...manifest().contracts,
      { id: 'factory', address: FACTORY, runtimeCodeHash: keccak256(RUNTIME) },
    ],
    deployment: {
      workItemId: 'DEP-01',
      deployedAtBlock: '11383123',
      deployer: FIXTURE,
      configuration: {
        feed: FEED,
        feedRuntimeCodeHash: keccak256(RUNTIME),
        threshold: '200000000000',
        comparison: 'greater-or-equal',
        observationNotBefore: '100',
        maximumFeedAgeSeconds: '1000',
        poolId: POOL_ID,
        deploymentSalt: DEPLOYMENT_SALT,
      },
    },
  });
}

function releaseClient(
  options: {
    unsupportedCollateral?: boolean;
    wrongFactoryPool?: boolean;
    staleFeed?: boolean;
  } = {},
): ReleaseReadOnlyClient {
  const base = client();
  return {
    ...base,
    getBalance: async () => 0n,
    getBlock: async () => ({ timestamp: 1_000n }),
    readContract: async (parameters: unknown) => {
      const name = (parameters as { functionName: string }).functionName;
      if (name === 'config') {
        return {
          confidentialCollateral: WRAPPER,
          resolutionAdapter: ADAPTER,
          deadline: 100n,
          commitTimeout: 60n,
          kMin: 2,
          aggregateTimeout: 600n,
          resolutionGrace: 600n,
        };
      }
      if (name === 'epoch') return base.readContract(parameters);
      if (name === 'poolIdFor') return POOL_ID;
      if (name === 'poolOf') return options.wrongFactoryPool ? FIXTURE : POOL;
      if (name === 'supportsInterface') return !options.unsupportedCollateral;
      if (name === 'target') return FEED;
      if (name === 'targetRuntimeCodeHash') return keccak256(RUNTIME);
      if (name === 'greaterOrEqual') return true;
      if (name === 'threshold') return 200_000_000_000n;
      if (name === 'observationNotBefore') return 100n;
      if (name === 'maximumFeedAge') return 1_000n;
      if (name === 'latestRoundData')
        return [1n, 200_000_000_000n, 1n, options.staleFeed ? 0n : 900n, 1n];
      throw new Error(`Unexpected read: ${name}`);
    },
  };
}

test('T-VERIFIER-VER-01-01: canonical public release facts verify without confidential data', async () => {
  const report = await verifyReleaseManifest(releaseClient(), releaseManifest());
  assert.equal(report.status, 'passed');
  assert.equal(report.checks.factoryPoolBinding, true);
  assert.equal(report.checks.collateralInterface, true);
  assert.equal(report.checks.adapterConfiguration, true);
  assert.equal(report.checks.feedRuntimeAndRound, true);
  assert.equal(report.checks.adapterZeroNativeCustody, true);
});

test('T-VERIFIER-VER-01-02: canonical factory, collateral, and feed mutations reject', async () => {
  await assert.rejects(
    verifyReleaseManifest(releaseClient({ wrongFactoryPool: true }), releaseManifest()),
    /factory pool binding/,
  );
  await assert.rejects(
    verifyReleaseManifest(releaseClient({ unsupportedCollateral: true }), releaseManifest()),
    /does not support/,
  );
  await assert.rejects(
    verifyReleaseManifest(releaseClient({ staleFeed: true }), releaseManifest()),
    /feed latest round/,
  );
});
