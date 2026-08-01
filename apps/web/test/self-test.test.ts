import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  deriveDiscoveredCommitWindowMinutes,
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
  assert.equal(
    selfTestPolicyForSelection('greater-or-equal', '300000000000', 7_200, 2)?.commitWindowMinutes,
    7_200,
  );
  assert.equal(
    selfTestPolicyForSelection('less-than', '300000000000', 14_400, 2)?.commitWindowMinutes,
    14_400,
  );
  assert.equal(selfTestPolicyForSelection('less-than', '300000000000', 20_161, 2), undefined);
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
  assert.match(source, /Create verified market/);
  assert.match(source, /No canonical release was changed/);
  assert.match(source, /history\.pushState/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/i);
});

test('T-WEB-16-01: Create drafts stay separate from published pools and expose the full duration range', () => {
  const source = readFileSync(resolve(root, 'src', 'main.ts'), 'utf8');

  assert.match(source, /let selfTestDraft =/);
  assert.match(source, /function captureSelfTestDraft/);
  assert.match(source, /const editingDraft = creatingNewMarket \|\| !activeSelfTestContext/);
  assert.match(source, /rememberSelfTestMarket\(market, false\)/);
  assert.match(source, /\[20_160, '14 days'\]/);
  assert.match(source, /id="self-test-threshold" type="number" min="1" max="1000000"/);
  assert.match(source, /function formatDeadline/);
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
  assert.match(main, /function selfTestSharePath/);
  assert.match(main, /Verified shared market/);
  assert.match(main, /No wallet request or transaction was sent/);
  assert.match(main, /const selfTestMarkets: SelfTestMarket\[\] = \[\]/);
  assert.match(main, /function rememberSelfTestMarket/);
  assert.match(main, /data-select-self-test-pool/);
  assert.match(main, /5 days/);
  assert.match(main, /10 days/);
  assert.doesNotMatch(main, /id="join-self-test"/);
  assert.doesNotMatch(main, /id="join-self-test-address"/);
  assert.doesNotMatch(main, /id="launch-self-test-batch"/);
  assert.doesNotMatch(main, /Create 10 verified pools/);
  assert.doesNotMatch(
    `${selfTest}\n${main}`,
    /localStorage|sessionStorage|privateKey|mnemonic|seed phrase|console\./i,
  );
});

test('T-WEB-15-01: Portfolio keeps only a connected wallet’s session-created pools without browser storage', () => {
  const main = readFileSync(resolve(root, 'src', 'main.ts'), 'utf8');

  assert.match(main, /Pools created by this wallet/);
  assert.match(main, /const createdSelfTestMarkets/);
  assert.match(main, /function rememberCreatedSelfTestMarket/);
  assert.match(main, /connectedWalletAddress/);
  assert.doesNotMatch(main, /localStorage|sessionStorage/i);
});

test('T-WEB-15-GLOBAL-01: discovered factory windows stay bounded without claiming an exact creation draft', () => {
  assert.equal(deriveDiscoveredCommitWindowMinutes(2_500n, 1_020n), 25);
  assert.equal(deriveDiscoveredCommitWindowMinutes(1_300n, 1_020n), 5);
  assert.equal(deriveDiscoveredCommitWindowMinutes(1_300n, 1_000n), 5);
  assert.throws(() => deriveDiscoveredCommitWindowMinutes(1_000n, 1_000n));
  assert.throws(() => deriveDiscoveredCommitWindowMinutes(2_000_000n, 1_000n));
});

test('T-WEB-15-GLOBAL-02: connected browsers discover and independently verify factory-created pools', () => {
  const selfTest = readFileSync(resolve(root, 'src', 'self-test.ts'), 'utf8');
  const main = readFileSync(resolve(root, 'src', 'main.ts'), 'utf8');

  assert.match(selfTest, /export const poolCreatedEvent/);
  assert.match(selfTest, /export async function discoverSelfTestMarkets/);
  assert.match(selfTest, /fromBlock \+= blockSpan/);
  assert.match(selfTest, /const blockSpan = 2_000n/);
  assert.match(selfTest, /event: poolCreatedEvent/);
  assert.match(selfTest, /functionName: 'poolOf'/);
  assert.match(selfTest, /createViemProtocolPublicReader\(reader\)\.readConfig/);
  assert.match(selfTest, /readAdapterFacts/);
  assert.match(selfTest, /adapter\.targetRuntimeCodeHash !== keccak256\(feedCode\)/);
  assert.match(main, /function loadFactorySelfTestMarkets/);
  assert.match(main, /factoryDeploymentBlock: BigInt\(manifest\.deployedAtBlock\)/);
  assert.match(main, /void refreshPublishedSelfTestMarkets\(\);/);
  assert.match(main, /void refreshMarketDirectory\(\)/);
  assert.match(main, /Deadline \$\{formatDeadline\(market\.deadline\)\}/);
  assert.doesNotMatch(`${selfTest}\n${main}`, /localStorage|sessionStorage/i);
});
