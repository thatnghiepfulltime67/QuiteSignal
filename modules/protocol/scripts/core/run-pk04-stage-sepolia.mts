import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { createViemHandleClient } from '@iexec-nox/handle';
import {
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  encodeFunctionData,
  http,
  isAddress,
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
const MINT = 100n;
const STAKE = 20n;
const PROBABILITY = 7_500n;
const DECRYPT_ATTEMPTS = 8;
const scriptDirectory = resolve(fileURLToPath(import.meta.url), '..');
const protocolRoot = resolve(scriptDirectory, '../..');
const repositoryRoot = resolve(protocolRoot, '../..');
const artifact = (path: string) => resolve(protocolRoot, 'artifacts/contracts', path);
const ledgerPath = resolve(repositoryRoot, 'evidence/sepolia/spend-ledger.json');

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
function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}
function requiredAddress(name: string): Address {
  const value = argument(name);
  if (!value || !isAddress(value)) fail(`PK-04 ${name} requires an address.`);
  return value;
}
function requiredAmount(name: string): bigint {
  const value = argument(name);
  if (!value || !/^\d+$/.test(value)) fail(`PK-04 ${name} requires a non-negative integer.`);
  return BigInt(value);
}
function saltFor(caseName: string): Hash {
  const encoded = {
    accepted: '0x706b30342d61636365707465642d7632000000000000000000000000000000000',
    mismatch: '0x706b30342d6d69736d617463682d76320000000000000000000000000000000000',
    uncalled: '0x706b30342d756e63616c6c65642d76320000000000000000000000000000000000',
    timeout: '0x706b30342d74696d656f75742d7632000000000000000000000000000000000000',
  }[caseName];
  if (!encoded) fail('PK-04 pool case must be accepted, mismatch, uncalled, or timeout.');
  return keccak256(encoded as Hex);
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
  handles: Awaited<ReturnType<typeof createViemHandleClient>>,
  handle: Hex,
): Promise<{ value: boolean; proof: Hex }> {
  for (let attempt = 0; attempt < DECRYPT_ATTEMPTS; attempt += 1) {
    try {
      const value = await handles.publicDecrypt(handle);
      if (typeof value.value !== 'boolean') fail('The acceptance did not decode as a boolean.');
      return { value: value.value, proof: value.decryptionProof as Hex };
    } catch {
      if (attempt === DECRYPT_ATTEMPTS - 1) fail('The acceptance proof was unavailable.');
      await delay(5_000);
    }
  }
  fail('The acceptance proof was unavailable.');
}
async function decryptOwnerBalance(
  handles: Awaited<ReturnType<typeof createViemHandleClient>>,
  handle: Hex,
): Promise<bigint> {
  for (let attempt = 0; attempt < DECRYPT_ATTEMPTS; attempt += 1) {
    try {
      const value = await handles.decrypt(handle);
      if (typeof value.value !== 'bigint') fail('The owner confidential balance did not decode.');
      return value.value;
    } catch {
      if (attempt === DECRYPT_ATTEMPTS - 1) fail('The owner confidential balance was unavailable.');
      await delay(5_000);
    }
  }
  fail('The owner confidential balance was unavailable.');
}
async function waitForTimestamp(
  client: ReturnType<typeof createPublicClient>,
  timestamp: bigint,
): Promise<void> {
  while ((await client.getBlock()).timestamp < timestamp) await delay(5_000);
}

