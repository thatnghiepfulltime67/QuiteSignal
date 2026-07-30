import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';

import { parseManifest } from '../src/manifest.js';
import { verifyReleaseManifest } from '../src/verify.js';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const activePath = resolve(root, 'deployments/sepolia/active-release.json');

const epochAbi = [
  {
    type: 'function',
    name: 'epoch',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'tuple',
        components: [{ name: 'state', type: 'uint8' }],
      },
    ],
  },
] as const;

function fail(message: string): never {
  throw new Error(`Release promotion failed: ${message}`);
}

function releaseId(): string {
  const value = process.argv.find((argument) => argument.startsWith('--release='))?.slice(10);
  if (!value || !/^DEP-(?:0[2-9]|[1-9][0-9]*)$/.test(value))
    fail('Specify a new --release=DEP-<integer> revision.');
  return value;
}

function revisionNumber(value: string): number {
  return Number(value.slice(4));
}

async function main(): Promise<void> {
  const release = releaseId();
  if (!process.argv.includes('--write'))
    fail('Pass --write only after reviewing the verifier plan.');
  if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) fail('SEPOLIA_RPC_URL is required for read-only promotion verification.');
  const current = JSON.parse(readFileSync(activePath, 'utf8')) as {
    schemaVersion?: unknown;
    releaseId?: unknown;
  };
  if (
    current.schemaVersion !== 1 ||
    typeof current.releaseId !== 'string' ||
    !/^DEP-(?:0[1-9]|[1-9][0-9]*)$/.test(current.releaseId)
  ) {
    fail('The existing active release pointer is malformed.');
  }
  if (revisionNumber(release) <= revisionNumber(current.releaseId))
    fail('A release promotion must advance the active revision.');
  const manifestPath = resolve(root, 'deployments/sepolia/releases', `${release}.json`);
  if (!existsSync(manifestPath)) fail(`The ${release} manifest does not exist.`);
  const manifest = parseManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
  if (manifest.canonicalDeployment?.workItemId !== release)
    fail('The release manifest work item does not match the requested revision.');
  const client = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
  });
  await verifyReleaseManifest(client as never, manifest);
  const pool = manifest.pools[0];
  if (!pool) fail('The release manifest has no pool.');
  const epoch = (await client.readContract({
    address: pool.address,
    abi: epochAbi,
    functionName: 'epoch',
  })) as { state: number };
  if (epoch.state !== 0) fail('The release pool is not currently OPEN.');
  writeFileSync(
    activePath,
    `${JSON.stringify(
      { schemaVersion: 1, releaseId: release, manifestPath: `/releases/${release}.json` },
      null,
      2,
    )}\n`,
    { encoding: 'utf8' },
  );
  process.stdout.write(`${JSON.stringify({ status: 'promoted', release })}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Release promotion failed.'}\n`);
  process.exitCode = 1;
});
