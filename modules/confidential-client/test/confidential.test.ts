import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ConfidentialInputClient,
  contractEncryptedInput,
  poolId,
  publicAddress,
  requestId,
} from '../src/index.js';

const POOL = publicAddress('0xAa00000000000000000000000000000000000001');
const REQUEST = requestId(`0x${'ab'.repeat(32)}`);
const CONTEXT = { chainId: 11_155_111, pool: POOL, request: REQUEST } as const;

test('T-SDK-02-01: a sealed input has a canonical Sepolia/pool/request context', async () => {
  const calls: Array<{ value: bigint; type: string; pool: string }> = [];
  const client = new ConfidentialInputClient(11_155_111, {
    async encryptInput(value, type, pool) {
      calls.push({ value, type, pool });
      return { handle: `0x${'12'.repeat(32)}`, handleProof: '0xabcd' };
    },
  });
  const sealed = await client.sealUint256(42n, CONTEXT);
  assert.deepEqual(calls, [{ value: 42n, type: 'uint256', pool: POOL }]);
  assert.deepEqual(contractEncryptedInput(sealed, CONTEXT), {
    handle: `0x${'12'.repeat(32)}`,
    handleProof: '0xabcd',
  });
  assert.throws(() => JSON.stringify(sealed), /cannot be serialized/);
  assert.throws(
    () =>
      contractEncryptedInput(sealed, { ...CONTEXT, request: requestId(`0x${'cd'.repeat(32)}`) }),
    /context does not match/,
  );
  assert.equal(poolId(`0x${'ef'.repeat(32)}`), `0x${'ef'.repeat(32)}`);
});

test('T-SDK-02-02: one client serializes concurrent Nox encryption requests', async () => {
  let active = 0;
  let maximumActive = 0;
  const client = new ConfidentialInputClient(11_155_111, {
    async encryptInput() {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { handle: `0x${'34'.repeat(32)}`, handleProof: '0xcdef' };
    },
  });
  await Promise.all([client.sealUint256(1n, CONTEXT), client.sealUint256(2n, CONTEXT)]);
  assert.equal(maximumActive, 1);
});

test('T-SDK-02-03: invalid chain, context, value, and Nox response reject without plaintext', async () => {
  assert.throws(
    () =>
      new ConfidentialInputClient(1, {
        async encryptInput() {
          return { handle: '0x12', handleProof: '0x34' };
        },
      }),
    /Ethereum Sepolia/,
  );
  const client = new ConfidentialInputClient(11_155_111, {
    async encryptInput() {
      return { handle: 'not-hex', handleProof: '0x34' };
    },
  });
  for (const [value, context] of [
    [-1n, CONTEXT],
    [1n << 256n, CONTEXT],
    [1n, { ...CONTEXT, chainId: 1 }],
    [1n, { ...CONTEXT, pool: 'not-an-address' }],
  ] as const) {
    await assert.rejects(
      () => client.sealUint256(value, context as never),
      /Confidential input rejected/,
    );
  }
  await assert.rejects(
    () => client.sealUint256(7n, CONTEXT),
    (error: Error) => {
      assert.doesNotMatch(error.message, /7/);
      return true;
    },
  );
});

test('T-SDK-02-04: confidential source has no log or durable serialization path', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../src/confidential.ts', import.meta.url)),
    'utf8',
  );
  assert.doesNotMatch(source, /\b(console|localStorage|sessionStorage)\b/);
  assert.doesNotMatch(source, /JSON\.(stringify|parse)/);
});
