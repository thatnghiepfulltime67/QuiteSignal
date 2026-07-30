import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { id, Interface, type InterfaceAbi } from 'ethers';

const protocolRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

interface AbiItem {
  type: string;
  name?: string;
  inputs?: Array<{ internalType?: string; name: string; type: string }>;
  stateMutability?: string;
}

function loadArtifact(name: string): { abi: AbiItem[]; contractInterface: Interface } {
  const artifactPath = resolve(
    protocolRoot,
    'artifacts',
    'contracts',
    'interfaces',
    `${name}.sol`,
    `${name}.json`,
  );
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as {
    abi: AbiItem[] & InterfaceAbi;
  };
  return { abi: artifact.abi, contractInterface: new Interface(artifact.abi) };
}

function loadInterface(name: string): Interface {
  return loadArtifact(name).contractInterface;
}

function requireFunction(contractInterface: Interface, name: string) {
  const fragment = contractInterface.getFunction(name);
  if (fragment === null) throw new Error(`Missing function ${name}.`);
  return fragment;
}

function requireEvent(contractInterface: Interface, name: string) {
  const fragment = contractInterface.getEvent(name);
  if (fragment === null) throw new Error(`Missing event ${name}.`);
  return fragment;
}

function requireError(contractInterface: Interface, name: string) {
  const fragment = contractInterface.getError(name);
  if (fragment === null) throw new Error(`Missing error ${name}.`);
  return fragment;
}

function assertFunctionSelector(
  contractInterface: Interface,
  name: string,
  signature: string,
): void {
  const fragment = requireFunction(contractInterface, name);
  assert.equal(fragment.format('sighash'), signature);
  assert.equal(fragment.selector, id(signature).slice(0, 10));
}

function assertEventTopic(contractInterface: Interface, name: string, signature: string): void {
  const fragment = requireEvent(contractInterface, name);
  assert.equal(fragment.format('sighash'), signature);
  assert.equal(fragment.topicHash, id(signature));
}

function assertErrorSelector(contractInterface: Interface, name: string, signature: string): void {
  const fragment = requireError(contractInterface, name);
  assert.equal(fragment.format('sighash'), signature);
  assert.equal(fragment.selector, id(signature).slice(0, 10));
}

test('T-ABI-PK02-01: pool selectors preserve encrypted commit and caller-independent settlement', () => {
  const pool = loadInterface('IQuietSignalPool');

  for (const [name, signature] of <Array<[string, string]>>[
    ['poolId', 'poolId()'],
    ['epochId', 'epochId()'],
    ['config', 'config()'],
    ['epoch', 'epoch()'],
    ['ownerPosition', 'ownerPosition()'],
    ['pendingCommit', 'pendingCommit()'],
    ['commitSignal', 'commitSignal(bytes32,bytes,bytes32,bytes)'],
    ['finalizeCommit', 'finalizeCommit(bytes)'],
    ['rejectPendingCommit', 'rejectPendingCommit(bytes)'],
    ['expirePendingCommit', 'expirePendingCommit()'],
    ['closeEpoch', 'closeEpoch()'],
    ['requestAggregateDecrypt', 'requestAggregateDecrypt()'],
    ['finalizeAggregate', 'finalizeAggregate(bytes32,bytes)'],
    ['settle', 'settle()'],
    ['cancelBeforeResolution', 'cancelBeforeResolution()'],
    ['cancelAfterResolutionGrace', 'cancelAfterResolutionGrace()'],
    ['materializeScore', 'materializeScore()'],
    ['claim', 'claim()'],
    ['refund', 'refund()'],
  ]) {
    assertFunctionSelector(pool, name, signature);
  }

  const commit = requireFunction(pool, 'commitSignal');
  const rawCommit = loadArtifact('IQuietSignalPool').abi.find(
    (fragment) => fragment.type === 'function' && fragment.name === 'commitSignal',
  );
  if (rawCommit?.inputs === undefined) throw new Error('Missing raw commit ABI inputs.');
  assert.deepEqual(
    rawCommit.inputs.map((input) => input.type),
    ['bytes32', 'bytes', 'bytes32', 'bytes'],
  );
  assert.deepEqual(
    rawCommit.inputs.map((input) => input.internalType),
    ['externalEuint256', 'bytes', 'externalEuint256', 'bytes'],
  );
  assert.equal(commit.stateMutability, 'nonpayable');
  assert.equal(requireFunction(pool, 'finalizeAggregate').inputs.length, 2);
  assert.equal(requireFunction(pool, 'settle').inputs.length, 0);
  assert.equal(requireFunction(pool, 'settle').stateMutability, 'nonpayable');
});

