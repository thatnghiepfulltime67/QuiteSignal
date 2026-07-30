import assert from 'node:assert/strict';
import test from 'node:test';

import { getCreate2Address, keccak256, type Abi, type Hex } from 'viem';

import {
  CANONICAL_COMMIT_WINDOW_SECONDS,
  CANONICAL_OBSERVATION_LEAD_SECONDS,
  SEPOLIA_CHAIN_ID,
  buildCanonicalDeploymentPlan,
  type DeploymentArtifacts,
} from '../../src/deployment-plan.js';

const EMPTY_CONSTRUCTOR_ABI = [
  { type: 'constructor', inputs: [], stateMutability: 'nonpayable' },
] as const satisfies Abi;
const WRAPPER_ABI = [
  {
    type: 'constructor',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'underlying', type: 'address' }],
  },
] as const satisfies Abi;
const ADAPTER_ABI = [
  {
    type: 'constructor',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'feed', type: 'address' },
      { name: 'greaterOrEqual', type: 'bool' },
      { name: 'threshold', type: 'int256' },
      { name: 'observationNotBefore', type: 'uint64' },
      { name: 'maximumFeedAge', type: 'uint64' },
    ],
  },
] as const satisfies Abi;
const POOL_ABI = [
  {
    type: 'constructor',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'poolId_', type: 'bytes32' },
      {
        name: 'config_',
        type: 'tuple',
        components: [
          { name: 'confidentialCollateral', type: 'address' },
          { name: 'resolutionAdapter', type: 'address' },
          { name: 'deadline', type: 'uint64' },
          { name: 'commitTimeout', type: 'uint64' },
          { name: 'kMin', type: 'uint32' },
          { name: 'aggregateTimeout', type: 'uint64' },
          { name: 'resolutionGrace', type: 'uint64' },
        ],
      },
    ],
  },
] as const satisfies Abi;
const BYTECODE = '0x60006000' as Hex;
const ARTIFACTS: DeploymentArtifacts = {
  fixture: { abi: EMPTY_CONSTRUCTOR_ABI, bytecode: BYTECODE },
  wrapper: { abi: WRAPPER_ABI, bytecode: BYTECODE },
  adapter: { abi: ADAPTER_ABI, bytecode: BYTECODE },
  factory: { abi: EMPTY_CONSTRUCTOR_ABI, bytecode: BYTECODE },
  pool: { abi: POOL_ABI, bytecode: BYTECODE },
};
const DEPLOYER = '0xDc1cc527423C882156a632C250528D1922d18Fc7' as const;

test('T-DEP-01-01: canonical plan has deterministic ordered addresses and one pool', () => {
  const first = buildCanonicalDeploymentPlan({
    deployer: DEPLOYER,
    startingNonce: 11n,
    timestamp: 1_000n,
    threshold: 200_000_000_000n,
    artifacts: ARTIFACTS,
  });
  const second = buildCanonicalDeploymentPlan({
    deployer: DEPLOYER,
    startingNonce: 11n,
    timestamp: 1_000n,
    threshold: 200_000_000_000n,
    artifacts: ARTIFACTS,
  });
  assert.equal(first.chainId, SEPOLIA_CHAIN_ID);
  assert.deepEqual(first, second);
  assert.equal(new Set(first.actions.map((action) => action.address)).size, 5);
  assert.equal(
    first.actions.map((action) => action.id).join(','),
    'fixture,wrapper,adapter,factory,pool',
  );
  assert.equal(
    first.actions[4]?.address,
    getCreate2Address({
      from: first.actions[3]?.address ?? DEPLOYER,
      salt: first.poolId,
      bytecodeHash: keccak256(first.actions[4]?.data ?? '0x'),
    }),
  );
});

test('T-DEP-01-02: timing and immutable public configuration retain the canonical window', () => {
  const plan = buildCanonicalDeploymentPlan({
    deployer: DEPLOYER,
    startingNonce: 0n,
    timestamp: 10_000n,
    threshold: 200_000_000_000n,
    artifacts: ARTIFACTS,
  });
  assert.equal(plan.observationNotBefore, 10_000n + CANONICAL_OBSERVATION_LEAD_SECONDS);
  assert.equal(plan.poolConfig.deadline, 10_000n + CANONICAL_COMMIT_WINDOW_SECONDS);
  assert.equal(plan.poolConfig.kMin, 2);
  assert.equal(plan.poolConfig.resolutionAdapter, plan.actions[2]?.address);
  assert.equal(plan.poolConfig.confidentialCollateral, plan.actions[1]?.address);
});

test('T-DEP-01-03: invalid timestamp, threshold, feed-age, and nonce reject before a write', () => {
  for (const input of [
    { timestamp: 0n },
    { threshold: 0n },
    { maximumFeedAge: 0n },
    { startingNonce: -1n },
  ]) {
    assert.throws(() =>
      buildCanonicalDeploymentPlan({
        deployer: DEPLOYER,
        startingNonce: 0n,
        timestamp: 1n,
        threshold: 1n,
        artifacts: ARTIFACTS,
        ...input,
      }),
    );
  }
});
