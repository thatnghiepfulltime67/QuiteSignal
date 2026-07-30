import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { isAddress, type Address } from 'viem';

import { parseManifest } from '@quitesignal/verifier';

import {
  createSepoliaReadClient,
  publicActionReport,
  readPublicPoolSnapshot,
  selectPublicPoolAction,
} from '../src/runner.js';

const repositoryRoot = resolve(import.meta.dirname, '../../..');

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
  if (!['dry-run', 'health'].includes(mode)) {
    fail('this runner slice supports only --mode=dry-run or --mode=health.');
  }
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) fail('SEPOLIA_RPC_URL is required.');
  const snapshot = await readPublicPoolSnapshot(
    createSepoliaReadClient(rpcUrl),
    poolFromArguments(),
  );
  const action = selectPublicPoolAction(snapshot);
  process.stdout.write(`${JSON.stringify({ mode, ...publicActionReport(snapshot, action) })}\n`);
}

main().catch(() => {
  process.stderr.write('AUT-01 runner failed without submitting a transaction.\n');
  process.exitCode = 1;
});
