import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { deriveSelfTestTiming } from '../src/self-test.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('T-WEB-10-01: a fresh self-test epoch has a bounded open commit window before observation', () => {
  const timing = deriveSelfTestTiming(1_000n);
  assert.equal(timing.deadline, 2_500n);
  assert.equal(timing.observationNotBefore, 3_100n);
  assert.ok(timing.deadline < timing.observationNotBefore);
  assert.throws(() => deriveSelfTestTiming(0n));
});

test('T-WEB-10-02: browser launch deploys only an immutable adapter then creates and rereads one pool', () => {
  const source = readFileSync(resolve(root, 'src', 'self-test.ts'), 'utf8');

  assert.match(source, /encodeDeployData/);
  assert.match(source, /functionName: 'poolIdFor'/);
  assert.match(source, /functionName: 'createPool'/);
  assert.match(source, /functionName: 'poolOf'/);
  assert.match(source, /keccak256\(factoryCode\) !== input\.factoryRuntimeCodeHash/);
  assert.match(source, /functionName: 'targetRuntimeCodeHash'/);
  assert.match(source, /deployed adapter configuration does not match/);
  assert.match(source, /createViemProtocolPublicReader\(reader\)\.readConfig/);
  assert.doesNotMatch(
    source,
    /localStorage|sessionStorage|privateKey|mnemonic|seed phrase|console\./i,
  );
});

test('T-WEB-10-03: self-test routing preserves the canonical release and uses session-only pool context', () => {
  const source = readFileSync(resolve(root, 'src', 'main.ts'), 'utf8');

  assert.match(source, /function routedPoolAddress/);
  assert.match(source, /location\.pathname\.startsWith\('\/self-test\/'\)/);
  assert.match(source, /id="launch-self-test"/);
  assert.match(source, /Create a fresh self-test market/);
  assert.match(source, /No canonical release was changed/);
  assert.match(source, /history\.pushState/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/i);
});
