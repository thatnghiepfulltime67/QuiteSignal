import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { createPublicClient, http, keccak256, parseAbi } from 'viem';
import { sepolia } from 'viem/chains';

const EXPECTED_CHAIN_ID = 11_155_111;
const ORACLE_CANDIDATE = '0xfd9e2642a170add10f53ee14a93fcf2f31924944' as const;
const oracleAbi = parseAbi([
  'function finder() view returns (address)',
  'function defaultCurrency() view returns (address)',
  'function defaultIdentifier() view returns (bytes32)',
  'function defaultLiveness() view returns (uint64)',
  'function getMinimumBond(address) view returns (uint256)',
]);

function fail(message: string): never {
  throw new Error(message);
}

async function main(): Promise<void> {
  if (existsSync(resolve('.env'))) process.loadEnvFile('.env');
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) fail('SEPOLIA_RPC_URL is required for the read-only G4 assessment.');

  const publicClient = createPublicClient({
    cacheTime: 0,
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
  });
  if ((await publicClient.getChainId()) !== EXPECTED_CHAIN_ID) {
    fail('The configured RPC is not Ethereum Sepolia.');
  }

  const [runtime, finder, currency, identifier, liveness, verificationBlock] = await Promise.all([
    publicClient.getCode({ address: ORACLE_CANDIDATE }),
    publicClient.readContract({
      address: ORACLE_CANDIDATE,
      abi: oracleAbi,
      functionName: 'finder',
    }),
    publicClient.readContract({
      address: ORACLE_CANDIDATE,
      abi: oracleAbi,
      functionName: 'defaultCurrency',
    }),
    publicClient.readContract({
      address: ORACLE_CANDIDATE,
      abi: oracleAbi,
      functionName: 'defaultIdentifier',
    }),
    publicClient.readContract({
      address: ORACLE_CANDIDATE,
      abi: oracleAbi,
      functionName: 'defaultLiveness',
    }),
    publicClient.getBlockNumber(),
  ]);
  if (!runtime) fail('The public G4 oracle candidate has no Sepolia runtime code.');
  const minimumBond = await publicClient.readContract({
    address: ORACLE_CANDIDATE,
    abi: oracleAbi,
    functionName: 'getMinimumBond',
    args: [currency],
  });

  console.log(
    JSON.stringify({
      chainId: EXPECTED_CHAIN_ID,
      candidate: {
        address: ORACLE_CANDIDATE,
        defaultCurrency: currency,
        defaultIdentifier: identifier,
        defaultLivenessSeconds: liveness.toString(),
        finder,
        minimumBond: minimumBond.toString(),
        runtimeBytecodeHash: keccak256(runtime),
      },
      mode: 'read-only',
      verificationBlock: verificationBlock.toString(),
      status: 'observed',
    }),
  );
}

main().catch(() => {
  console.error(
    'G4 candidate assessment failed: inspect the public target and Sepolia configuration.',
  );
  process.exitCode = 1;
});
