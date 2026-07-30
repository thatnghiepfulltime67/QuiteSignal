import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const protocolRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const source = (path: string) => readFileSync(resolve(protocolRoot, 'contracts', path), 'utf8');
const pool = source('core/QuietSignalPool.sol');
const factory = source('core/QuietSignalFactory.sol');
const adapter = source('adapters/ChainlinkPriceFeedResolutionAdapter.sol');

test('T-PK09-POLICY-01: production contracts do not import feasibility spike code', () => {
  for (const [name, contents] of [
    ['pool', pool],
    ['factory', factory],
    ['adapter', adapter],
  ] as const) {
    assert.doesNotMatch(contents, /feasibility\//i, `${name} imports feasibility code.`);
    assert.doesNotMatch(
      contents,
      /Feasibility[A-Za-z]+/,
      `${name} references a feasibility contract.`,
    );
  }
});

test('T-PK09-POLICY-02: production public decrypt scope excludes owner-shaped values', () => {
  const publicDecryptArguments = [...pool.matchAll(/Nox\.publicDecrypt\(([^,]+)/g)].map(
    (match) => match[1]?.trim() ?? assert.fail('A public-decrypt call has no first argument.'),
  );
  const publicDisclosureArguments = [...pool.matchAll(/Nox\.allowPublicDecryption\(([^)]+)/g)].map(
    (match) => match[1]?.trim() ?? assert.fail('A public-disclosure call has no first argument.'),
  );
  assert.deepEqual(publicDecryptArguments, [
    '_pending.accepted',
    '_pending.accepted',
    '_aggregateYes',
    '_aggregateNo',
  ]);
  assert.deepEqual(publicDisclosureArguments, [
    '_pending.accepted',
    '_aggregateYes',
    '_aggregateNo',
  ]);
});

test('T-PK09-POLICY-03: production contracts expose no administrative terminal authority', () => {
  for (const contents of [pool, factory, adapter]) {
    assert.doesNotMatch(contents, /onlyOwner|Ownable|admin|governance|sweep/i);
    assert.doesNotMatch(contents, /function\s+(pause|unpause|upgradeTo|set[A-Z])/);
  }
});
