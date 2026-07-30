import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPublicClient, createWalletClient, http, isAddress, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

import {
  ProtocolTransactionClient,
  createSepoliaConfidentialInputClient,
  prepareCommitSignal,
  publicAddress,
  requestId,
} from '../src/index.js';

const CHAIN_ID = 11_155_111;
const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const LEDGER = resolve(ROOT, 'evidence/sepolia/spend-ledger.json');

interface LedgerEntry {
  workItemId: string;
  phase: string;
  sourceCommit: string;
  sender: string;
  transactionHash: string;
  blockNumber: string;
  gasUsed: string;
  effectiveGasPrice: string;
  actualGasCostWei: string;
  timestampUtc: string;
}

interface Ledger {
  schemaVersion: 1;
  chainId: number;
  maxTotalSpendWei: string;
  entries: LedgerEntry[];
}

function fail(message: string): never {
  throw new Error(`SDK-03 Sepolia transaction smoke failed: ${message}`);
}

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function sourceCommit(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
}

function assertClean(): void {
  if (execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim())
    fail('confirmed Sepolia writes require a clean source tree.');
}

function loadLedger(): Ledger {
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as Partial<Ledger>;
  if (ledger.schemaVersion !== 1 || ledger.chainId !== CHAIN_ID || !Array.isArray(ledger.entries))
    fail('the Sepolia spend ledger is malformed.');
  return ledger as Ledger;
}

function spent(ledger: Ledger): bigint {
  return ledger.entries.reduce((sum, entry) => sum + BigInt(entry.actualGasCostWei), 0n);
}

async function main(): Promise<void> {
  const pool = argument('pool');
  if (!pool || !isAddress(pool)) fail('a valid --pool=0x... is required.');
  const env = resolve(ROOT, '.env');
  if (existsSync(env)) process.loadEnvFile(env);
  if (process.env.CONFIRM_SEPOLIA_WRITE !== 'yes')
    fail('CONFIRM_SEPOLIA_WRITE=yes is required for the bounded commit write.');
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY as `0x${string}` | undefined;
  if (!rpcUrl || !privateKey) fail('configured Sepolia RPC access and owner signer are required.');
  assertClean();

  const account = privateKeyToAccount(privateKey);
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
  const chain = createPublicClient({ chain: sepolia, transport: http(rpcUrl, { retryCount: 0 }) });
  if ((await chain.getChainId()) !== CHAIN_ID) fail('the configured RPC is not Ethereum Sepolia.');
  if (!(await chain.getCode({ address: pool }))) fail('the named pool has no runtime code.');

  const ledger = loadLedger();
  const context = {
    chainId: CHAIN_ID,
    pool: publicAddress(pool),
    request: requestId(keccak256(toHex(`quitesignal/sdk-03/commit/${pool.toLowerCase()}`))),
  };
  const confidential = await createSepoliaConfidentialInputClient(wallet);
  const prepared = prepareCommitSignal(
    await confidential.sealUint256(1n, context),
    await confidential.sealUint256(5_000n, context),
  );
  const transactions = new ProtocolTransactionClient(CHAIN_ID, {
    async sendTransaction({ to, data }) {
      const gas = await chain.estimateGas({ account: account.address, to, data });
      const maxFeePerGas =
        (await chain.estimateFeesPerGas()).maxFeePerGas ?? (await chain.getGasPrice());
      if (spent(ledger) + gas * maxFeePerGas > BigInt(ledger.maxTotalSpendWei))
        fail('the SDK-03 commit exceeds the committed Sepolia budget.');
      const transactionHash = await wallet.sendTransaction({
        account,
        to,
        data,
        gas,
        maxFeePerGas,
      });
      const receipt = await chain.waitForTransactionReceipt({ hash: transactionHash });
      if (receipt.status !== 'success') fail('the SDK-03 encrypted commit reverted.');
      ledger.entries.push({
        workItemId: 'SDK-03',
        phase: 'P2',
        sourceCommit: sourceCommit(),
        sender: account.address,
        transactionHash,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.effectiveGasPrice.toString(),
        actualGasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
        timestampUtc: new Date().toISOString(),
      });
      writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`);
      return transactionHash;
    },
  });
  const transactionHash = await transactions.sendCommit(prepared);
  process.stdout.write(
    `${JSON.stringify({ workItem: 'SDK-03', pool: context.pool, request: context.request, transactionHash })}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'SDK-03 Sepolia transaction smoke failed unexpectedly.'}\n`,
  );
  process.exitCode = 1;
});
