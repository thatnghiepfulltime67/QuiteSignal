import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  deriveSelfTestTiming,
  isSelfTestPoolAddress,
  selfTestPolicyForSelection,
} from '../src/self-test.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('T-WEB-10-01: a fresh self-test epoch has a bounded open commit window before observation', () => {
  const timing = deriveSelfTestTiming(1_000n);
  assert.equal(timing.deadline, 2_500n);
  assert.equal(timing.observationNotBefore, 3_100n);
  assert.ok(timing.deadline < timing.observationNotBefore);
  assert.equal(deriveSelfTestTiming(1_000n, 600n).deadline, 1_600n);
  assert.throws(() => deriveSelfTestTiming(0n));
  assert.throws(() => deriveSelfTestTiming(1_000n, 240n));
  assert.equal(
    selfTestPolicyForSelection('greater-or-equal', '300000000000', 60, 5)?.conditionLabel,
    'ETH/USD ≥ $3000',
  );
  assert.equal(selfTestPolicyForSelection('greater-or-equal', '300000000000', 4, 5), undefined);
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

test('T-WEB-11-01: shared pool links accept only complete public addresses', () => {
  assert.equal(isSelfTestPoolAddress('0x0000000000000000000000000000000000000000'), true);
  assert.equal(isSelfTestPoolAddress('0xnot-an-address'), false);
  assert.equal(isSelfTestPoolAddress('0x0000000000000000000000000000000000000000/extra'), false);
});

test('T-WEB-11-02: a shared self-test pool is factory-verified before its participant routes open', () => {
  const selfTest = readFileSync(resolve(root, 'src', 'self-test.ts'), 'utf8');
  const main = readFileSync(resolve(root, 'src', 'main.ts'), 'utf8');

  assert.match(selfTest, /export async function loadSelfTestMarket/);
  assert.match(selfTest, /functionName: 'poolId'/);
  assert.match(selfTest, /functionName: 'poolOf'/);
  assert.match(selfTest, /not registered by the manifest-bound factory/);
  assert.match(selfTest, /canonical release is not a self-test market/);
  assert.match(selfTest, /selected self-test policy/);
  assert.match(selfTest, /selfTestPolicyForSelection/);
  assert.match(main, /\/self-test\/join\//);
  assert.match(main, /comparison: policy\.comparison/);
  assert.match(main, /Verify and join pool/);
  assert.match(main, /No wallet request or transaction was sent/);
  assert.match(main, /const selfTestMarkets: SelfTestMarket\[\] = \[\]/);
  assert.match(main, /function rememberSelfTestMarket/);
  assert.match(main, /data-select-self-test-pool/);
  assert.doesNotMatch(
    `${selfTest}\n${main}`,
    /localStorage|sessionStorage|privateKey|mnemonic|seed phrase|console\./i,
  );
});
