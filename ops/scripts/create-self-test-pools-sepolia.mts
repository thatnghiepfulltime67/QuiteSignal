import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import adapterArtifact from '../../modules/protocol/artifacts/contracts/adapters/ChainlinkPriceFeedResolutionAdapter.sol/ChainlinkPriceFeedResolutionAdapter.json' with { type: 'json' };
import {
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  encodeFunctionData,
  http,
  keccak256,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { createViemProtocolPublicReader, publicAddress } from '@quitesignal/confidential-client';

const WORK_ITEM_ID = 'WEB-15-POOLS';
const PHASE = 'P2';
const COMMIT_TIMEOUT_SECONDS = 60n;
const AGGREGATE_TIMEOUT_SECONDS = 600n;
const RESOLUTION_GRACE_SECONDS = 600n;
const MAXIMUM_FEED_AGE_SECONDS = 86_400n;
const MAX_POOL_GAS = 3_000_000n;

const policies = [
  ['greater-or-equal', '150000000000', 15, 2],
  ['greater-or-equal', '200000000000', 20, 2],
  ['greater-or-equal', '250000000000', 25, 3],
  ['greater-or-equal', '300000000000', 30, 3],
  ['greater-or-equal', '350000000000', 35, 4],
  ['less-than', '200000000000', 45, 4],
  ['less-than', '250000000000', 60, 5],
  ['less-than', '300000000000', 75, 5],
  ['less-than', '350000000000', 90, 6],
  ['less-than', '400000000000', 120, 6],
] as const;

const factoryAbi = [
  {
    type: 'function', name: 'poolIdFor', stateMutability: 'view',
    inputs: [{ name: 'config_', type: 'tuple', components: [
      { name: 'confidentialCollateral', type: 'address' }, { name: 'resolutionAdapter', type: 'address' },
      { name: 'deadline', type: 'uint64' }, { name: 'commitTimeout', type: 'uint64' },
      { name: 'kMin', type: 'uint32' }, { name: 'aggregateTimeout', type: 'uint64' },
      { name: 'resolutionGrace', type: 'uint64' },
    ] }, { name: 'deploymentSalt', type: 'bytes32' }], outputs: [{ name: 'poolId', type: 'bytes32' }],
  },
  {
    type: 'function', name: 'poolOf', stateMutability: 'view',
    inputs: [{ name: 'poolId_', type: 'bytes32' }], outputs: [{ name: 'pool', type: 'address' }],
  },
  {
    type: 'function', name: 'createPool', stateMutability: 'nonpayable',
    inputs: [{ name: 'config_', type: 'tuple', components: [
      { name: 'confidentialCollateral', type: 'address' }, { name: 'resolutionAdapter', type: 'address' },
      { name: 'deadline', type: 'uint64' }, { name: 'commitTimeout', type: 'uint64' },
      { name: 'kMin', type: 'uint32' }, { name: 'aggregateTimeout', type: 'uint64' },
      { name: 'resolutionGrace', type: 'uint64' },
    ] }, { name: 'deploymentSalt', type: 'bytes32' }], outputs: [{ name: 'pool', type: 'address' }],
  },
] as const;

interface LedgerEntry {
  workItemId: string; phase: string; sender: string; transactionHash: string; blockNumber: string;
  gasUsed: string; effectiveGasPrice: string; actualGasCostWei: string; sourceCommit: string; timestampUtc: string;
}
interface Ledger { schemaVersion: 1; chainId: 11155111; maxTotalSpendWei: string; entries: LedgerEntry[]; }
interface RegistryRecord { poolAddress: string; policy: { comparison: string; threshold: string; minutes: number; gate: number }; startedAt: string; }

function fail(message: string): never { throw new Error(message); }
function totalSpend(ledger: Ledger): bigint { return ledger.entries.reduce((sum, entry) => sum + BigInt(entry.actualGasCostWei), 0n); }
function loadLedger(path: string): Ledger {
  const ledger = JSON.parse(readFileSync(path, 'utf8')) as Ledger;
  if (ledger.schemaVersion !== 1 || ledger.chainId !== 11155111 || !Array.isArray(ledger.entries)) fail('The Sepolia spend ledger is invalid.');
  return ledger;
}
function appendSpend(ledgerPath: string, ledger: Ledger, entry: LedgerEntry): void {
  ledger.entries.push(entry);
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
}
function policyLabel(comparison: string, threshold: string): string {
  const value = BigInt(threshold);
  const whole = value / 100_000_000n;
  const fraction = (value % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return `ETH/USD ${comparison === 'greater-or-equal' ? '≥' : '<'} $${whole}${fraction ? `.${fraction}` : ''}`;
}

async function main(): Promise<void> {
  process.loadEnvFile('.env');
  const write = process.argv.includes('--write');
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY as Hex | undefined;
  if (!rpcUrl || !privateKey) fail('Sepolia RPC and deployer configuration are required.');
  if (write && process.env.CONFIRM_SEPOLIA_WRITE !== 'yes') fail('CONFIRM_SEPOLIA_WRITE=yes is required for a Sepolia write.');

  const deployment = JSON.parse(readFileSync('deployments/sepolia/releases/DEP-02.json', 'utf8')) as {
    deployment: { configuration: { feed: string } };
    contracts: Array<{ id: string; address: string; runtimeCodeHash: string }>;
  };
  const contract = (id: string) => {
    const value = deployment.contracts.find((item) => item.id === id);
    if (!value) fail(`The ${id} deployment record is unavailable.`);
    return value;
  };
  const factory = contract('factory');
  const collateral = contract('wrapper');
  const feed = deployment.deployment.configuration.feed as Address;
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
  const [chainId, factoryCode, collateralCode, feedCode, balance, fees] = await Promise.all([
    publicClient.getChainId(), publicClient.getCode({ address: factory.address as Address }),
    publicClient.getCode({ address: collateral.address as Address }), publicClient.getCode({ address: feed }),
    publicClient.getBalance({ address: account.address }), publicClient.estimateFeesPerGas(),
  ]);
  if (chainId !== 11155111) fail('The configured RPC is not Ethereum Sepolia.');
  if (!factoryCode || keccak256(factoryCode) !== factory.runtimeCodeHash) fail('The factory runtime does not match the deployment record.');
  if (!collateralCode || collateralCode === '0x' || !feedCode || feedCode === '0x') fail('The wrapper or feed has no Sepolia runtime.');
  const maxFeePerGas = fees.maxFeePerGas ?? (await publicClient.getGasPrice());
  const maxPriorityFeePerGas = fees.maxPriorityFeePerGas ?? 0n;
  const ledgerPath = resolve('evidence/sepolia/spend-ledger.json');
  const ledger = loadLedger(ledgerPath);
  const remaining = BigInt(ledger.maxTotalSpendWei) - totalSpend(ledger);
  if (balance === 0n) fail('The configured deployer has no Sepolia ETH.');

  if (!write) {
    console.log(JSON.stringify({ workItemId: WORK_ITEM_ID, action: 'dry-run', poolCount: policies.length, transactions: policies.length * 2, remainingBudgetWei: remaining.toString(), deployerBalanceWei: balance.toString(), maximumFeePerGas: maxFeePerGas.toString(), conservativePoolGasLimit: MAX_POOL_GAS.toString() }));
    return;
  }

  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const registryPath = resolve('deployments/sepolia/verified-self-test-pools.json');
  const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as RegistryRecord[];
  const created: Array<{ poolAddress: string; adapterAddress: string; adapterTransactionHash: string; poolTransactionHash: string; policy: RegistryRecord['policy']; startedAt: string }> = [];
  const send = async (id: string, request: { data: Hex; to?: Address }) => {
    const gas = await publicClient.estimateGas({ account: account.address, data: request.data, to: request.to });
    const maximumCost = gas * maxFeePerGas;
    if (totalSpend(ledger) + maximumCost > BigInt(ledger.maxTotalSpendWei)) fail(`${id} exceeds the remaining Sepolia budget.`);
    const hash = await walletClient.sendTransaction({ account, chain: sepolia, data: request.data, to: request.to, gas, maxFeePerGas, maxPriorityFeePerGas });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') fail(`${id} was not confirmed successfully.`);
    appendSpend(ledgerPath, ledger, { workItemId: WORK_ITEM_ID, phase: PHASE, sender: account.address, transactionHash: hash, blockNumber: receipt.blockNumber.toString(), gasUsed: receipt.gasUsed.toString(), effectiveGasPrice: receipt.effectiveGasPrice.toString(), actualGasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(), sourceCommit, timestampUtc: new Date().toISOString() });
    return receipt;
  };

  for (const [index, [comparison, threshold, minutes, gate]] of policies.entries()) {
    const block = await publicClient.getBlock();
    const startedAt = block.timestamp;
    const deadline = startedAt + BigInt(minutes * 60);
    const observationNotBefore = deadline + RESOLUTION_GRACE_SECONDS;
    const adapterData = encodeDeployData({ abi: adapterArtifact.abi, bytecode: adapterArtifact.bytecode as Hex, args: [feed, comparison === 'greater-or-equal', BigInt(threshold), observationNotBefore, MAXIMUM_FEED_AGE_SECONDS] });
    const adapterReceipt = await send(`pool-${index + 1}-adapter`, { data: adapterData });
    const adapter = adapterReceipt.contractAddress;
    if (!adapter) fail(`Pool ${index + 1} adapter deployment did not return an address.`);
    const config = { confidentialCollateral: collateral.address as Address, resolutionAdapter: adapter, deadline, commitTimeout: COMMIT_TIMEOUT_SECONDS, kMin: gate, aggregateTimeout: AGGREGATE_TIMEOUT_SECONDS, resolutionGrace: RESOLUTION_GRACE_SECONDS } as const;
    const salt = `0x${randomBytes(32).toString('hex')}` as Hex;
    const poolId = await publicClient.readContract({ address: factory.address as Address, abi: factoryAbi, functionName: 'poolIdFor', args: [config, salt] });
    const poolData = encodeFunctionData({ abi: factoryAbi, functionName: 'createPool', args: [config, salt] });
    await send(`pool-${index + 1}-factory`, { to: factory.address as Address, data: poolData });
    const pool = await publicClient.readContract({ address: factory.address as Address, abi: factoryAbi, functionName: 'poolOf', args: [poolId] });
    if (/^0x0{40}$/i.test(pool)) fail(`Pool ${index + 1} is absent from the factory after confirmation.`);
    const verified = await createViemProtocolPublicReader(publicClient).readConfig(publicAddress(pool));
    if (verified.confidentialCollateral.toLowerCase() !== collateral.address.toLowerCase() || verified.resolutionAdapter.toLowerCase() !== adapter.toLowerCase() || verified.deadline !== deadline || verified.kMin !== gate) fail(`Pool ${index + 1} configuration did not verify.`);
    const record = { poolAddress: pool, policy: { comparison, threshold, minutes, gate }, startedAt: startedAt.toString() };
    if (!registry.some((known) => known.poolAddress.toLowerCase() === pool.toLowerCase())) registry.push(record);
    writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    created.push({ ...record, adapterAddress: adapter, adapterTransactionHash: adapterReceipt.transactionHash, poolTransactionHash: ledger.entries.at(-1)?.transactionHash ?? '', policy: record.policy });
    console.log(JSON.stringify({ status: 'verified', index: index + 1, condition: policyLabel(comparison, threshold), poolAddress: pool }));
  }
  writeFileSync(resolve('evidence/sepolia/WEB-15-POOLS.json'), `${JSON.stringify({ workItemId: WORK_ITEM_ID, chainId: 11155111, createdAtUtc: new Date().toISOString(), pools: created }, null, 2)}\n`);
  console.log(JSON.stringify({ status: 'complete', poolCount: created.length, remainingBudgetWei: (BigInt(ledger.maxTotalSpendWei) - totalSpend(ledger)).toString() }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Verified pool creation failed.');
  process.exitCode = 1;
});