test('T-ABI-PK02-02: factory and direct-resolution adapter retain their narrow boundaries', () => {
  const factory = loadInterface('IQuietSignalFactory');
  assertFunctionSelector(
    factory,
    'createPool',
    'createPool((address,address,uint64,uint64,uint32,uint64,uint64),bytes32)',
  );
  assertFunctionSelector(
    factory,
    'poolIdFor',
    'poolIdFor((address,address,uint64,uint64,uint32,uint64,uint64),bytes32)',
  );
  assertFunctionSelector(factory, 'poolOf', 'poolOf(bytes32)');

  const adapter = loadInterface('IResolutionAdapter');
  for (const [name, signature] of <Array<[string, string]>>[
    ['target', 'target()'],
    ['targetRuntimeCodeHash', 'targetRuntimeCodeHash()'],
    ['greaterOrEqual', 'greaterOrEqual()'],
    ['threshold', 'threshold()'],
    ['observationNotBefore', 'observationNotBefore()'],
    ['maximumFeedAge', 'maximumFeedAge()'],
    ['resolution', 'resolution()'],
  ]) {
    assertFunctionSelector(adapter, name, signature);
    assert.equal(requireFunction(adapter, name).stateMutability, 'view');
  }
  assert.deepEqual(
    requireFunction(adapter, 'resolution').outputs.map((output) => output.type),
    ['uint8', 'uint80', 'int256', 'uint256'],
  );
  assert.equal(requireFunction(adapter, 'resolution').inputs.length, 0);
  assert.ok(
    !loadArtifact('IResolutionAdapter').abi.some(
      (fragment) => fragment.type === 'fallback' || fragment.type === 'receive',
    ),
  );

  const interfaceFiles = readdirSync(resolve(protocolRoot, 'contracts', 'interfaces'));
  assert.ok(
    !interfaceFiles.some((file) => /erc7984|confidentialcollateral/i.test(file)),
    'The pinned Nox IERC7984 interface must not be copied into the protocol ABI.',
  );

  for (const contractName of ['IQuietSignalFactory', 'IResolutionAdapter', 'IQuietSignalPool']) {
    for (const fragment of loadArtifact(contractName).abi) {
      if (fragment.type === 'function') assert.notEqual(fragment.stateMutability, 'payable');
    }
  }
});

