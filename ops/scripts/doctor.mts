import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EXPECTED_CHAIN_ID = '0xaa36a7';
const EXPECTED_NODE_VERSION = 'v24.18.0';
const EXPECTED_NPM_VERSION = '11.16.0';
const NOX_COMPUTE_ADDRESS = '0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF';
const MISSING_RUNTIME_PROBE_ADDRESS = '0x0000000000000000000000000000000000000001';
const PUBLIC_SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

interface RpcReply {
  id: number;
  result?: unknown;
}

function fail(message: string): never {
  throw new Error(message);
}

function npmVersion(): string {
  const npmCli = resolve(process.execPath, '../../lib/node_modules/npm/bin/npm-cli.js');
  const output = process
    .getBuiltinModule('child_process')
    ?.execFileSync(process.execPath, [npmCli, '--version'], { encoding: 'utf8' });

  if (typeof output !== 'string') {
    fail('npm could not be executed by the active Node runtime.');
  }

  return output.trim();
}

function rootPackage(): { devDependencies: Record<string, string> } {
  const path = resolve('package.json');
  return JSON.parse(readFileSync(path, 'utf8')) as { devDependencies: Record<string, string> };
}

async function rpcPreflight(
  rpcUrl: string,
  noxComputeAddress = NOX_COMPUTE_ADDRESS,
): Promise<{ chainId: string; runtimeByteLength: number }> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify([
      { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] },
      { jsonrpc: '2.0', id: 2, method: 'eth_getCode', params: [noxComputeAddress, 'latest'] },
    ]),
  });

  if (!response.ok) {
    fail('The configured Sepolia RPC did not return a successful response.');
  }

  const replies = (await response.json()) as unknown;
  if (!Array.isArray(replies)) {
    fail('The configured Sepolia RPC returned an invalid response shape.');
  }

  const byId = new Map<number, RpcReply>();
  for (const reply of replies) {
    if (reply !== null && typeof reply === 'object' && typeof (reply as RpcReply).id === 'number') {
      byId.set((reply as RpcReply).id, reply as RpcReply);
    }
  }

  const chainId = byId.get(1)?.result;
  const runtimeCode = byId.get(2)?.result;
  if (typeof chainId !== 'string' || chainId.toLowerCase() !== EXPECTED_CHAIN_ID) {
    fail('The configured RPC is not Ethereum Sepolia.');
  }
  if (
    typeof runtimeCode !== 'string' ||
    !/^0x[0-9a-fA-F]+$/.test(runtimeCode) ||
    runtimeCode === '0x'
  ) {
    fail('The configured NoxCompute address has no runtime code on Sepolia.');
  }

  return { chainId, runtimeByteLength: (runtimeCode.length - 2) / 2 };
}

async function main(): Promise<void> {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }

  if (process.version !== EXPECTED_NODE_VERSION) {
    fail(`Expected Node ${EXPECTED_NODE_VERSION}.`);
  }
  if (npmVersion() !== EXPECTED_NPM_VERSION) {
    fail(`Expected npm ${EXPECTED_NPM_VERSION}.`);
  }

  const requireConfiguredRpc = process.argv.includes('--require-configured-rpc');
  const assertMissingRuntime = process.argv.includes('--assert-missing-nox-runtime');
  const configuredRpc = process.env.SEPOLIA_RPC_URL;
  if (requireConfiguredRpc && !configuredRpc) {
    fail('SEPOLIA_RPC_URL is required for this preflight mode.');
  }

  const packageJson = rootPackage();
  const rpcSource = configuredRpc ? 'configured' : 'public-fallback';
  const rpcUrl = configuredRpc || PUBLIC_SEPOLIA_RPC;
  const rpc = await rpcPreflight(rpcUrl);
  const ledgerPath = resolve('evidence/sepolia/spend-ledger.json');
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) as { entries?: unknown[] };

  if (!Array.isArray(ledger.entries)) {
    fail('The Sepolia spend ledger is invalid.');
  }

  if (assertMissingRuntime) {
    try {
      await rpcPreflight(rpcUrl, MISSING_RUNTIME_PROBE_ADDRESS);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'The configured NoxCompute address has no runtime code on Sepolia.'
      ) {
        console.log(
          JSON.stringify({
            chainId: Number.parseInt(rpc.chainId, 16),
            negativeCase: 'missing-nox-runtime',
            result: 'rejected-by-shared-runtime-preflight',
            status: 'passed',
          }),
        );
        return;
      }
      throw error;
    }
    fail('The missing-runtime Sepolia probe unexpectedly reported runtime code.');
  }

  console.log(
    JSON.stringify({
      node: process.version,
      npm: npmVersion(),
      workspace: 'npm',
      noxPackages: {
        protocol: packageJson.devDependencies['@iexec-nox/nox-protocol-contracts'],
        confidential: packageJson.devDependencies['@iexec-nox/nox-confidential-contracts'],
        handle: packageJson.devDependencies['@iexec-nox/handle'],
      },
      sepolia: {
        chainId: Number.parseInt(rpc.chainId, 16),
        rpcSource,
        noxComputeAddress: NOX_COMPUTE_ADDRESS,
        noxComputeRuntimeByteLength: rpc.runtimeByteLength,
      },
      spendLedgerEntries: ledger.entries.length,
      status: 'ready-for-read-only-preflight',
    }),
  );
}

main().catch(() => {
  console.error('doctor failed: a required public preflight check did not pass.');
  process.exitCode = 1;
});
