import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  isAddress,
  keccak256,
  parseEther,
  toHex,
  type Abi,
  type Address,
  type Hash,
  type Hex,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const CHAIN_ID = 11_155_111;
const FEED = '0x694AA1769357215DE4FAC081bf1f309aDC325306' as const;
const STAKE = 20n;
const PRIMARY_PROBABILITY = 7_500n;
const SECONDARY_PROBABILITY = 5_000n;
const ACTOR_FUNDING = parseEther('0.01');
// Keep each staged command inside the orchestration window; a failed proof lookup
// can be retried in a fresh read/write stage without changing on-chain state.
const MAX_RETRIES = 2;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const protocolRoot = resolve(scriptDirectory, '../..');
const repositoryRoot = resolve(protocolRoot, '../..');
const artifact = (path: string) => resolve(protocolRoot, 'artifacts/contracts', path);
const ledgerPath = resolve(repositoryRoot, 'evidence/sepolia/spend-ledger.json');
const actorPath = resolve(repositoryRoot, 'evidence/local/pk05-secondary-actor.json');

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
interface StoredActor {
  schemaVersion: 1;
  privateKey: Hex;
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
function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}
function requiredAddress(name: string): Address {
  const value = argument(name);
  if (!value || !isAddress(value)) fail(`PK-05 ${name} requires an address.`);
  return value;
}
function loadEnvironment(): void {
  const path = resolve(repositoryRoot, '.env');
  if (existsSync(path)) process.loadEnvFile(path);
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
  )
    fail('Confirmed Sepolia writes require a clean source tree.');
}
function loadArtifact(path: string, name: string): Artifact {
  const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<Artifact>;
  if (!Array.isArray(value.abi) || typeof value.bytecode !== 'string')
    fail(`Missing ${name} artifact.`);
  return value as Artifact;
}
function loadLedger(): Ledger {
  const value = JSON.parse(readFileSync(ledgerPath, 'utf8')) as Partial<Ledger>;
  if (value.schemaVersion !== 1 || value.chainId !== CHAIN_ID || !Array.isArray(value.entries))
    fail('The Sepolia spend ledger is malformed.');
  return value as Ledger;
}
function totalSpend(ledger: Ledger): bigint {
  return ledger.entries.reduce((sum, entry) => sum + BigInt(entry.actualGasCostWei), 0n);
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
function loadOrCreateSecondary(): Hex {
  if (existsSync(actorPath)) {
    const stored = JSON.parse(readFileSync(actorPath, 'utf8')) as Partial<StoredActor>;
    if (
      stored.schemaVersion !== 1 ||
      typeof stored.privateKey !== 'string' ||
      !/^0x[0-9a-fA-F]{64}$/.test(stored.privateKey)
    )
      fail('The local PK-05 secondary actor record is malformed.');
    chmodSync(actorPath, 0o600);
    return stored.privateKey as Hex;
  }
  mkdirSync(dirname(actorPath), { recursive: true, mode: 0o700 });
  const privateKey = generatePrivateKey();
  writeFileSync(actorPath, `${JSON.stringify({ schemaVersion: 1, privateKey })}\n`, {
    mode: 0o600,
  });
  chmodSync(actorPath, 0o600);
  return privateKey;
}
async function expectRevert(action: () => Promise<unknown>, scenario: string): Promise<void> {
  try {
    await action();
  } catch {
    return;
  }
  fail(`${scenario} did not reject on Ethereum Sepolia.`);
}
async function decrypt(
  handles: Awaited<ReturnType<typeof createViemHandleClient>>,
  handle: Hex,
): Promise<{ value: bigint; proof: Hex }> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const result = await handles.publicDecrypt(handle);
      if (typeof result.value !== 'bigint') fail('The aggregate did not decode as uint256.');
      return { value: result.value, proof: result.decryptionProof as Hex };
    } catch {
      if (attempt === MAX_RETRIES - 1) fail('The aggregate proof was unavailable.');
      await delay(5_000);
    }
  }
  fail('The aggregate proof was unavailable.');
}
async function decryptBoolean(
  handles: Awaited<ReturnType<typeof createViemHandleClient>>,
  handle: Hex,
): Promise<{ value: boolean; proof: Hex }> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const result = await handles.publicDecrypt(handle);
      if (typeof result.value !== 'boolean') {
        fail('The callback acceptance did not decode as a boolean.');
      }
      return { value: result.value, proof: result.decryptionProof as Hex };
    } catch {
      if (attempt === MAX_RETRIES - 1) fail('The callback acceptance proof was unavailable.');
      await delay(5_000);
    }
  }
  fail('The callback acceptance proof was unavailable.');
}

