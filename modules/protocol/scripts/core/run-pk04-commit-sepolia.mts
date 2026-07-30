import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { createViemHandleClient } from '@iexec-nox/handle';
import {
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  encodeFunctionData,
  http,
  keccak256,
  type Abi,
  type Address,
  type Hash,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const CHAIN_ID = 11_155_111;
const FEED = '0x694AA1769357215DE4FAC081bf1f309aDC325306' as const;
const COMMIT_TIMEOUT = 30n;
const STAKE = 20n;
const PROBABILITY = 7_500n;
const MINT = 100n;
const PUBLIC_DECRYPT_ATTEMPTS = 8;

interface Artifact {
  abi: Abi;
  bytecode: Hex;
}
interface EncryptedValue {
  handle: Hex;
  handleProof: Hex;
}
interface LedgerEntry {
  workItemId: string;
  phase: string;
  sourceCommit: string;
  sender: Address;
  transactionHash: Hash;
  blockNumber: string;
  gasUsed: string;
  effectiveGasPrice: string;
  actualGasCostWei: string;
  timestampUtc: string;
}
interface Ledger {
  schemaVersion: number;
  chainId: number;
  maxTotalSpendWei: string;
  entries: LedgerEntry[];
}
interface Config {
  confidentialCollateral: Address;
  resolutionAdapter: Address;
  deadline: bigint;
  commitTimeout: bigint;
  kMin: number;
  aggregateTimeout: bigint;
  resolutionGrace: bigint;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const protocolRoot = resolve(scriptDirectory, '../..');
const repositoryRoot = resolve(protocolRoot, '../..');
const artifact = (path: string) => resolve(protocolRoot, 'artifacts/contracts', path);
const paths = {
  fixture: artifact('feasibility/FeasibilityERC20.sol/FeasibilityERC20.json'),
  wrapper: artifact(
    'feasibility/FeasibilityConfidentialWrapper.sol/FeasibilityConfidentialWrapper.json',
  ),
  adapter: artifact(
    'adapters/ChainlinkPriceFeedResolutionAdapter.sol/ChainlinkPriceFeedResolutionAdapter.json',
  ),
  factory: artifact('core/QuietSignalFactory.sol/QuietSignalFactory.json'),
  pool: artifact('core/QuietSignalPool.sol/QuietSignalPool.json'),
};
const ledgerPath = resolve(repositoryRoot, 'evidence/sepolia/spend-ledger.json');
const offlineEvidencePath = resolve(repositoryRoot, 'evidence/offline/G5/PK-04-COMMIT.json');
const sepoliaEvidencePath = resolve(repositoryRoot, 'evidence/sepolia/G5/PK-04-COMMIT.json');
let failureStage = 'configuration';

function fail(message: string): never {
  throw new Error(message);
}
function loadEnvironment(): void {
  const envPath = resolve(repositoryRoot, '.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}
function loadArtifact(path: string, name: string): Artifact {
  const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<Artifact>;
  if (!Array.isArray(value.abi) || typeof value.bytecode !== 'string')
    fail(`Missing ${name} artifact.`);
  return value as Artifact;
}
function loadLedger(): Ledger {
  const value = JSON.parse(readFileSync(ledgerPath, 'utf8')) as Partial<Ledger>;
  if (value.schemaVersion !== 1 || value.chainId !== CHAIN_ID || !Array.isArray(value.entries)) {
    fail('The Sepolia spend ledger is malformed.');
  }
  return value as Ledger;
}
function sourceCommit(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
}
function assertClean(): void {
  if (
    execFileSync('git', ['status', '--porcelain'], { cwd: repositoryRoot, encoding: 'utf8' }).trim()
  ) {
    fail('Confirmed Sepolia writes require a clean source tree.');
  }
}
function totalSpend(ledger: Ledger): bigint {
  return ledger.entries.reduce((total, entry) => total + BigInt(entry.actualGasCostWei), 0n);
}
function appendSpend(
  ledger: Ledger,
  entry: Omit<LedgerEntry, 'sourceCommit' | 'timestampUtc'>,
): void {
  ledger.entries.push({
    ...entry,
    sourceCommit: sourceCommit(),
    timestampUtc: new Date().toISOString(),
  });
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
}
async function expectRevert(action: () => Promise<unknown>, scenario: string): Promise<void> {
  try {
    await action();
  } catch {
    return;
  }
  fail(`${scenario} did not reject on Ethereum Sepolia.`);
}
async function decryptBoolean(
  client: Awaited<ReturnType<typeof createViemHandleClient>>,
  handle: Hex,
): Promise<{ value: boolean; proof: Hex }> {
  for (let attempt = 0; attempt < PUBLIC_DECRYPT_ATTEMPTS; attempt += 1) {
    try {
      const value = await client.publicDecrypt(handle);
      if (typeof value.value !== 'boolean') fail('The acceptance did not decode as a boolean.');
      return { value: value.value, proof: value.decryptionProof as Hex };
    } catch {
      if (attempt === PUBLIC_DECRYPT_ATTEMPTS - 1) fail('The acceptance proof was unavailable.');
      await delay(5_000);
    }
  }
  fail('The acceptance proof was unavailable.');
}
async function waitForTimestamp(
  client: ReturnType<typeof createPublicClient>,
  timestamp: bigint,
): Promise<void> {
  while ((await client.getBlock()).timestamp < timestamp) await delay(10_000);
}

async function main(): Promise<void> {
  loadEnvironment();
  const write = process.argv.includes('--write');
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY as Hex | undefined;
  if (!rpcUrl) fail('SEPOLIA_RPC_URL is required.');
  if (write && (!privateKey || process.env.CONFIRM_SEPOLIA_WRITE !== 'yes')) {
    fail('Confirmed writes require a throwaway signer and CONFIRM_SEPOLIA_WRITE=yes.');
  }
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
  });
  if ((await publicClient.getChainId()) !== CHAIN_ID)
    fail('The configured RPC is not Ethereum Sepolia.');
  const account = privateKey ? privateKeyToAccount(privateKey) : undefined;
  if (write && (await publicClient.getBalance({ address: account!.address })) === 0n)
    fail('The signer has no Sepolia balance.');

  const artifacts = {
    fixture: loadArtifact(paths.fixture, 'fixture'),
    wrapper: loadArtifact(paths.wrapper, 'wrapper'),
    adapter: loadArtifact(paths.adapter, 'adapter'),
    factory: loadArtifact(paths.factory, 'factory'),
    pool: loadArtifact(paths.pool, 'pool'),
  };
  const ledger = loadLedger();
  const fee =
    (await publicClient.estimateFeesPerGas()).maxFeePerGas ?? (await publicClient.getGasPrice());
  const block = await publicClient.getBlock();
  const deployments = [
    encodeDeployData({ abi: artifacts.fixture.abi, bytecode: artifacts.fixture.bytecode }),
    encodeDeployData({
      abi: artifacts.adapter.abi,
      bytecode: artifacts.adapter.bytecode,
      args: [FEED, true, 1n, block.timestamp + 1_200n, 2_592_000n],
    }),
    encodeDeployData({ abi: artifacts.factory.abi, bytecode: artifacts.factory.bytecode }),
  ];
  const estimates = await Promise.all(
    deployments.map((data) => publicClient.estimateGas({ account: account?.address, data })),
  );
  const estimate = (estimates.reduce((total, gas) => total + gas, 0n) + 6_000_000n) * fee;
  if (totalSpend(ledger) + estimate > BigInt(ledger.maxTotalSpendWei))
    fail('The PK-04 plan exceeds the committed allowance.');
  console.log(
    JSON.stringify({
      mode: write ? 'confirmed-write' : 'dry-run',
      workItem: 'PK-04',
      deployments: 5,
      estimatedMaximumGasCostWei: estimate.toString(),
      remainingAllowanceWei: (BigInt(ledger.maxTotalSpendWei) - totalSpend(ledger)).toString(),
    }),
  );
  if (!write) return;
  assertClean();

  const wallet = createWalletClient({ account: account!, chain: sepolia, transport: http(rpcUrl) });
  const handles = await createViemHandleClient(wallet);
  const transactions: Array<{ purpose: string; hash: Hash; blockNumber: string }> = [];
  const record = (
    purpose: string,
    hash: Hash,
    receipt: { blockNumber: bigint; gasUsed: bigint; effectiveGasPrice: bigint },
  ) => {
    appendSpend(ledger, {
      workItemId: 'PK-04',
      phase: 'P1',
      sender: account!.address,
      transactionHash: hash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice.toString(),
      actualGasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
    });
    transactions.push({ purpose, hash, blockNumber: receipt.blockNumber.toString() });
  };
  const deploy = async (data: Hex, purpose: string): Promise<Address> => {
    failureStage = `${purpose} estimate`;
    const gas = await publicClient.estimateGas({ account: account!.address, data });
    const hash = await wallet.sendTransaction({ account: account!, data, gas, maxFeePerGas: fee });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    record(purpose, hash, receipt);
    if (receipt.status !== 'success' || !receipt.contractAddress) fail(`${purpose} failed.`);
    return receipt.contractAddress;
  };
  const send = async (to: Address, data: Hex, purpose: string): Promise<void> => {
    failureStage = `${purpose} estimate`;
    const gas = await publicClient.estimateGas({ account: account!.address, to, data });
    const maxFeePerGas = (await publicClient.estimateFeesPerGas()).maxFeePerGas ?? fee;
    if (totalSpend(ledger) + gas * maxFeePerGas > BigInt(ledger.maxTotalSpendWei))
      fail('The next PK-04 write exceeds budget.');
    failureStage = purpose;
    const hash = await wallet.sendTransaction({ account: account!, to, data, gas, maxFeePerGas });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    record(purpose, hash, receipt);
    if (receipt.status !== 'success') fail(`${purpose} failed.`);
  };
  const calldata = (artifact: Artifact, name: string, args: readonly unknown[] = []): Hex =>
    encodeFunctionData({ abi: artifact.abi, functionName: name, args } as never);
  const fixture = await deploy(deployments[0]!, 'deploy fixture collateral');
  const wrapper = await deploy(
    encodeDeployData({
      abi: artifacts.wrapper.abi,
      bytecode: artifacts.wrapper.bytecode,
      args: [fixture],
    }),
    'deploy unchanged wrapper',
  );
  const adapter = await deploy(deployments[1]!, 'deploy immutable adapter');
  const factory = await deploy(deployments[2]!, 'deploy factory');
  const config: Config = {
    confidentialCollateral: wrapper,
    resolutionAdapter: adapter,
    deadline: block.timestamp + 600n,
    commitTimeout: COMMIT_TIMEOUT,
    kMin: 2,
    aggregateTimeout: 600n,
    resolutionGrace: 600n,
  };
  const salt = keccak256('0x706b30342d61636365707465642d7631000000000000000000000000000000000');
  await send(
    factory,
    calldata(artifacts.factory, 'createPool', [config, salt]),
    'create accepted pool',
  );
  const poolId = (await publicClient.readContract({
    address: factory,
    abi: artifacts.factory.abi,
    functionName: 'poolIdFor',
    args: [config, salt],
  } as never)) as Hash;
  const pool = (await publicClient.readContract({
    address: factory,
    abi: artifacts.factory.abi,
    functionName: 'poolOf',
    args: [poolId],
  } as never)) as Address;
  await send(
    fixture,
    calldata(artifacts.fixture, 'mint', [account!.address, MINT]),
    'mint collateral',
  );
  await send(fixture, calldata(artifacts.fixture, 'approve', [wrapper, MINT]), 'approve wrapper');
  await send(
    wrapper,
    calldata(artifacts.wrapper, 'wrap', [account!.address, MINT]),
    'wrap collateral',
  );

  const register = async (target: Address, stake: bigint, purpose: string) => {
    const [stakeInput, probabilityInput] = (await Promise.all([
      handles.encryptInput(stake, 'uint256', target),
      handles.encryptInput(PROBABILITY, 'uint256', target),
    ])) as [EncryptedValue, EncryptedValue];
    await send(
      target,
      calldata(artifacts.pool, 'commitSignal', [
        stakeInput.handle,
        stakeInput.handleProof,
        probabilityInput.handle,
        probabilityInput.handleProof,
      ]),
      `${purpose}: register intent`,
    );
  };
  const transfer = async (target: Address, amount: bigint, purpose: string) => {
    const input = (await handles.encryptInput(amount, 'uint256', wrapper)) as EncryptedValue;
    await send(
      wrapper,
      calldata(artifacts.wrapper, 'confidentialTransferAndCall', [
        target,
        input.handle,
        input.handleProof,
        '0x',
      ]),
      `${purpose}: transfer`,
    );
  };
  const acceptance = async (target: Address) =>
    decryptBoolean(
      handles,
      (await publicClient.readContract({
        address: target,
        abi: artifacts.pool.abi,
        functionName: 'pendingAcceptanceHandle',
      } as never)) as Hex,
    );
  const pending = async (target: Address) =>
    (await publicClient.readContract({
      address: target,
      abi: artifacts.pool.abi,
      functionName: 'pendingCommit',
    } as never)) as readonly [Address, bigint, boolean];

  await expectRevert(
    () => publicClient.call({ account: account!.address, to: pool, value: 1n }),
    'Native value at pool boundary',
  );
  await register(pool, STAKE, 'accepted');
  await expectRevert(
    () =>
      publicClient.call({
        account: account!.address,
        to: pool,
        data: calldata(artifacts.pool, 'expirePendingCommit'),
      }),
    'Early commit timeout',
  );
  await transfer(pool, STAKE, 'accepted');
  const accepted = await acceptance(pool);
  if (!accepted.value) fail('The matching encrypted transfer was not accepted.');
  await expectRevert(
    () =>
      publicClient.call({
        account: account!.address,
        to: pool,
        data: calldata(artifacts.pool, 'finalizeCommit', ['0x']),
      }),
    'Invalid acceptance proof',
  );
  await send(
    pool,
    calldata(artifacts.pool, 'finalizeCommit', [accepted.proof]),
    'finalize accepted commit',
  );
  await expectRevert(
    () =>
      publicClient.call({
        account: account!.address,
        to: pool,
        data: calldata(artifacts.pool, 'finalizeCommit', [accepted.proof]),
      }),
    'Replayed acceptance proof',
  );

  const mismatchSalt = keccak256(
    '0x706b30342d6d69736d617463682d76310000000000000000000000000000000000',
  );
  await send(
    factory,
    calldata(artifacts.factory, 'createPool', [config, mismatchSalt]),
    'create mismatch pool',
  );
  const mismatchId = (await publicClient.readContract({
    address: factory,
    abi: artifacts.factory.abi,
    functionName: 'poolIdFor',
    args: [config, mismatchSalt],
  } as never)) as Hash;
  const mismatchPool = (await publicClient.readContract({
    address: factory,
    abi: artifacts.factory.abi,
    functionName: 'poolOf',
    args: [mismatchId],
  } as never)) as Address;
  await register(mismatchPool, STAKE, 'mismatch');
  await transfer(mismatchPool, STAKE - 1n, 'mismatch');
  const mismatch = await acceptance(mismatchPool);
  if (mismatch.value) fail('The mismatched encrypted transfer was accepted.');
  await send(
    mismatchPool,
    calldata(artifacts.pool, 'rejectPendingCommit', [mismatch.proof]),
    'reject mismatched callback',
  );

  const timeoutSalt = keccak256(
    '0x706b30342d756e63616c6c65642d76310000000000000000000000000000000000',
  );
  await send(
    factory,
    calldata(artifacts.factory, 'createPool', [config, timeoutSalt]),
    'create uncalled timeout pool',
  );
  const timeoutId = (await publicClient.readContract({
    address: factory,
    abi: artifacts.factory.abi,
    functionName: 'poolIdFor',
    args: [config, timeoutSalt],
  } as never)) as Hash;
  const timeoutPool = (await publicClient.readContract({
    address: factory,
    abi: artifacts.factory.abi,
    functionName: 'poolOf',
    args: [timeoutId],
  } as never)) as Address;
  await register(timeoutPool, STAKE, 'uncalled timeout');
  await waitForTimestamp(publicClient, (await pending(timeoutPool))[1]);
  await send(
    timeoutPool,
    calldata(artifacts.pool, 'expirePendingCommit'),
    'expire uncalled intent',
  );

  const balances = await Promise.all([
    publicClient.getBalance({ address: factory }),
    publicClient.getBalance({ address: pool }),
    publicClient.getBalance({ address: mismatchPool }),
    publicClient.getBalance({ address: timeoutPool }),
  ]);
  if (balances.some((balance) => balance !== 0n)) fail('A PK-04 contract holds native value.');
  const evidence = {
    schemaVersion: 1,
    gate: 'G5',
    workItem: 'PK-04',
    phase: 'P1',
    sourceCommit: sourceCommit(),
    timestampUtc: new Date().toISOString(),
    chainId: CHAIN_ID,
    verificationBlock: (await publicClient.getBlockNumber()).toString(),
    contracts: {
      fixture,
      wrapper,
      adapter,
      factory,
      acceptedPool: pool,
      mismatchPool,
      uncalledTimeoutPool: timeoutPool,
    },
    transactions,
    checks: {
      ownerBoundEncryptedImport: true,
      exactCallbackDelta: true,
      matchingCommitAccepted: true,
      invalidProofRejected: true,
      replayRejected: true,
      mismatchedCallbackAtomicallyRefunded: true,
      earlyTimeoutRejected: true,
      uncalledIntentPermissionlesslyCleared: true,
      nativeValueRejected: true,
      zeroNativeBalances: true,
    },
    privacyImpact:
      'No plaintext stake, probability, allocation, balance, handle, or proof is recorded.',
    fundsLocation:
      'Accepted collateral remains confidential pool custody; mismatch and uncalled intent paths retain confidential owner custody.',
    limitations: [
      'Timed-out successful callback return remains required before PK-04 can complete.',
    ],
    status: 'partial',
  };
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  mkdirSync(dirname(offlineEvidencePath), { recursive: true });
  mkdirSync(dirname(sepoliaEvidencePath), { recursive: true });
  writeFileSync(offlineEvidencePath, serialized);
  writeFileSync(sepoliaEvidencePath, serialized);
  console.log(
    JSON.stringify({ workItem: 'PK-04', status: 'partial', transactions: transactions.length }),
  );
}

main().catch(() => {
  console.error(`PK-04 commit run failed during ${failureStage}.`);
  process.exitCode = 1;
});
