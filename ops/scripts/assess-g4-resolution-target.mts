import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { createPublicClient, http, keccak256, parseAbi } from 'viem';
import { sepolia } from 'viem/chains';

const EXPECTED_CHAIN_ID = 11_155_111;
const ETH_USD_FEED = '0x694AA1769357215DE4FAC081bf1f309aDC325306' as const;
const EXPECTED_DECIMALS = 8;
const EXPECTED_DESCRIPTION = 'ETH / USD';

const aggregatorV3Abi = parseAbi([
  'function aggregator() view returns (address)',
  'function decimals() view returns (uint8)',
  'function description() view returns (string)',
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
]);

function fail(message: string): never {
  throw new Error(message);
}

function asPublicMetadata(value: bigint | number | string): string | number {
  return typeof value === 'bigint' ? value.toString() : value;
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

  const [runtime, decimals, description, round, block, verificationBlock] = await Promise.all([
    publicClient.getCode({ address: ETH_USD_FEED }),
    publicClient.readContract({
      address: ETH_USD_FEED,
      abi: aggregatorV3Abi,
      functionName: 'decimals',
    }),
    publicClient.readContract({
      address: ETH_USD_FEED,
      abi: aggregatorV3Abi,
      functionName: 'description',
    }),
    publicClient.readContract({
      address: ETH_USD_FEED,
      abi: aggregatorV3Abi,
      functionName: 'latestRoundData',
    }),
    publicClient.getBlock(),
    publicClient.getBlockNumber(),
  ]);
  if (!runtime) fail('The selected Sepolia ETH/USD feed has no runtime code.');
  if (decimals !== EXPECTED_DECIMALS) {
    fail('The selected Sepolia feed has unexpected decimals.');
  }
  if (description !== EXPECTED_DESCRIPTION) {
    fail('The selected Sepolia feed has an unexpected description.');
  }

  const [roundId, answer, startedAt, updatedAt, answeredInRound] = round;
  if (answer <= 0n) fail('The selected Sepolia feed has a non-positive answer.');
  if (roundId === 0n || startedAt === 0n || updatedAt === 0n) {
    fail('The selected Sepolia feed has an incomplete current round.');
  }
  if (answeredInRound < roundId) {
    fail('The selected Sepolia feed has an incomplete answered-in-round value.');
  }
  if (updatedAt > block.timestamp) {
    fail('The selected Sepolia feed has an update timestamp in the future.');
  }

  const aggregator = await publicClient.readContract({
    address: ETH_USD_FEED,
    abi: aggregatorV3Abi,
    functionName: 'aggregator',
  });
  const aggregatorRuntime = await publicClient.getCode({ address: aggregator });
  if (!aggregatorRuntime) fail('The selected Sepolia feed aggregator has no runtime code.');

  console.log(
    JSON.stringify({
      chainId: EXPECTED_CHAIN_ID,
      candidate: {
        address: ETH_USD_FEED,
        aggregator,
        decimals,
        description,
        runtimeBytecodeHash: keccak256(runtime),
        aggregatorRuntimeBytecodeHash: keccak256(aggregatorRuntime),
      },
      latestRound: {
        roundId: asPublicMetadata(roundId),
        answer: asPublicMetadata(answer),
        startedAt: asPublicMetadata(startedAt),
        updatedAt: asPublicMetadata(updatedAt),
        answeredInRound: asPublicMetadata(answeredInRound),
        ageSeconds: asPublicMetadata(block.timestamp - updatedAt),
      },
      mode: 'read-only',
      verificationBlock: verificationBlock.toString(),
      status: 'observed',
    }),
  );
}

main().catch(() => {
  console.error(
    'G4 resolution-target assessment failed: inspect the public target and Sepolia configuration.',
  );
  process.exitCode = 1;
});