async function main(): Promise<void> {
  loadEnvironment();
  const stage = argument('stage');
  const write = process.argv.includes('--write');
  const workItem = argument('work-item') ?? 'PK-05';
  if (!['PK-05', 'PK-06', 'PK-07'].includes(workItem))
    fail('The work item must be PK-05, PK-06, or PK-07.');
  if (!stage) fail(`${workItem} requires --stage.`);
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const primaryKey = process.env.SEPOLIA_PRIVATE_KEY as Hex | undefined;
  if (!rpcUrl || !primaryKey)
    fail(`${workItem} requires Sepolia RPC and primary signer configuration.`);
  if (write && process.env.CONFIRM_SEPOLIA_WRITE !== 'yes')
    fail('Confirmed writes require CONFIRM_SEPOLIA_WRITE=yes.');
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
  });
  if ((await publicClient.getChainId()) !== CHAIN_ID)
    fail('The configured RPC is not Ethereum Sepolia.');
  const primary = privateKeyToAccount(primaryKey);
  const secondary = privateKeyToAccount(loadOrCreateSecondary());
  const primaryWallet = createWalletClient({
    account: primary,
    chain: sepolia,
    transport: http(rpcUrl),
  });
  const secondaryWallet = createWalletClient({
    account: secondary,
    chain: sepolia,
    transport: http(rpcUrl),
  });
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
      workItem,
      stage,
      remainingAllowanceWei: (BigInt(ledger.maxTotalSpendWei) - totalSpend(ledger)).toString(),
    }),
  );
  if (!write) return;
  assertClean();
  const primaryHandles = await createViemHandleClient(primaryWallet);
  const secondaryHandles = await createViemHandleClient(secondaryWallet);
  const record = (
    sender: Address,
    purpose: string,
    hash: Hash,
    receipt: { blockNumber: bigint; gasUsed: bigint; effectiveGasPrice: bigint },
  ) => {
    appendSpend(ledger, {
      workItemId: workItem,
      phase: 'P1',
      sender,
      transactionHash: hash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice.toString(),
      actualGasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
    });
    console.log(
      JSON.stringify({
        workItem,
        stage,
        purpose,
        transactionHash: hash,
        blockNumber: receipt.blockNumber.toString(),
      }),
    );
  };
  const send = async (
    account: typeof primary,
    wallet: typeof primaryWallet,
    to: Address,
    data: Hex,
    purpose: string,
    value = 0n,
  ): Promise<void> => {
    const gas = await publicClient.estimateGas({ account: account.address, to, data, value });
    const maxFeePerGas =
      (await publicClient.estimateFeesPerGas()).maxFeePerGas ?? (await publicClient.getGasPrice());
    if (totalSpend(ledger) + gas * maxFeePerGas > BigInt(ledger.maxTotalSpendWei))
      fail(`The next ${workItem} write exceeds budget.`);
    const hash = await wallet.sendTransaction({ account, to, data, value, gas, maxFeePerGas });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    record(account.address, purpose, hash, receipt);
    if (receipt.status !== 'success') fail(`${purpose} failed.`);
  };
  const deploy = async (data: Hex, purpose: string): Promise<Address> => {
    const gas = await publicClient.estimateGas({ account: primary.address, data });
    const maxFeePerGas =
      (await publicClient.estimateFeesPerGas()).maxFeePerGas ?? (await publicClient.getGasPrice());
    const hash = await primaryWallet.sendTransaction({ account: primary, data, gas, maxFeePerGas });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    record(primary.address, purpose, hash, receipt);
    if (receipt.status !== 'success' || !receipt.contractAddress) fail(`${purpose} failed.`);
    return receipt.contractAddress;
  };
  const calldata = (item: Artifact, name: string, args: readonly unknown[] = []): Hex =>
    encodeFunctionData({ abi: item.abi, functionName: name, args } as never);
  if (stage === 'deploy-fixture') {
    console.log(
      JSON.stringify({
        fixture: await deploy(
          encodeDeployData({ abi: artifacts.fixture.abi, bytecode: artifacts.fixture.bytecode }),
          'deploy fixture',
        ),
      }),
    );
    return;
  }
  if (stage === 'deploy-wrapper') {
    const fixture = requiredAddress('fixture');
    console.log(
      JSON.stringify({
        wrapper: await deploy(
          encodeDeployData({
            abi: artifacts.wrapper.abi,
            bytecode: artifacts.wrapper.bytecode,
            args: [fixture],
          }),
          'deploy unchanged wrapper',
        ),
      }),
    );
    return;
  }
  if (stage === 'deploy-adapter') {
    const block = await publicClient.getBlock();
    const observationDelay = workItem === 'PK-07' ? 21_600n : workItem === 'PK-06' ? 1_500n : 900n;
    console.log(
      JSON.stringify({
        adapter: await deploy(
          encodeDeployData({
            abi: artifacts.adapter.abi,
            bytecode: artifacts.adapter.bytecode,
            args: [FEED, true, 1n, block.timestamp + observationDelay, 2_592_000n],
          }),
          'deploy adapter',
        ),
      }),
    );
    return;
  }
  if (stage === 'deploy-factory') {
    console.log(
      JSON.stringify({
        factory: await deploy(
          encodeDeployData({ abi: artifacts.factory.abi, bytecode: artifacts.factory.bytecode }),
          'deploy factory',
        ),
      }),
    );
    return;
  }
  if (stage === 'create-pool') {
    const factory = requiredAddress('factory');
    const wrapper = requiredAddress('wrapper');
    const adapter = requiredAddress('adapter');
    const caseName = argument('case');
    const validCases =
      workItem === 'PK-05'
        ? ['below-k', 'threshold']
        : workItem === 'PK-06'
          ? ['timeout', 'grace', 'success']
          : ['claim', 'refund'];
    if (!caseName || !validCases.includes(caseName))
      fail(`${workItem} pool case must be one of: ${validCases.join(', ')}.`);
    const observation = (await publicClient.readContract({
      address: adapter,
      abi: artifacts.adapter.abi,
      functionName: 'observationNotBefore',
    } as never)) as bigint;
    const config: Config = {
      confidentialCollateral: wrapper,
      resolutionAdapter: adapter,
      deadline: observation - (workItem === 'PK-07' ? 3_600n : workItem === 'PK-05' ? 180n : 300n),
      commitTimeout: 30n,
      kMin: 2,
      aggregateTimeout:
        workItem === 'PK-05'
          ? caseName === 'below-k'
            ? 600n
            : 601n
          : caseName === 'timeout'
            ? 120n
            : caseName === 'grace'
              ? 121n
              : caseName === 'claim'
                ? 122n
                : 123n,
      resolutionGrace: workItem === 'PK-05' ? 600n : 120n,
    };
    const salt = keccak256(toHex(`quiet-signal/${workItem}/${caseName}/v1`));
    await send(
      primary,
      primaryWallet,
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
    console.log(JSON.stringify({ pool, poolId, case: caseName }));
    return;
  }
  if (stage === 'fund-secondary') {
    await send(
      primary,
      primaryWallet,
      secondary.address,
      '0x',
      'fund secondary actor',
      ACTOR_FUNDING,
    );
    console.log(JSON.stringify({ secondary: secondary.address }));
    return;
  }
  if (stage === 'mint') {
    const fixture = requiredAddress('fixture');
    const collateral = workItem === 'PK-07' ? 200n : workItem === 'PK-06' ? 180n : 100n;
    await send(
      primary,
      primaryWallet,
      fixture,
      calldata(artifacts.fixture, 'mint', [primary.address, collateral]),
      'mint fixture',
    );
    return;
  }
  if (stage === 'approve') {
    const fixture = requiredAddress('fixture');
    const wrapper = requiredAddress('wrapper');
    const collateral = workItem === 'PK-07' ? 200n : workItem === 'PK-06' ? 180n : 100n;
    await send(
      primary,
      primaryWallet,
      fixture,
      calldata(artifacts.fixture, 'approve', [wrapper, collateral]),
      'approve wrapper',
    );
    return;
  }
  if (stage === 'wrap') {
    const wrapper = requiredAddress('wrapper');
    const collateral = workItem === 'PK-07' ? 200n : workItem === 'PK-06' ? 180n : 100n;
    await send(
      primary,
      primaryWallet,
      wrapper,
      calldata(artifacts.wrapper, 'wrap', [primary.address, collateral]),
      'wrap collateral',
    );
    return;
  }
  if (stage === 'distribute') {
    const wrapper = requiredAddress('wrapper');
    const secondaryCollateral = workItem === 'PK-07' ? 80n : workItem === 'PK-06' ? 60n : 40n;
    const input = (await primaryHandles.encryptInput(
      secondaryCollateral,
      'uint256',
      wrapper,
    )) as EncryptedValue;
    await send(
      primary,
      primaryWallet,
      wrapper,
      calldata(artifacts.wrapper, 'confidentialTransfer', [
        secondary.address,
        input.handle,
        input.handleProof,
      ]),
      'distribute confidential collateral',
    );
    return;
  }
  const pool = requiredAddress('pool');
  if (stage === 'register') {
    const actor = argument('actor') === 'secondary' ? secondary : primary;
    const handles = actor.address === secondary.address ? secondaryHandles : primaryHandles;
    const wallet = actor.address === secondary.address ? secondaryWallet : primaryWallet;
    const probability =
      actor.address === secondary.address ? SECONDARY_PROBABILITY : PRIMARY_PROBABILITY;
    const [stake, probabilityInput] = (await Promise.all([
      handles.encryptInput(STAKE, 'uint256', pool),
      handles.encryptInput(probability, 'uint256', pool),
    ])) as [EncryptedValue, EncryptedValue];
    await send(
      actor,
      wallet,
      pool,
      calldata(artifacts.pool, 'commitSignal', [
        stake.handle,
        stake.handleProof,
        probabilityInput.handle,
        probabilityInput.handleProof,
      ]),
      'register encrypted signal',
    );
    return;
  }
  if (stage === 'transfer') {
    const wrapper = requiredAddress('wrapper');
    const actor = argument('actor') === 'secondary' ? secondary : primary;
    const handles = actor.address === secondary.address ? secondaryHandles : primaryHandles;
    const wallet = actor.address === secondary.address ? secondaryWallet : primaryWallet;
    const input = (await handles.encryptInput(STAKE, 'uint256', wrapper)) as EncryptedValue;
    await send(
      actor,
      wallet,
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
  if (stage === 'finalize-commit') {
    const handle = (await publicClient.readContract({
      address: pool,
      abi: artifacts.pool.abi,
      functionName: 'pendingAcceptanceHandle',
    } as never)) as Hex;
    const proof = await decryptBoolean(primaryHandles, handle);
    if (!proof.value) fail('The matching callback was not accepted.');
    await expectRevert(
      () =>
        publicClient.call({
          account: primary.address,
          to: pool,
          data: calldata(artifacts.pool, 'finalizeCommit', ['0x']),
        }),
      'Invalid callback proof',
    );
    await send(
      primary,
      primaryWallet,
      pool,
      calldata(artifacts.pool, 'finalizeCommit', [proof.proof]),
      'finalize accepted commit',
    );
    return;
  }
  if (stage === 'close') {
    await send(primary, primaryWallet, pool, calldata(artifacts.pool, 'closeEpoch'), 'close epoch');
    return;
  }
  if (stage === 'request') {
    await send(
      primary,
      primaryWallet,
      pool,
      calldata(artifacts.pool, 'requestAggregateDecrypt'),
      'request aggregate decrypt',
    );
    return;
  }
  if (stage === 'finalize-aggregate') {
    const epoch = (await publicClient.readContract({
      address: pool,
      abi: artifacts.pool.abi,
      functionName: 'epoch',
    } as never)) as { aggregateRequestId: Hash };
    const handles = (await publicClient.readContract({
      address: pool,
      abi: artifacts.pool.abi,
      functionName: 'aggregateDisclosureHandles',
    } as never)) as readonly [Hex, Hex];
    const [yes, no] = await Promise.all([
      decrypt(primaryHandles, handles[0]),
      decrypt(primaryHandles, handles[1]),
    ]);
    await expectRevert(
      () =>
        publicClient.call({
          account: primary.address,
          to: pool,
          data: calldata(artifacts.pool, 'finalizeAggregate', [
            epoch.aggregateRequestId,
            '0x',
            '0x',
          ]),
        }),
      'Invalid aggregate proofs',
    );
    await send(
      primary,
      primaryWallet,
      pool,
      calldata(artifacts.pool, 'finalizeAggregate', [
        epoch.aggregateRequestId,
        yes.proof,
        no.proof,
      ]),
      'finalize aggregate',
    );
    return;
  }
  if (stage === 'assert-early-recovery') {
    const recovery = argument('recovery');
    if (recovery === 'aggregate') {
      await expectRevert(
        () =>
          publicClient.call({
            account: primary.address,
            to: pool,
            data: calldata(artifacts.pool, 'cancelBeforeResolution'),
          }),
        'Early aggregate timeout recovery',
      );
      console.log(JSON.stringify({ pool, recovery, rejected: true }));
      return;
    }
    if (recovery === 'resolution') {
      await expectRevert(
        () =>
          publicClient.call({
            account: primary.address,
            to: pool,
            data: calldata(artifacts.pool, 'cancelAfterResolutionGrace'),
          }),
        'Early resolution-grace recovery',
      );
      await expectRevert(
        () =>
          publicClient.call({
            account: primary.address,
            to: pool,
            data: calldata(artifacts.pool, 'settle'),
          }),
        'Unavailable immutable adapter result',
      );
      console.log(JSON.stringify({ pool, recovery, rejected: true }));
      return;
    }
    fail('PK-06 early recovery assertion requires --recovery=aggregate or --recovery=resolution.');
  }
  if (stage === 'settle') {
    await send(
      primary,
      primaryWallet,
      pool,
      calldata(artifacts.pool, 'settle'),
      'settle immutable adapter result',
    );
    return;
  }
  if (stage === 'materialize-score') {
    await send(
      primary,
      primaryWallet,
      pool,
      calldata(artifacts.pool, 'materializeScore'),
      'materialize private score',
    );
    return;
  }
  if (stage === 'claim') {
    await send(
      primary,
      primaryWallet,
      pool,
      calldata(artifacts.pool, 'claim'),
      'claim confidential payout',
    );
    return;
  }
  if (stage === 'refund') {
    await send(
      primary,
      primaryWallet,
      pool,
      calldata(artifacts.pool, 'refund'),
      'refund confidential stake',
    );
    return;
  }
  if (stage === 'cancel-before-resolution') {
    await send(
      primary,
      primaryWallet,
      pool,
      calldata(artifacts.pool, 'cancelBeforeResolution'),
      'cancel elapsed aggregate request',
    );
    return;
  }
  if (stage === 'cancel-after-resolution-grace') {
    await send(
      primary,
      primaryWallet,
      pool,
      calldata(artifacts.pool, 'cancelAfterResolutionGrace'),
      'cancel elapsed resolution grace',
    );
    return;
  }
  fail(`Unknown ${workItem} stage: ${stage}`);
}

main().catch((error: unknown) => {
  console.error(
    `Sepolia lifecycle stage failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
  );
  process.exitCode = 1;
});
