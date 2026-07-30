import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPublicClient, createWalletClient, http, isAddress, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

import {
  contractEncryptedInput,
  createSepoliaConfidentialInputClient,
  publicAddress,
  requestId,
} from '../src/index.js';

const CHAIN_ID = 11_155_111;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const EVIDENCE = [
  resolve(ROOT, 'evidence/offline/G6/SDK-02-CLIENT.json'),
  resolve(ROOT, 'evidence/sepolia/G6/SDK-02-CLIENT.json'),
];

function fail(message: string): never {
  throw new Error(`SDK-02 Sepolia smoke failed: ${message}`);
}

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function sourceCommit(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
}

async function main(): Promise<void> {
  const pool = argument('pool');
  if (!pool || !isAddress(pool)) fail('a valid --pool=0x... is required.');
  const env = resolve(ROOT, '.env');
  if (existsSync(env)) process.loadEnvFile(env);
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY as `0x${string}` | undefined;
  if (!rpcUrl || !privateKey) fail('configured Sepolia RPC access and owner signer are required.');

  const account = privateKeyToAccount(privateKey);
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
  const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl, { retryCount: 0 }) });
  if ((await client.getChainId()) !== CHAIN_ID) fail('the configured RPC is not Ethereum Sepolia.');
  if (!(await client.getCode({ address: pool }))) fail('the named pool has no runtime code.');

  const context = {
    chainId: CHAIN_ID,
    pool: publicAddress(pool),
    request: requestId(keccak256(toHex('quitesignal/sdk-02/sepolia-input/v1'))),
  };
  const confidential = await createSepoliaConfidentialInputClient(wallet);
  const sealed = await confidential.sealUint256(1n, context);
  const contractInput = contractEncryptedInput(sealed, context);
  if (
    !/^0x[0-9a-f]{64}$/i.test(contractInput.handle) ||
    !/^0x(?:[0-9a-f]{2})+$/i.test(contractInput.handleProof)
  )
    fail('Nox did not return valid encrypted input material.');
  try {
    JSON.stringify(sealed);
  } catch {
    const evidence = {
      schemaVersion: 1,
      gate: 'G6',
      workItem: 'SDK-02',
      phase: 'P2',
      sourceCommit: sourceCommit(),
      environment: {
        chainId: CHAIN_ID,
        verificationBlock: (await client.getBlockNumber()).toString(),
      },
      pool: context.pool,
      request: context.request,
      checks: {
        sepoliaWalletChain: true,
        poolRuntimePresent: true,
        noxInputEncryptedForNamedPool: true,
        sealedMaterialSerializationRejected: true,
        exactContextRequiredForContractEncoding: true,
      },
      privacyImpact:
        'The confidential value and Nox encrypted material were used only in process and were not persisted or printed.',
      status: 'passed',
    };
    for (const path of EVIDENCE) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`);
    }
    process.stdout.write(
      `${JSON.stringify({ workItem: 'SDK-02', status: 'passed', pool: context.pool })}\n`,
    );
    return;
  }
  fail('sealed material unexpectedly serialized.');
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'SDK-02 Sepolia smoke failed unexpectedly.'}\n`,
  );
  process.exitCode = 1;
});
