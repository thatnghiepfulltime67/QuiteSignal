import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { createViemHandleClient } from '@iexec-nox/handle';
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  isAddress,
  parseEther,
  type Abi,
  type Address,
  type Hash,
  type Hex,
} from 'viem';
import { generatePrivateKey, mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const EXPECTED_CHAIN_ID = 11_155_111;
const CONFIRMATION_VALUE = 'yes';
const OWNER_INPUT = 41n;
const DERIVED_OWNER_VALUE = OWNER_INPUT + 1n;
const PUBLIC_DECRYPT_MAX_ATTEMPTS = 8;
const PUBLIC_DECRYPT_RETRY_DELAY_MS = 5_000;
const NOX_COMPUTE_ADDRESS = '0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF' as const;

const NOX_COMPUTE_ABI = [
  {
    type: 'function',
    name: 'add',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'leftHandOperand', type: 'bytes32' },
      { name: 'rightHandOperand', type: 'bytes32' },
    ],
    outputs: [{ name: 'result', type: 'bytes32' }],
  },
] as const satisfies Abi;

interface Artifact {
  abi: Abi;
  bytecode: Hex;
  deployedBytecode: Hex;
}

interface SpendEntry {
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

interface SpendLedger {
  schemaVersion: number;
  chainId: number;
  maxTotalSpendWei: string;
  entries: SpendEntry[];
}

interface EncryptedValue {
  handle: Hex;
  handleProof: Hex;
}

interface ActorSet {
  owner: Address;
  unrelated: Address;
  keeper: Address;
  adapter: Address;
  token: Address;
}

type ActorAccount = ReturnType<typeof mnemonicToAccount> | ReturnType<typeof privateKeyToAccount>;

interface StoredActorSecrets {
  schemaVersion: 1;
  privateKeys: Record<keyof ActorSet, Hex>;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const protocolRoot = resolve(scriptDirectory, '../..');
const repositoryRoot = resolve(protocolRoot, '../..');
const artifactPath = resolve(
  protocolRoot,
  'artifacts/contracts/feasibility/AclSpike.sol/AclSpike.json',
);
const spendLedgerPath = resolve(repositoryRoot, 'evidence/sepolia/spend-ledger.json');
const actorSecretPath = resolve(repositoryRoot, '.secrets/fnd-03-actors.json');
let failureStage = 'configuration validation';

function fail(message: string): never {
  throw new Error(message);
}

function loadEnvironment(): void {
  const environmentPath = resolve(repositoryRoot, '.env');
  if (existsSync(environmentPath)) {
    process.loadEnvFile(environmentPath);
  }
}

function loadArtifact(): Artifact {
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as Partial<Artifact>;
  if (
    !Array.isArray(artifact.abi) ||
    typeof artifact.bytecode !== 'string' ||
    typeof artifact.deployedBytecode !== 'string'
  ) {
    fail('The compiled ACL spike artifact is unavailable or malformed.');
  }
  return artifact as Artifact;
}

function loadLedger(): SpendLedger {
  const ledger = JSON.parse(readFileSync(spendLedgerPath, 'utf8')) as Partial<SpendLedger>;
  if (
    ledger.schemaVersion !== 1 ||
    ledger.chainId !== EXPECTED_CHAIN_ID ||
    typeof ledger.maxTotalSpendWei !== 'string' ||
    !Array.isArray(ledger.entries)
  ) {
    fail('The Sepolia spend ledger is unavailable or malformed.');
  }
  return ledger as SpendLedger;
}

function totalSpendWei(ledger: SpendLedger): bigint {
  return ledger.entries.reduce((total, entry) => total + BigInt(entry.actualGasCostWei), 0n);
}

function sourceCommit(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
}

function assertCleanSourceTree(): void {
  const status = execFileSync('git', ['status', '--porcelain'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
  if (status.length > 0) {
    fail('Sepolia writes require a clean source tree.');
  }
}

function appendSpend(
  ledger: SpendLedger,
  entry: Omit<SpendEntry, 'sourceCommit' | 'timestampUtc'>,
): void {
  ledger.entries.push({
    ...entry,
    sourceCommit: sourceCommit(),
    timestampUtc: new Date().toISOString(),
  });
  writeFileSync(spendLedgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
}

function assertBudget(ledger: SpendLedger, estimatedGasCostWei: bigint): void {
  const cap = BigInt(ledger.maxTotalSpendWei);
  if (totalSpendWei(ledger) + estimatedGasCostWei > cap) {
    fail('The proposed Sepolia write exceeds the committed cumulative gas allowance.');
  }
}

function configuredSingleTransactionCapWei(ledger: SpendLedger): bigint {
  const configuredCap = process.env.SEPOLIA_MAX_SINGLE_TX_ETH;
  if (!configuredCap) {
    return BigInt(ledger.maxTotalSpendWei);
  }
  if (!/^\d+(?:\.\d{1,18})?$/.test(configuredCap)) {
    fail('The configured single-transaction Sepolia gas cap is malformed.');
  }

  const cap = parseEther(configuredCap);
  if (cap === 0n || cap > BigInt(ledger.maxTotalSpendWei)) {
    fail('The configured single-transaction Sepolia gas cap is outside the allowed range.');
  }
  return cap;
}

function assertSingleTransactionBudget(
  estimatedGasCostWei: bigint,
  singleTransactionCapWei: bigint,
): void {
  if (estimatedGasCostWei > singleTransactionCapWei) {
    fail('The proposed Sepolia write exceeds the single-transaction gas allowance.');
  }
}

function existingContracts(): readonly [Address, Address] | undefined {
  const argument = process.argv.find((value) => value.startsWith('--verify-contracts='));
  if (!argument) {
    return undefined;
  }
  const values = argument.slice('--verify-contracts='.length).split(',');
  const [primaryAddress, negativeAddress] = values;
  if (
    values.length !== 2 ||
    !primaryAddress ||
    !negativeAddress ||
    !isAddress(primaryAddress) ||
    !isAddress(negativeAddress)
  ) {
    fail('Two comma-separated ACL feasibility contract addresses are required for verification.');
  }
  return [primaryAddress, negativeAddress] as const;
}

function loadOrCreateActorSecrets(): StoredActorSecrets {
  if (existsSync(actorSecretPath)) {
    const stored = JSON.parse(readFileSync(actorSecretPath, 'utf8')) as Partial<StoredActorSecrets>;
    const privateKeys = stored.privateKeys;
    if (
      stored.schemaVersion !== 1 ||
      !privateKeys ||
      !Object.values(privateKeys).every((privateKey) => /^0x[0-9a-fA-F]{64}$/.test(privateKey))
    ) {
      fail('The local FND-03 actor secret store is malformed.');
    }
    return stored as StoredActorSecrets;
  }

  mkdirSync(dirname(actorSecretPath), { recursive: true, mode: 0o700 });
  const stored: StoredActorSecrets = {
    schemaVersion: 1,
    privateKeys: {
      owner: generatePrivateKey(),
      unrelated: generatePrivateKey(),
      keeper: generatePrivateKey(),
      adapter: generatePrivateKey(),
      token: generatePrivateKey(),
    },
  };
  writeFileSync(actorSecretPath, `${JSON.stringify(stored)}\n`, { mode: 0o600 });
  chmodSync(actorSecretPath, 0o600);
  return stored;
}

function deriveActors(
  mnemonic: string | undefined,
  deployer: Address,
): {
  actors: ActorSet;
  ownerAccount: ActorAccount;
  unrelatedAccount: ActorAccount;
} {
  const accounts: Record<keyof ActorSet, ActorAccount> = mnemonic
    ? {
        owner: mnemonicToAccount(mnemonic, { addressIndex: 0 }),
        unrelated: mnemonicToAccount(mnemonic, { addressIndex: 1 }),
        keeper: mnemonicToAccount(mnemonic, { addressIndex: 2 }),
        adapter: mnemonicToAccount(mnemonic, { addressIndex: 3 }),
        token: mnemonicToAccount(mnemonic, { addressIndex: 4 }),
      }
    : (Object.fromEntries(
        Object.entries(loadOrCreateActorSecrets().privateKeys).map(([role, privateKey]) => [
          role,
          privateKeyToAccount(privateKey),
        ]),
      ) as Record<keyof ActorSet, ActorAccount>);
  const actors = {
    owner: accounts.owner.address,
    unrelated: accounts.unrelated.address,
    keeper: accounts.keeper.address,
    adapter: accounts.adapter.address,
    token: accounts.token.address,
  };
  if (
    new Set([deployer, ...Object.values(actors)].map((address) => address.toLowerCase())).size !== 6
  ) {
    fail(
      'The configured ACL feasibility actors must be distinct from each other and the deployer.',
    );
  }
  return { actors, ownerAccount: accounts.owner, unrelatedAccount: accounts.unrelated };
}

async function assertPublicBoolean(
  handleClient: Awaited<ReturnType<typeof createViemHandleClient>>,
  handle: Hex,
  expected: boolean,
): Promise<void> {
  for (let attempt = 1; attempt <= PUBLIC_DECRYPT_MAX_ATTEMPTS; ++attempt) {
    try {
      const result = await handleClient.publicDecrypt(handle);
      if (result.value !== expected) {
        fail('A public ACL feasibility assertion did not match its expected boolean result.');
      }
      return;
    } catch {
      if (attempt === PUBLIC_DECRYPT_MAX_ATTEMPTS) {
        fail(
          'A public ACL feasibility assertion was unavailable after the bounded gateway retry window.',
        );
      }
      await delay(PUBLIC_DECRYPT_RETRY_DELAY_MS);
    }
  }
}

async function assertOwnerDecrypt(
  handleClient: Awaited<ReturnType<typeof createViemHandleClient>>,
  handle: Hex,
): Promise<void> {
  for (let attempt = 1; attempt <= PUBLIC_DECRYPT_MAX_ATTEMPTS; ++attempt) {
    try {
      const result = await handleClient.decrypt(handle);
      if (result.value !== DERIVED_OWNER_VALUE) {
        fail('The owner decryption did not match the expected in-memory test value.');
      }
      return;
    } catch {
      if (attempt === PUBLIC_DECRYPT_MAX_ATTEMPTS) {
        fail('The owner decryption was unavailable after the bounded gateway retry window.');
      }
      await delay(PUBLIC_DECRYPT_RETRY_DELAY_MS);
    }
  }
}

async function assertRejected(action: () => Promise<unknown>, scenario: string): Promise<void> {
  try {
    await action();
  } catch {
    return;
  }
  fail(`${scenario} did not fail on Sepolia.`);
}

async function main(): Promise<void> {
  loadEnvironment();

  const dryRun = process.argv.includes('--dry-run');
  const requestedCase = process.argv.find((argument) => argument === 'FND-03');
  const verifiedContracts = existingContracts();
  if (!requestedCase) {
    fail('The FND-03 case identifier is required.');
  }
  if (dryRun && verifiedContracts) {
    fail('Read-only verification cannot be combined with the deployment dry-run.');
  }

  const privateKey = process.env.SEPOLIA_PRIVATE_KEY;
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const actorMnemonic = process.env.SEPOLIA_ACTOR_MNEMONIC;
  if (!privateKey || !rpcUrl) {
    fail('The local Sepolia ACL test configuration is incomplete.');
  }
  if (!dryRun && !verifiedContracts && process.env.CONFIRM_SEPOLIA_WRITE !== CONFIRMATION_VALUE) {
    fail('Set CONFIRM_SEPOLIA_WRITE=yes only after reviewing the dry-run plan.');
  }

  const deployer = privateKeyToAccount(privateKey as Hex);
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const deployerWallet = createWalletClient({
    account: deployer,
    chain: sepolia,
    transport: http(rpcUrl),
  });
  const { actors, ownerAccount, unrelatedAccount } = deriveActors(
    actorMnemonic || undefined,
    deployer.address,
  );
  const ownerWallet = createWalletClient({
    account: ownerAccount,
    chain: sepolia,
    transport: http(rpcUrl),
  });
  const unrelatedWallet = createWalletClient({
    account: unrelatedAccount,
    chain: sepolia,
    transport: http(rpcUrl),
  });
  const artifact = loadArtifact();
  const ledger = loadLedger();
  const singleTransactionCapWei = configuredSingleTransactionCapWei(ledger);

  failureStage = 'Ethereum Sepolia preflight';
  if ((await publicClient.getChainId()) !== EXPECTED_CHAIN_ID) {
    fail('The configured RPC is not Ethereum Sepolia.');
  }
  if ((await publicClient.getBalance({ address: deployer.address })) === 0n) {
    fail('The configured throwaway Sepolia wallet has no balance.');
  }

  const fees = await publicClient.estimateFeesPerGas();
  const maxFeePerGas = fees.maxFeePerGas ?? (await publicClient.getGasPrice());
  let primaryAddress: Address;
  let negativeAddress: Address;

  if (verifiedContracts) {
    failureStage = 'existing ACL runtime verification';
    const [primaryRuntime, negativeRuntime] = await Promise.all(
      verifiedContracts.map((address) => publicClient.getCode({ address })),
    );
    if (
      !primaryRuntime ||
      !negativeRuntime ||
      primaryRuntime.toLowerCase() !== artifact.deployedBytecode.toLowerCase() ||
      negativeRuntime.toLowerCase() !== artifact.deployedBytecode.toLowerCase()
    ) {
      fail('An existing ACL feasibility contract runtime does not match the compiled harness.');
    }
    [primaryAddress, negativeAddress] = verifiedContracts;
  } else {
    failureStage = 'deployment dry-run planning';
    const deploymentGas = await publicClient.estimateGas({
      account: deployer.address,
      data: artifact.bytecode,
    });
    const deploymentMaximumGasCost = deploymentGas * maxFeePerGas;
    assertBudget(ledger, deploymentMaximumGasCost * 2n);
    assertSingleTransactionBudget(deploymentMaximumGasCost, singleTransactionCapWei);
    console.log(
      JSON.stringify({
        mode: dryRun ? 'dry-run' : 'confirmed-write',
        workItem: 'FND-03',
        firstAction: 'deploy two isolated ACL feasibility harnesses',
        deployments: 2,
        estimatedMaximumGasCostWeiPerDeployment: deploymentMaximumGasCost.toString(),
        singleTransactionCapWei: singleTransactionCapWei.toString(),
        remainingAllowanceWei: (BigInt(ledger.maxTotalSpendWei) - totalSpendWei(ledger)).toString(),
      }),
    );
    if (dryRun) {
      return;
    }

    assertCleanSourceTree();
    const deployedAddresses: Address[] = [];
    for (let index = 0; index < 2; ++index) {
      failureStage = 'isolated ACL harness deployment';
      const hash = await deployerWallet.deployContract({
        account: deployer,
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        gas: deploymentGas,
        maxFeePerGas,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      appendSpend(ledger, {
        workItemId: 'FND-03',
        phase: 'P0',
        sender: deployer.address,
        transactionHash: hash,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.effectiveGasPrice.toString(),
        actualGasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
      });
      if (receipt.status !== 'success' || !receipt.contractAddress) {
        fail('An isolated ACL harness deployment did not succeed.');
      }
      deployedAddresses.push(receipt.contractAddress);
    }
    [primaryAddress, negativeAddress] = deployedAddresses as [Address, Address];
  }

  failureStage = 'Nox gateway encryption';
  const ownerHandleClient = await createViemHandleClient(ownerWallet);
  const unrelatedHandleClient = await createViemHandleClient(unrelatedWallet);
  const ownerInput = (await ownerHandleClient.encryptInput(
    OWNER_INPUT,
    'uint256',
    primaryAddress,
  )) as EncryptedValue;

  if (!verifiedContracts) {
    failureStage = 'ACL materialization dry-run planning';
    const materializeData = encodeFunctionData({
      abi: artifact.abi,
      functionName: 'materialize',
      args: [ownerInput.handle, ownerInput.handleProof, actors.owner],
    } as never);
    const materializeGas = await publicClient.estimateGas({
      account: deployer.address,
      to: primaryAddress,
      data: materializeData,
    });
    const materializeMaximumGasCost = materializeGas * maxFeePerGas;
    assertBudget(ledger, materializeMaximumGasCost);
    assertSingleTransactionBudget(materializeMaximumGasCost, singleTransactionCapWei);
    console.log(
      JSON.stringify({
        mode: 'confirmed-write',
        workItem: 'FND-03',
        secondAction: 'submit encrypted owner input and persist minimal ACL',
        estimatedMaximumGasCostWei: materializeMaximumGasCost.toString(),
        singleTransactionCapWei: singleTransactionCapWei.toString(),
        remainingAllowanceWei: (BigInt(ledger.maxTotalSpendWei) - totalSpendWei(ledger)).toString(),
      }),
    );

    failureStage = 'ACL materialization';
    const materializeHash = await deployerWallet.sendTransaction({
      account: deployer,
      to: primaryAddress,
      data: materializeData,
      gas: materializeGas,
      maxFeePerGas,
    });
    const materializeReceipt = await publicClient.waitForTransactionReceipt({
      hash: materializeHash,
    });
    appendSpend(ledger, {
      workItemId: 'FND-03',
      phase: 'P0',
      sender: deployer.address,
      transactionHash: materializeHash,
      blockNumber: materializeReceipt.blockNumber.toString(),
      gasUsed: materializeReceipt.gasUsed.toString(),
      effectiveGasPrice: materializeReceipt.effectiveGasPrice.toString(),
      actualGasCostWei: (
        materializeReceipt.gasUsed * materializeReceipt.effectiveGasPrice
      ).toString(),
    });
    if (materializeReceipt.status !== 'success') {
      fail('The ACL materialization transaction did not succeed.');
    }

    failureStage = 'persistence proof dry-run planning';
    const persistenceData = encodeFunctionData({
      abi: artifact.abi,
      functionName: 'provePersistence',
    } as never);
    const persistenceGas = await publicClient.estimateGas({
      account: deployer.address,
      to: primaryAddress,
      data: persistenceData,
    });
    const persistenceMaximumGasCost = persistenceGas * maxFeePerGas;
    assertBudget(ledger, persistenceMaximumGasCost);
    assertSingleTransactionBudget(persistenceMaximumGasCost, singleTransactionCapWei);
    console.log(
      JSON.stringify({
        mode: 'confirmed-write',
        workItem: 'FND-03',
        thirdAction: 'prove persistent pool computation in a later transaction',
        estimatedMaximumGasCostWei: persistenceMaximumGasCost.toString(),
        singleTransactionCapWei: singleTransactionCapWei.toString(),
        remainingAllowanceWei: (BigInt(ledger.maxTotalSpendWei) - totalSpendWei(ledger)).toString(),
      }),
    );

    failureStage = 'persistence proof';
    const persistenceHash = await deployerWallet.sendTransaction({
      account: deployer,
      to: primaryAddress,
      data: persistenceData,
      gas: persistenceGas,
      maxFeePerGas,
    });
    const persistenceReceipt = await publicClient.waitForTransactionReceipt({
      hash: persistenceHash,
    });
    appendSpend(ledger, {
      workItemId: 'FND-03',
      phase: 'P0',
      sender: deployer.address,
      transactionHash: persistenceHash,
      blockNumber: persistenceReceipt.blockNumber.toString(),
      gasUsed: persistenceReceipt.gasUsed.toString(),
      effectiveGasPrice: persistenceReceipt.effectiveGasPrice.toString(),
      actualGasCostWei: (
        persistenceReceipt.gasUsed * persistenceReceipt.effectiveGasPrice
      ).toString(),
    });
    if (persistenceReceipt.status !== 'success') {
      fail('The persistent ACL computation transaction did not succeed.');
    }
  }

  failureStage = 'ACL authority matrix';
  const derivedHandle = (await publicClient.readContract({
    address: primaryAddress,
    abi: artifact.abi,
    functionName: 'derivedHandle',
  } as never)) as Hex;
  const persistenceHandle = (await publicClient.readContract({
    address: primaryAddress,
    abi: artifact.abi,
    functionName: 'persistenceHandle',
  } as never)) as Hex;
  const authorityOf = async (actor: Address): Promise<readonly [boolean, boolean, boolean]> =>
    (await publicClient.readContract({
      address: primaryAddress,
      abi: artifact.abi,
      functionName: 'authorityOf',
      args: [actor],
    } as never)) as readonly [boolean, boolean, boolean];

  const [
    poolAuthority,
    ownerAuthority,
    unrelatedAuthority,
    keeperAuthority,
    adapterAuthority,
    tokenAuthority,
  ] = await Promise.all([
    authorityOf(primaryAddress),
    authorityOf(actors.owner),
    authorityOf(actors.unrelated),
    authorityOf(actors.keeper),
    authorityOf(actors.adapter),
    authorityOf(actors.token),
  ]);
  const equals = (actual: readonly boolean[], expected: readonly boolean[]) =>
    actual.length === expected.length && actual.every((value, index) => value === expected[index]);
  if (
    !equals(poolAuthority, [true, true, false]) ||
    !equals(ownerAuthority, [false, true, false]) ||
    !equals(unrelatedAuthority, [false, false, false]) ||
    !equals(keeperAuthority, [false, false, false]) ||
    !equals(adapterAuthority, [false, false, false]) ||
    !equals(tokenAuthority, [false, false, false])
  ) {
    fail('The observed ACL authority matrix did not match the required minimal permissions.');
  }

  failureStage = 'owner and public decryption scope';
  await assertOwnerDecrypt(ownerHandleClient, derivedHandle);
  await assertRejected(
    () => unrelatedHandleClient.decrypt(derivedHandle),
    'Unrelated viewer decryption',
  );
  await assertRejected(
    () => ownerHandleClient.publicDecrypt(derivedHandle),
    'Public decryption of the owner-shaped handle',
  );
  await assertPublicBoolean(ownerHandleClient, persistenceHandle, true);

  failureStage = 'direct compute authority';
  const directComputeData = encodeFunctionData({
    abi: NOX_COMPUTE_ABI,
    functionName: 'add',
    args: [derivedHandle, derivedHandle],
  });
  await publicClient.call({
    account: primaryAddress,
    to: NOX_COMPUTE_ADDRESS,
    data: directComputeData,
  });
  for (const actor of [
    actors.owner,
    actors.unrelated,
    actors.keeper,
    actors.adapter,
    actors.token,
  ]) {
    await assertRejected(
      () => publicClient.call({ account: actor, to: NOX_COMPUTE_ADDRESS, data: directComputeData }),
      'Non-pool compute authority',
    );
  }

  failureStage = 'input context and replay checks';
  const materialize = (value: EncryptedValue, ownerAddress: Address): Hex =>
    encodeFunctionData({
      abi: artifact.abi,
      functionName: 'materialize',
      args: [value.handle, value.handleProof, ownerAddress],
    } as never);
  await assertRejected(
    () =>
      publicClient.call({
        account: deployer.address,
        to: primaryAddress,
        data: materialize(ownerInput, actors.owner),
      }),
    'Replayed encrypted owner input',
  );
  const wrongContextInput = (await ownerHandleClient.encryptInput(
    2n,
    'uint256',
    primaryAddress,
  )) as EncryptedValue;
  await assertRejected(
    () =>
      publicClient.call({
        account: deployer.address,
        to: negativeAddress,
        data: materialize(wrongContextInput, actors.owner),
      }),
    'Cross-spike encrypted input context',
  );
  const wrongTypeInput = (await ownerHandleClient.encryptInput(
    2n,
    'uint16',
    negativeAddress,
  )) as EncryptedValue;
  await assertRejected(
    () =>
      publicClient.call({
        account: deployer.address,
        to: negativeAddress,
        data: materialize(wrongTypeInput, actors.owner),
      }),
    'Wrong encrypted ACL input type',
  );
  await assertRejected(
    () =>
      publicClient.call({
        account: deployer.address,
        to: negativeAddress,
        data: materialize(
          { handle: `0x${'00'.repeat(32)}` as Hex, handleProof: '0x' },
          actors.owner,
        ),
      }),
    'Uninitialized external ACL handle',
  );

  console.log(
    JSON.stringify({
      workItem: 'FND-03',
      contractsVerified: 2,
      authorityAssertionsVerified: 18,
      decryptionScopeAssertionsVerified: 3,
      negativeAssertionsVerified: 9,
      status: 'passed',
    }),
  );
}

main().catch(() => {
  console.error(
    `FND-03 failed during ${failureStage}: inspect the sanitized receipt, spend ledger, and Nox feedback report.`,
  );
  process.exitCode = 1;
});