test('T-ABI-PK02-03: events expose chain facts without confidential values or proofs', () => {
  const pool = loadInterface('IQuietSignalPool');
  assertEventTopic(pool, 'EpochOpened', 'EpochOpened(bytes32,address,uint64,uint32)');
  assertEventTopic(
    pool,
    'SignalIntentRegistered',
    'SignalIntentRegistered(bytes32,address,uint64)',
  );
  assertEventTopic(pool, 'SignalIntentCleared', 'SignalIntentCleared(bytes32,address,bool)');
  assertEventTopic(pool, 'SignalCommitted', 'SignalCommitted(bytes32,address,bytes32)');
  assertEventTopic(pool, 'EpochClosed', 'EpochClosed(bytes32,uint32)');
  assertEventTopic(pool, 'AggregateDecryptRequested', 'AggregateDecryptRequested(bytes32,bytes32)');
  assertEventTopic(
    pool,
    'AggregateFinalized',
    'AggregateFinalized(bytes32,bytes32,uint256,uint256)',
  );
  assertEventTopic(
    pool,
    'SettlementFinalized',
    'SettlementFinalized(bytes32,uint8,uint256,uint256,uint80,int256)',
  );
  assertEventTopic(pool, 'ScoreMaterialized', 'ScoreMaterialized(bytes32,address)');
  assertEventTopic(pool, 'PayoutClaimed', 'PayoutClaimed(bytes32,address,bytes32)');
  assertEventTopic(pool, 'Refunded', 'Refunded(bytes32,address,bytes32)');

  for (const fragment of loadArtifact('IQuietSignalPool').abi) {
    if (fragment.type !== 'event' || fragment.inputs === undefined) continue;
    for (const input of fragment.inputs) {
      assert.doesNotMatch(input.internalType ?? '', /euint|proof|handle/i);
      assert.ok(
        !['stake', 'probabilityBps', 'payout', 'refundAmount', 'scoreBps', 'proof'].includes(
          input.name,
        ),
      );
    }
  }

  const factory = loadInterface('IQuietSignalFactory');
  assertEventTopic(
    factory,
    'PoolCreated',
    'PoolCreated(bytes32,address,bytes32,address,address,uint64,uint32)',
  );
});

test('T-ABI-PK02-04: stable error selectors remain available from one common ABI', () => {
  const errors = loadInterface('IQuietSignalErrors');
  for (const [name, signature] of <Array<[string, string]>>[
    ['AggregateRequestMissing', 'AggregateRequestMissing()'],
    ['AggregateTimeoutNotReached', 'AggregateTimeoutNotReached(uint64,uint64)'],
    ['AlreadyClaimed', 'AlreadyClaimed(address)'],
    ['AlreadyCommitted', 'AlreadyCommitted(address)'],
    ['AlreadyRefunded', 'AlreadyRefunded(address)'],
    ['CallbackOwnerMismatch', 'CallbackOwnerMismatch(address,address)'],
    ['CommitRejected', 'CommitRejected()'],
    ['CommitWindowClosed', 'CommitWindowClosed(uint64,uint64)'],
    ['ConservationViolation', 'ConservationViolation()'],
    ['DuplicateAggregateRequest', 'DuplicateAggregateRequest(bytes32)'],
    ['InvalidConfiguration', 'InvalidConfiguration()'],
    ['InvalidFeedRound', 'InvalidFeedRound()'],
    ['InvalidInputHandle', 'InvalidInputHandle()'],
    ['InvalidResolutionAdapter', 'InvalidResolutionAdapter(address)'],
    ['InvalidState', 'InvalidState(uint8,uint8)'],
    ['NativeValueNotAccepted', 'NativeValueNotAccepted()'],
    ['PendingCommitExists', 'PendingCommitExists(address)'],
    ['PendingCommitMissing', 'PendingCommitMissing()'],
    ['PendingCommitTimeoutNotReached', 'PendingCommitTimeoutNotReached(uint64,uint64)'],
    ['PoolAlreadyExists', 'PoolAlreadyExists(bytes32)'],
    ['ProofAlreadyConsumed', 'ProofAlreadyConsumed(bytes32)'],
    ['ProofContextMismatch', 'ProofContextMismatch(bytes32)'],
    ['ResolutionGraceNotElapsed', 'ResolutionGraceNotElapsed(uint64,uint64)'],
    ['ResolutionNotReady', 'ResolutionNotReady(uint64,uint64)'],
    ['TerminalActionConflict', 'TerminalActionConflict(address)'],
    ['UnauthorizedCollateral', 'UnauthorizedCollateral(address)'],
    ['WrongCallbackOperator', 'WrongCallbackOperator()'],
    ['ZeroWinningPool', 'ZeroWinningPool(uint8)'],
  ]) {
    assertErrorSelector(errors, name, signature);
  }
});
