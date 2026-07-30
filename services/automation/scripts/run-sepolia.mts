import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { createWalletClient, http, isAddress, type Address, type Hash, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

import { parseManifest } from '@quitesignal/verifier';

import {
  createSepoliaReadClient,
  encodePermissionlessAction,
  publicActionReport,
  readPublicPoolSnapshot,
  selectPublicPoolAction,
} from '../src/runner.js';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const ledgerPath = resolve(repositoryRoot, 'evidence/sepolia/spend-ledger.json');

interface SpendLedger {
  schemaVersion: number;
  chainId: number;
  maxTotalSpendWei: string;
  entries: Array<{
    actualGasCostWei: string;
    workItemId?: string;
    phase?: string;
    sourceCommit?: string;
    sender?: string;
    transactionHash?: string;
    blockNumber?: string;
    gasUsed?: string;
    effectiveGasPrice?: string;
    timestampUtc?: string;
  }>;
}

function fail(message: string): never {
  throw new Error(`AUT-01 runner failed: ${message}`);
}

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function loadEnvironment(): void {
  const environment = resolve(repositoryRoot, '.env');
  if (existsSync(environment)) process.loadEnvFile(environment);
}

function assertClean(): void {
  if (
    execFileSync('git', ['status', '--porcelain'], { cwd: repositoryRoot, encoding: 'utf8' }).trim()
  ) {
    fail('confirmed lifecycle writes require a clean source tree.');
  }
}

function sourceCommit(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
}

function loadLedger(): SpendLedger {
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) as Partial<SpendLedger>;
  if (
    ledger.schemaVersion !== 1 ||
    ledger.chainId !== 11_155_111 ||
    typeof ledger.maxTotalSpendWei !== 'string' ||
    !/^\d+$/.test(ledger.maxTotalSpendWei) ||
    !Array.isArray(ledger.entries) ||
    ledger.entries.some(
      (entry) =>
        typeof entry.actualGasCostWei !== 'string' || !/^\d+$/.test(entry.actualGasCostWei),
    )
  ) {
    fail('the Sepolia spend ledger is malformed.');
  }
  return ledger as SpendLedger;
}

function totalSpend(ledger: SpendLedger): bigint {
  return ledger.entries.reduce((total, entry) => total + BigInt(entry.actualGasCostWei), 0n);
}

function appendSpend(
  ledger: SpendLedger,
  entry: {
    sender: Address;
    transactionHash: Hash;
    blockNumber: bigint;
    gasUsed: bigint;
    effectiveGasPrice: bigint;
  },
): void {
  ledger.entries.push({
    workItemId: 'AUT-01',
    phase: 'P2',
    sourceCommit: sourceCommit(),
    sender: entry.sender,
    transactionHash: entry.transactionHash,
    blockNumber: entry.blockNumber.toString(),
    gasUsed: entry.gasUsed.toString(),
    effectiveGasPrice: entry.effectiveGasPrice.toString(),
    actualGasCostWei: (entry.gasUsed * entry.effectiveGasPrice).toString(),
    timestampUtc: new Date().toISOString(),
  });
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
}

function poolFromArguments(): Address {
  const direct = argument('pool');
  if (direct) {
    if (!isAddress(direct)) fail('--pool must be an address.');
    return direct;
  }
  const manifestArgument = argument('manifest') ?? 'deployments/sepolia/quiet-signal.json';
  const manifest = parseManifest(
    JSON.parse(readFileSync(resolve(repositoryRoot, manifestArgument), 'utf8')),
  );
  const pool = manifest.pools[0]?.address;
  if (!pool) fail('the manifest does not contain a pool.');
  return pool;
}

async function main(): Promise<void> {
  loadEnvironment();
  const mode = argument('mode') ?? 'dry-run';
  if (!['dry-run', 'health', 'once', 'poll'].includes(mode))
    fail('mode must be dry-run, health, once, or poll.');
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) fail('SEPOLIA_RPC_URL is required.');
  const pool = poolFromArguments();
  const publicClient = createSepoliaReadClient(rpcUrl);
  const read = async () => {
    const snapshot = await readPublicPoolSnapshot(publicClient, pool);
    return { snapshot, action: selectPublicPoolAction(snapshot) };
  };
  if (mode === 'dry-run' || mode === 'health') {
    const { snapshot, action } = await read();
    process.stdout.write(
      `${JSON.stringify({ mode, healthy: true, ...publicActionReport(snapshot, action) })}\n`,
    );
    return;
  }
  if (process.env.CONFIRM_SEPOLIA_WRITE !== 'yes') {
    fail('set CONFIRM_SEPOLIA_WRITE=yes for a lifecycle write.');
  }
  assertClean();
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY as Hex | undefined;
  if (!privateKey) fail('SEPOLIA_PRIVATE_KEY is required for once or poll mode.');
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
  const iterations = mode === 'poll' ? Number(argument('iterations') ?? '1') : 1;
  const intervalSeconds = Number(argument('interval-seconds') ?? '15');
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 100)
    fail('poll iterations must be 1 through 100.');
  if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds < 5 || intervalSeconds > 300)
    fail('poll interval must be 5 through 300 seconds.');
  const ledger = loadLedger();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const first = await read();
    if (!first.action) {
      process.stdout.write(
        `${JSON.stringify({ mode, iteration, status: 'no-action', ...publicActionReport(first.snapshot, first.action) })}\n`,
      );
    } else if (first.action.kind === 'finalize-aggregate') {
      process.stdout.write(
        `${JSON.stringify({ mode, iteration, status: 'public-result-required', ...publicActionReport(first.snapshot, first.action) })}\n`,
      );
    } else {
      const second = await read();
      if (JSON.stringify(first.action) !== JSON.stringify(second.action)) {
        process.stdout.write(
          `${JSON.stringify({ mode, iteration, status: 'race-retryable', ...publicActionReport(second.snapshot, second.action) })}\n`,
        );
      } else if (!second.action || second.action.kind === 'finalize-aggregate') {
        process.stdout.write(
          `${JSON.stringify({ mode, iteration, status: 'action-no-longer-writable', ...publicActionReport(second.snapshot, second.action) })}\n`,
        );
      } else {
        const data = encodePermissionlessAction(second.action);
        const gas = await publicClient.estimateGas({ account: account.address, to: pool, data });
        const fees = await publicClient.estimateFeesPerGas();
        const maxFeePerGas = fees.maxFeePerGas ?? (await publicClient.getGasPrice());
        if (totalSpend(ledger) + gas * maxFeePerGas > BigInt(ledger.maxTotalSpendWei))
          fail('the action exceeds the committed Sepolia budget.');
        const transactionHash = await walletClient.sendTransaction({
          account,
          to: pool,
          data,
          gas,
          maxFeePerGas,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
        if (receipt.status !== 'success') fail('the selected permissionless action reverted.');
        appendSpend(ledger, {
          sender: account.address,
          transactionHash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed,
          effectiveGasPrice: receipt.effectiveGasPrice,
        });
        process.stdout.write(
          `${JSON.stringify({ mode, iteration, status: 'submitted', action: second.action.kind, transactionHash, blockNumber: receipt.blockNumber.toString() })}\n`,
        );
      }
    }
    if (mode === 'poll' && iteration + 1 < iterations) await delay(intervalSeconds * 1_000);
  }
}

main().catch(() => {
  process.stderr.write('AUT-01 runner failed without submitting a transaction.\n');
  process.exitCode = 1;
});
