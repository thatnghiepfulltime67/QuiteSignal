import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ConfidentialInputClient,
  ProtocolTransactionClient,
  prepareCommitSignal,
  publicAddress,
  quietSignalPoolAbi,
  requestId,
} from '../src/index.js';

const POOL = publicAddress('0xBb00000000000000000000000000000000000002');
const REQUEST = requestId(`0x${'ef'.repeat(32)}`);
const CONTEXT = { chainId: 11_155_111, pool: POOL, request: REQUEST } as const;
const HASH = `0x${'cd'.repeat(32)}` as `0x${string}`;

function inputClient(): ConfidentialInputClient {
  let next = 0n;
  return new ConfidentialInputClient(11_155_111, {
    async encryptInput() {
      next += 1n;
      return {
        handle: `0x${next.toString(16).padStart(64, '0')}`,
        handleProof: `0x${next.toString(16).padStart(2, '0')}`,
      };
    },
  });
}

async function preparedCommit() {
  const client = inputClient();
  return prepareCommitSignal(
    await client.sealUint256(20n, CONTEXT),
    await client.sealUint256(7_500n, CONTEXT),
  );
}

test('T-SDK-03-01: frozen commit ABI stays compatible with the compiled pool artifact', () => {
  const artifactPath = fileURLToPath(
    new URL(
      '../../protocol/artifacts/contracts/core/QuietSignalPool.sol/QuietSignalPool.json',
      import.meta.url,
    ),
  );
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as {
    abi: Array<Record<string, unknown>>;
  };
  const artifactCommit = artifact.abi.find(
    (item) => item.type === 'function' && item.name === 'commitSignal',
  );
  const sdkCommit = quietSignalPoolAbi.find(
    (item) => item.type === 'function' && item.name === 'commitSignal',
  );
  assert.deepEqual(
    (sdkCommit?.inputs ?? []).map((input) => input.type),
    ((artifactCommit?.inputs as Array<{ type: string }> | undefined) ?? []).map(
      (input) => input.type,
    ),
  );
  assert.equal(sdkCommit?.stateMutability, artifactCommit?.stateMutability);
});

test('T-SDK-03-02: prepared commit data is sealed and one request maps to one send', async () => {
  const prepared = await preparedCommit();
  const sends: Array<{ to: string; data: string }> = [];
  const transactions = new ProtocolTransactionClient(11_155_111, {
    async sendTransaction(input) {
      sends.push(input);
      return HASH;
    },
  });
  const [first, retry] = await Promise.all([
    transactions.sendCommit(prepared),
    transactions.sendCommit(prepared),
  ]);
  assert.equal(first, HASH);
  assert.equal(retry, HASH);
  assert.equal(sends.length, 1);
  assert.equal(sends[0]?.to, POOL);
  assert.match(sends[0]?.data ?? '', /^0x/);
  assert.throws(() => JSON.stringify(prepared), /cannot be serialized/);
});

test('T-SDK-03-03: request reuse with different calldata and wrong chain reject', async () => {
  const encryptor = inputClient();
  const first = prepareCommitSignal(
    await encryptor.sealUint256(20n, CONTEXT),
    await encryptor.sealUint256(7_500n, CONTEXT),
  );
  const second = prepareCommitSignal(
    await encryptor.sealUint256(21n, CONTEXT),
    await encryptor.sealUint256(7_500n, CONTEXT),
  );
  assert.throws(
    () =>
      new ProtocolTransactionClient(1, {
        async sendTransaction() {
          return HASH;
        },
      }),
    /Ethereum Sepolia/,
  );
  const transactions = new ProtocolTransactionClient(11_155_111, {
    async sendTransaction() {
      return HASH;
    },
  });
  await transactions.sendCommit(first);
  assert.throws(() => transactions.sendCommit(second), /already bound to another operation/);
});

test('T-SDK-03-04: protocol client source has no log, storage, or JSON data path', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../src/protocol.ts', import.meta.url)),
    'utf8',
  );
  assert.doesNotMatch(source, /\b(console|localStorage|sessionStorage)\b/);
  assert.doesNotMatch(source, /JSON\.(stringify|parse)/);
});
