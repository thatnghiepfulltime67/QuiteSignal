import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('T-WEB-05-01: owner terminal actions stay wallet-gated and use the frozen pool ABI', () => {
  const wallet = readFileSync(resolve(root, 'src', 'wallet.ts'), 'utf8');
  const main = readFileSync(resolve(root, 'src', 'main.ts'), 'utf8');

  assert.match(
    wallet,
    /export type OwnerTerminalAction = 'materializeScore' \| 'claim' \| 'refund'/,
  );
  assert.match(wallet, /functionName: action/);
  assert.match(wallet, /waitForConfirmedReceipt\(reader, transactionHash\)/);
  assert.match(main, /data-owner-action="materializeScore"/);
  assert.match(main, /data-owner-action="claim"/);
  assert.match(main, /data-owner-action="refund"/);
  assert.match(main, /ownerActions = ''/);
});
