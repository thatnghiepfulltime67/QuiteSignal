import { isAddress, isHash, type Address, type Hash } from 'viem';

export const SEPOLIA_CHAIN_ID = 11_155_111;

export interface ContractBinding {
  id: string;
  address: Address;
  runtimeCodeHash: Hash;
}

export interface EpochExpectation {
  state: number;
  winner: number;
  participantCount: number;
  publicYes: string;
  publicNo: string;
  settledRoundId: string;
  settledAnswer: string;
}

export interface PoolBinding {
  contractId: string;
  address: Address;
  confidentialCollateral: Address;
  resolutionAdapter: Address;
  epoch: EpochExpectation;
}

export interface ReceiptBinding {
  transactionHash: Hash;
}

export interface ProtocolManifest {
  schemaVersion: 1;
  chainId: number;
  epochVerificationBlock?: bigint;
  contracts: ContractBinding[];
  pools: PoolBinding[];
  receipts: ReceiptBinding[];
}

const FORBIDDEN_FIELD =
  /(plaintext|private|secret|seed|mnemonic|signature|stake|probability|position|payout|refund|score|handle|proof)/i;

function fail(message: string): never {
  throw new Error(`Invalid protocol manifest: ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${path} must be an object.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${path} must be a non-empty string.`);
  return value;
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail(`${path} must be an unsigned integer.`);
  return value as number;
}

function decimal(value: unknown, path: string): string {
  const result = text(value, path);
  if (!/^-?(0|[1-9][0-9]*)$/.test(result)) fail(`${path} must be a canonical decimal string.`);
  return result;
}

function address(value: unknown, path: string): Address {
  const result = text(value, path);
  if (!isAddress(result, { strict: false })) fail(`${path} must be an address.`);
  return result as Address;
}

function hash(value: unknown, path: string): Hash {
  const result = text(value, path);
  if (!isHash(result)) fail(`${path} must be a 32-byte hash.`);
  return result as Hash;
}

function rejectForbiddenFields(value: unknown, path = 'manifest'): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectForbiddenFields(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_FIELD.test(key)) fail(`${path}.${key} is not permitted.`);
    rejectForbiddenFields(child, `${path}.${key}`);
  }
}

function parseEpoch(value: unknown, path: string): EpochExpectation {
  const input = record(value, path);
  const state = nonNegativeInteger(input.state, `${path}.state`);
  const winner = nonNegativeInteger(input.winner, `${path}.winner`);
  const participantCount = nonNegativeInteger(input.participantCount, `${path}.participantCount`);
  if (state > 5 || winner > 2) fail(`${path} contains an unsupported public enum value.`);
  return {
    state,
    winner,
    participantCount,
    publicYes: decimal(input.publicYes, `${path}.publicYes`),
    publicNo: decimal(input.publicNo, `${path}.publicNo`),
    settledRoundId: decimal(input.settledRoundId, `${path}.settledRoundId`),
    settledAnswer: decimal(input.settledAnswer, `${path}.settledAnswer`),
  };
}

function deploymentEpochBlock(value: unknown): bigint | undefined {
  if (value === undefined) return undefined;
  const deployment = record(value, 'manifest.deployment');
  const block = BigInt(decimal(deployment.deployedAtBlock, 'manifest.deployment.deployedAtBlock'));
  if (block === 0n) fail('manifest.deployment.deployedAtBlock must be positive.');
  return block;
}

export function parseManifest(value: unknown): ProtocolManifest {
  rejectForbiddenFields(value);
  const input = record(value, 'manifest');
  if (input.schemaVersion !== 1) fail('schemaVersion must be 1.');
  if (input.chainId !== SEPOLIA_CHAIN_ID) fail(`chainId must be ${SEPOLIA_CHAIN_ID}.`);
  if (!Array.isArray(input.contracts) || input.contracts.length === 0)
    fail('contracts must be a non-empty array.');
  if (!Array.isArray(input.pools) || input.pools.length === 0)
    fail('pools must be a non-empty array.');
  if (!Array.isArray(input.receipts) || input.receipts.length === 0)
    fail('receipts must be a non-empty array.');
  const contracts = input.contracts.map((value_, index) => {
    const item = record(value_, `contracts[${index}]`);
    return {
      id: text(item.id, `contracts[${index}].id`),
      address: address(item.address, `contracts[${index}].address`),
      runtimeCodeHash: hash(item.runtimeCodeHash, `contracts[${index}].runtimeCodeHash`),
    };
  });
  const ids = new Set<string>();
  const addresses = new Set<string>();
  for (const item of contracts) {
    if (ids.has(item.id) || addresses.has(item.address.toLowerCase()))
      fail('contract ids and addresses must be unique.');
    ids.add(item.id);
    addresses.add(item.address.toLowerCase());
  }
  const pools = input.pools.map((value_, index) => {
    const item = record(value_, `pools[${index}]`);
    const contractId = text(item.contractId, `pools[${index}].contractId`);
    const poolAddress = address(item.address, `pools[${index}].address`);
    if (!ids.has(contractId)) fail(`pools[${index}].contractId does not bind a contract.`);
    const contract = contracts.find((candidate) => candidate.id === contractId);
    if (!contract || contract.address.toLowerCase() !== poolAddress.toLowerCase())
      fail(`pools[${index}] does not match its contract binding.`);
    return {
      contractId,
      address: poolAddress,
      confidentialCollateral: address(
        item.confidentialCollateral,
        `pools[${index}].confidentialCollateral`,
      ),
      resolutionAdapter: address(item.resolutionAdapter, `pools[${index}].resolutionAdapter`),
      epoch: parseEpoch(item.epoch, `pools[${index}].epoch`),
    };
  });
  if (new Set(pools.map((pool) => pool.address.toLowerCase())).size !== pools.length)
    fail('pool addresses must be unique.');
  const receipts = input.receipts.map((value_, index) => {
    const item = record(value_, `receipts[${index}]`);
    return { transactionHash: hash(item.transactionHash, `receipts[${index}].transactionHash`) };
  });
  if (
    new Set(receipts.map((receipt) => receipt.transactionHash.toLowerCase())).size !==
    receipts.length
  )
    fail('receipt transaction hashes must be unique.');
  const epochVerificationBlock = deploymentEpochBlock(input.deployment);
  return {
    schemaVersion: 1,
    chainId: SEPOLIA_CHAIN_ID,
    ...(epochVerificationBlock === undefined ? {} : { epochVerificationBlock }),
    contracts,
    pools,
    receipts,
  };
}
