import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const protocolRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const poolSource = readFileSync(
  resolve(protocolRoot, 'contracts/core/QuietSignalPool.sol'),
  'utf8',
);

function functionBody(name: string): string {
  const start = poolSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is absent from QuietSignalPool.`);
  const bodyStart = poolSource.indexOf('{', start);
  assert.notEqual(bodyStart, -1, `${name} has no body.`);
  let depth = 0;
  for (let index = bodyStart; index < poolSource.length; index += 1) {
    if (poolSource[index] === '{') depth += 1;
    if (poolSource[index] === '}') depth -= 1;
    if (depth === 0) return poolSource.slice(bodyStart + 1, index);
  }
  assert.fail(`${name} has an unterminated body.`);
}

test('T-PK07-POLICY-01: owner terminal paths do not public-decrypt owner values', () => {
  const publicDecryptArguments = [...poolSource.matchAll(/Nox\.publicDecrypt\(([^,]+)/g)].map(
    (match) => match[1]?.trim() ?? assert.fail('A public-decrypt call has no first argument.'),
  );
  assert.deepEqual(publicDecryptArguments, [
    '_pending.accepted',
    '_pending.accepted',
    '_aggregateYes',
    '_aggregateNo',
  ]);
  for (const name of ['materializeScore', 'claim', 'refund']) {
    assert.doesNotMatch(functionBody(name), /publicDecrypt|allowPublicDecryption/);
  }
});

test('T-PK07-POLICY-02: terminal actions remain caller-scoped, state-gated, and mutually exclusive', () => {
  const score = functionBody('materializeScore');
  const claim = functionBody('claim');
  const refund = functionBody('refund');
  assert.match(score, /_requireState\(QuietSignalTypes\.EpochState\.SETTLED\)/);
  assert.match(score, /_positionForTerminalAction\(msg\.sender\)/);
  assert.match(score, /Nox\.addViewer\(score, msg\.sender\)/);
  assert.match(claim, /_requireState\(QuietSignalTypes\.EpochState\.SETTLED\)/);
  assert.match(
    claim,
    /if \(position\.claimed\) revert IQuietSignalErrors\.AlreadyClaimed\(msg\.sender\)/,
  );
  assert.match(
    claim,
    /if \(position\.refunded\) revert IQuietSignalErrors\.TerminalActionConflict\(msg\.sender\)/,
  );
  assert.match(refund, /_requireState\(QuietSignalTypes\.EpochState\.REFUNDABLE\)/);
  assert.match(
    refund,
    /if \(position\.refunded\) revert IQuietSignalErrors\.AlreadyRefunded\(msg\.sender\)/,
  );
  assert.match(
    refund,
    /if \(position\.claimed\) revert IQuietSignalErrors\.TerminalActionConflict\(msg\.sender\)/,
  );
});

test('T-PK07-POLICY-03: terminal transfers use transient collateral authority only', () => {
  const claim = functionBody('claim');
  const refund = functionBody('refund');
  for (const body of [claim, refund]) {
    assert.match(body, /Nox\.allowTransient\([^,]+, address\(confidentialCollateral\)\)/);
    assert.match(body, /confidentialCollateral\.confidentialTransfer\(msg\.sender,/);
    assert.doesNotMatch(body, /Nox\.addViewer|Nox\.allowPublicDecryption/);
  }
});
