import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSignalDraft } from '../src/signal.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('T-WEB-03-01: signal values validate without numbers or serialization', () => {
  assert.deepEqual(validateSignalDraft({ stake: '1.25', probability: '7500' }), {
    stakeBaseUnits: 1250000000000000000n,
    probabilityBps: 7500n,
  });
});
test('T-WEB-03-02: unsafe draft values reject before encryption', () => {
  assert.throws(() => validateSignalDraft({ stake: '0', probability: '10001' }));
  assert.throws(() => validateSignalDraft({ stake: '1e2', probability: '50.5' }));
});

test('T-WEB-03-03: the browser uses distinct pool and collateral encryption boundaries', () => {
  const source = readFileSync(resolve(root, 'src', 'wallet.ts'), 'utf8');

  assert.match(source, /config\.confidentialCollateral\.toLowerCase\(\).*manifestCollateral/i);
  assert.match(source, /nox\.sealUint256\(values\.stakeBaseUnits, context\)/);
  assert.match(source, /nox\.sealUint256\(values\.probabilityBps, context\)/);
  assert.match(
    source,
    /handles\.encryptInput\([\s\S]*values\.stakeBaseUnits,[\s\S]*'uint256',[\s\S]*config\.confidentialCollateral/,
  );
  assert.match(source, /functionName: 'confidentialTransferAndCall'/);
  assert.match(source, /functionName: 'pendingAcceptanceHandle'/);
  assert.match(source, /handles\.publicDecrypt\(acceptanceHandle/);
  assert.match(source, /functionName: 'finalizeCommit'/);
});

test('T-WEB-03-04: every submitted stage waits for a receipt and exposes a no-plaintext finalization retry', () => {
  const wallet = readFileSync(resolve(root, 'src', 'wallet.ts'), 'utf8');
  const main = readFileSync(resolve(root, 'src', 'main.ts'), 'utf8');
  const styles = readFileSync(resolve(root, 'src', 'styles.css'), 'utf8');

  assert.equal((wallet.match(/waitForConfirmedReceipt\(/g) ?? []).length, 5);
  assert.match(wallet, /export async function finalizePendingSignal/);
  assert.match(main, /id="retry-finalize" type="button" hidden/);
  assert.match(styles, /\.secondary\[hidden\]\s*\{\s*display: none;/);
  assert.match(main, /event\.currentTarget\.reset\(\);/);
});
