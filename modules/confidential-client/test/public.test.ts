import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  decimalInput,
  formatBaseUnits,
  parseBaseUnits,
  poolId,
  publicAddress,
  requestId,
  transactionHash,
} from '../src/index.js';

const ADDRESS = '0xAa00000000000000000000000000000000000001';
const HASH = `0x${'ab'.repeat(32)}`;

test('T-SDK-01-01: public identifiers have exact fixed-size canonical forms', () => {
  assert.equal(publicAddress(ADDRESS), ADDRESS.toLowerCase());
  assert.equal(poolId(HASH), HASH);
  assert.equal(requestId(HASH), HASH);
  assert.equal(transactionHash(HASH), HASH);
  for (const invalid of ['', '0x12', `0x${'zz'.repeat(32)}`, 123]) {
    assert.throws(() => publicAddress(invalid));
    assert.throws(() => poolId(invalid));
  }
});

test('T-SDK-01-02: decimal parsing is exact without JavaScript number value input', () => {
  const value = decimalInput('123.4506', 6);
  assert.equal(parseBaseUnits(value, 6), 123_450_600n);
  assert.equal(formatBaseUnits(123_450_600n, 6), '123.4506');
  assert.equal(parseBaseUnits(decimalInput('0', 18), 18), 0n);
  assert.equal(formatBaseUnits(1n, 18), '0.000000000000000001');
});

test('T-SDK-01-03: malformed, imprecise, signed, and oversized public decimals reject', () => {
  for (const invalid of ['01', '-1', '+1', '1e3', '.1', '1.', '1.0000001', '', 1, 1.2]) {
    assert.throws(() => decimalInput(invalid, 6));
  }
  assert.throws(() => decimalInput('1', -1));
  assert.throws(() => decimalInput('1', 78));
  assert.throws(() => decimalInput((1n << 256n).toString(), 0));
});

test('T-SDK-01-04: the public SDK source declares no confidential-shaped fields', () => {
  const path = resolve(fileURLToPath(new URL('../src/public.ts', import.meta.url)));
  const source = readFileSync(path, 'utf8');
  assert.doesNotMatch(
    source,
    /\b(stake|probability|position|payout|refund|score|handle|proof)\s*:/i,
  );
  assert.doesNotMatch(source, /@iexec-nox|createWalletClient|SEPOLIA_PRIVATE_KEY/);
});
