import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';

import { parseManifest } from './manifest.js';
import { verifyManifest, type ReadOnlyClient } from './verify.js';

const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));

function fail(message: string): never {
  throw new Error(message);
}

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main(): Promise<void> {
  const manifestPath = argument('manifest');
  if (!manifestPath) fail('Specify --manifest=<path>.');
  const envPath = resolve(ROOT, '.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) fail('SEPOLIA_RPC_URL is required for read-only verification.');
  const manifest = parseManifest(JSON.parse(readFileSync(resolve(ROOT, manifestPath), 'utf8')));
  const client = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
  });
  const report = await verifyManifest(client as unknown as ReadOnlyClient, manifest);
  const output = `${JSON.stringify(report, null, 2)}\n`;
  const outputPath = argument('out');
  if (outputPath) writeFileSync(resolve(ROOT, outputPath), output);
  process.stdout.write(output);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Public verifier failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`,
  );
  process.exitCode = 1;
});
