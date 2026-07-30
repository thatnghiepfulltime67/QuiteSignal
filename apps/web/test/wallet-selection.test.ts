import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('T-WEB-01-WALLET-UX-04: provider discovery stays in memory and keeps signing explicit', () => {
  const source = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
  const styles = readFileSync(resolve(root, 'src/styles.css'), 'utf8');

  assert.match(source, /eip6963:requestProvider/);
  assert.match(source, /eip6963:announceProvider/);
  assert.match(source, /function availableWallets/);
  assert.match(source, /function bindWalletEvents/);
  assert.match(source, /function activeWallet/);
  assert.match(source, /data-wallet-index/);
  assert.match(source, /Connecting lets this page request your public account and Sepolia network/);
  assert.match(source, /function escapeHtml/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|privateKey|mnemonic|seed phrase/i);
  assert.match(styles, /\.wallet-menu/);
  assert.match(styles, /\.wallet-choice/);
});