async function main(): Promise<void> {
  loadEnvironment();
  const stage = argument('stage');
  const write = process.argv.includes('--write');
  if (!stage) fail('PK-04 requires a named --stage.');
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
    fixture: loadArtifact(
      artifact('feasibility/FeasibilityERC20.sol/FeasibilityERC20.json'),
      'fixture',
    ),
    wrapper: loadArtifact(
      artifact(
        'feasibility/FeasibilityConfidentialWrapper.sol/FeasibilityConfidentialWrapper.json',
      ),
      'wrapper',
    ),
    adapter: loadArtifact(
      artifact(
        'adapters/ChainlinkPriceFeedResolutionAdapter.sol/ChainlinkPriceFeedResolutionAdapter.json',
      ),
      'adapter',
    ),
    factory: loadArtifact(
      artifact('core/QuietSignalFactory.sol/QuietSignalFactory.json'),
      'factory',
    ),
    pool: loadArtifact(artifact('core/QuietSignalPool.sol/QuietSignalPool.json'), 'pool'),
  };
  const ledger = loadLedger();
  console.log(
    JSON.stringify({
      mode: write ? 'confirmed-write' : 'dry-run',
      workItem: 'PK-04',
      stage,
      remainingAllowanceWei: (BigInt(ledger.maxTotalSpendWei) - totalSpend(ledger)).toString(),
    }),
  );
  if (!write) return;
  assertClean();
  const wallet = createWalletClient({ account: account!, chain: sepolia, transport: http(rpcUrl) });
  const handles = await createViemHandleClient(wallet);
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
    console.log(
      JSON.stringify({
        workItem: 'PK-04',
        stage,
        purpose,
        transactionHash: hash,
        blockNumber: receipt.blockNumber.toString(),
      }),
    );
  };
  const deploy = async (data: Hex, purpose: string): Promise<Address> => {
    const gas = await publicClient.estimateGas({ account: account!.address, data });
    const maxFeePerGas =
      (await publicClient.estimateFeesPerGas()).maxFeePerGas ?? (await publicClient.getGasPrice());
    if (totalSpend(ledger) + gas * maxFeePerGas > BigInt(ledger.maxTotalSpendWei))
      fail('The next PK-04 write exceeds budget.');
    const hash = await wallet.sendTransaction({ account: account!, data, gas, maxFeePerGas });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    record(purpose, hash, receipt);
    if (receipt.status !== 'success' || !receipt.contractAddress) fail(`${purpose} failed.`);
    return receipt.contractAddress;
  };
  const send = async (to: Address, data: Hex, purpose: string): Promise<void> => {
    const gas = await publicClient.estimateGas({ account: account!.address, to, data });
    const maxFeePerGas =
      (await publicClient.estimateFeesPerGas()).maxFeePerGas ?? (await publicClient.getGasPrice());
    if (totalSpend(ledger) + gas * maxFeePerGas > BigInt(ledger.maxTotalSpendWei))
      fail('The next PK-04 write exceeds budget.');
    const hash = await wallet.sendTransaction({ account: account!, to, data, gas, maxFeePerGas });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    record(purpose, hash, receipt);
    if (receipt.status !== 'success') fail(`${purpose} failed.`);
  };
  const calldata = (item: Artifact, name: string, args: readonly unknown[] = []): Hex =>
    encodeFunctionData({ abi: item.abi, functionName: name, args } as never);
  const assertCode = async (address: Address, name: string): Promise<void> => {
    if (!(await publicClient.getCode({ address }))) fail(`The PK-04 ${name} has no code.`);
  };
  const pending = async (pool: Address) =>
    (await publicClient.readContract({
      address: pool,
      abi: artifacts.pool.abi,
      functionName: 'pendingCommit',
    } as never)) as readonly [Address, bigint, boolean];
  const register = async (pool: Address, stake: bigint) => {
    const [stakeInput, probabilityInput] = (await Promise.all([
      handles.encryptInput(stake, 'uint256', pool),
      handles.encryptInput(PROBABILITY, 'uint256', pool),
    ])) as [EncryptedValue, EncryptedValue];
    await send(
      pool,
      calldata(artifacts.pool, 'commitSignal', [
        stakeInput.handle,
        stakeInput.handleProof,
        probabilityInput.handle,
        probabilityInput.handleProof,
      ]),
      'register encrypted intent',
    );
    await expectRevert(
      () =>
        publicClient.call({
          account: account!.address,
          to: pool,
          data: calldata(artifacts.pool, 'expirePendingCommit'),
        }),
      'Early commit timeout',
    );
  };

  if (stage === 'deploy-fixture') {
    const fixture = await deploy(
      encodeDeployData({ abi: artifacts.fixture.abi, bytecode: artifacts.fixture.bytecode }),
      'deploy fixture collateral',
    );
    console.log(JSON.stringify({ workItem: 'PK-04', stage, fixture }));
    return;
  }
  if (stage === 'deploy-wrapper') {
    const fixture = requiredAddress('fixture');
    await assertCode(fixture, 'fixture');
    const wrapper = await deploy(
      encodeDeployData({
        abi: artifacts.wrapper.abi,
        bytecode: artifacts.wrapper.bytecode,
        args: [fixture],
      }),
      'deploy unchanged wrapper',
    );
    console.log(JSON.stringify({ workItem: 'PK-04', stage, wrapper }));
    return;
  }
  if (stage === 'deploy-adapter') {
    const block = await publicClient.getBlock();
    const adapter = await deploy(
      encodeDeployData({
        abi: artifacts.adapter.abi,
        bytecode: artifacts.adapter.bytecode,
        args: [FEED, true, 1n, block.timestamp + 1_200n, 2_592_000n],
      }),
      'deploy immutable adapter',
    );
    console.log(JSON.stringify({ workItem: 'PK-04', stage, adapter }));
    return;
  }
  if (stage === 'deploy-factory') {
    const factory = await deploy(
      encodeDeployData({ abi: artifacts.factory.abi, bytecode: artifacts.factory.bytecode }),
      'deploy factory',
    );
    console.log(JSON.stringify({ workItem: 'PK-04', stage, factory }));
    return;
  }
  if (stage === 'create-pool') {
    const factory = requiredAddress('factory');
    const wrapper = requiredAddress('wrapper');
    const adapter = requiredAddress('adapter');
    const caseName = argument('case') ?? '';
    await Promise.all([
      assertCode(factory, 'factory'),
      assertCode(wrapper, 'wrapper'),
      assertCode(adapter, 'adapter'),
    ]);
    const observationNotBefore = (await publicClient.readContract({
      address: adapter,
      abi: artifacts.adapter.abi,
      functionName: 'observationNotBefore',
    } as never)) as bigint;
    if (observationNotBefore <= (await publicClient.getBlock()).timestamp + 120n)
      fail('The PK-04 adapter observation window is too near for a new pool deadline.');
    const config: Config = {
      confidentialCollateral: wrapper,
      resolutionAdapter: adapter,
      deadline: observationNotBefore - 90n,
      commitTimeout: COMMIT_TIMEOUT,
      kMin: 2,
      aggregateTimeout: 600n,
      resolutionGrace: 600n,
    };
    const salt = saltFor(caseName);
    await send(
      factory,
      calldata(artifacts.factory, 'createPool', [config, salt]),
      `create ${caseName} pool`,
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
    await assertCode(pool, 'pool');
    await expectRevert(
      () => publicClient.call({ account: account!.address, to: pool, value: 1n }),
      'Native value at pool boundary',
    );
    console.log(JSON.stringify({ workItem: 'PK-04', stage, case: caseName, pool, poolId }));
    return;
  }
  if (stage === 'mint') {
    const fixture = requiredAddress('fixture');
    await assertCode(fixture, 'fixture');
    await send(
      fixture,
      calldata(artifacts.fixture, 'mint', [account!.address, MINT]),
      'mint collateral',
    );
    return;
  }
  if (stage === 'approve') {
    const fixture = requiredAddress('fixture');
    const wrapper = requiredAddress('wrapper');
    await Promise.all([assertCode(fixture, 'fixture'), assertCode(wrapper, 'wrapper')]);
    await send(fixture, calldata(artifacts.fixture, 'approve', [wrapper, MINT]), 'approve wrapper');
    return;
  }
  if (stage === 'wrap') {
    const wrapper = requiredAddress('wrapper');
    await assertCode(wrapper, 'wrapper');
    await send(
      wrapper,
      calldata(artifacts.wrapper, 'wrap', [account!.address, MINT]),
      'wrap collateral',
    );
    return;
  }
  if (stage === 'register') {
    const pool = requiredAddress('pool');
    await assertCode(pool, 'pool');
    await register(pool, requiredAmount('stake'));
    return;
  }
  if (stage === 'transfer') {
    const wrapper = requiredAddress('wrapper');
    const pool = requiredAddress('pool');
    await Promise.all([assertCode(wrapper, 'wrapper'), assertCode(pool, 'pool')]);
    const amount = requiredAmount('amount');
    const input = (await handles.encryptInput(amount, 'uint256', wrapper)) as EncryptedValue;
    await send(
      wrapper,
      calldata(artifacts.wrapper, 'confidentialTransferAndCall', [
        pool,
        input.handle,
        input.handleProof,
        '0x',
      ]),
      'transfer confidential collateral',
    );
    return;
  }
  if (stage === 'finalize' || stage === 'reject') {
    const pool = requiredAddress('pool');
    await assertCode(pool, 'pool');
    const handle = (await publicClient.readContract({
      address: pool,
      abi: artifacts.pool.abi,
      functionName: 'pendingAcceptanceHandle',
    } as never)) as Hex;
    const result = await decryptBoolean(handles, handle);
    const method = stage === 'finalize' ? 'finalizeCommit' : 'rejectPendingCommit';
    if (result.value !== (stage === 'finalize'))
      fail(`The callback acceptance did not match the ${stage} branch.`);
    await expectRevert(
      () =>
        publicClient.call({
          account: account!.address,
          to: pool,
          data: calldata(artifacts.pool, method, ['0x']),
        }),
      'Invalid acceptance proof',
    );
    await send(pool, calldata(artifacts.pool, method, [result.proof]), `${stage} callback`);
    await expectRevert(
      () =>
        publicClient.call({
          account: account!.address,
          to: pool,
          data: calldata(artifacts.pool, method, [result.proof]),
        }),
      'Acceptance-proof replay',
    );
    return;
  }
  if (stage === 'expire') {
    const pool = requiredAddress('pool');
    await assertCode(pool, 'pool');
    const state = await pending(pool);
    if (state[0] === '0x0000000000000000000000000000000000000000')
      fail('The pending commit is absent.');
    const wrapper = argument('wrapper');
    let balanceBefore: bigint | undefined;
    if (state[2]) {
      if (!wrapper || !isAddress(wrapper)) fail('A callback-timeout expiry requires --wrapper.');
      await assertCode(wrapper, 'wrapper');
      const handle = (await publicClient.readContract({
        address: wrapper,
        abi: artifacts.wrapper.abi,
        functionName: 'confidentialBalanceOf',
        args: [account!.address],
      } as never)) as Hex;
      balanceBefore = await decryptOwnerBalance(handles, handle);
    }
    await waitForTimestamp(publicClient, state[1]);
    await send(pool, calldata(artifacts.pool, 'expirePendingCommit'), 'expire pending commit');
    if (balanceBefore !== undefined) {
      const handle = (await publicClient.readContract({
        address: wrapper as Address,
        abi: artifacts.wrapper.abi,
        functionName: 'confidentialBalanceOf',
        args: [account!.address],
      } as never)) as Hex;
      if ((await decryptOwnerBalance(handles, handle)) !== balanceBefore + STAKE)
        fail('The callback-timeout recovery did not return the confidential stake.');
    }
    return;
  }
  fail(`Unknown PK-04 stage: ${stage}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`PK-04 stage failed: ${message}`);
  process.exitCode = 1;
});
