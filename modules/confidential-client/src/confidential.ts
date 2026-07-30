import { createViemHandleClient } from '@iexec-nox/handle';
import type { Address, Hex, WalletClient } from 'viem';

import { publicAddress, requestId, type PublicAddress, type RequestId } from './public.js';

const SEPOLIA_CHAIN_ID = 11_155_111;
const UINT256_MAX = (1n << 256n) - 1n;

interface NoxEncryptor {
  encryptInput(
    value: bigint,
    solidityType: 'uint256',
    applicationContract: Address,
  ): Promise<{ handle: string; handleProof: string }>;
}

interface RawEncryptedInput {
  handle: Hex;
  handleProof: Hex;
}

export interface EncryptionContext {
  readonly chainId: number;
  readonly pool: PublicAddress;
  readonly request: RequestId;
}

export interface ContractEncryptedInput {
  readonly handle: Hex;
  readonly handleProof: Hex;
}

const rawInputs = new WeakMap<SealedUint256, RawEncryptedInput>();

function fail(message: string): never {
  throw new Error(`Confidential input rejected: ${message}`);
}

function canonicalContext(value: EncryptionContext, expectedChainId: number): EncryptionContext {
  if (!Number.isSafeInteger(value.chainId) || value.chainId !== expectedChainId)
    fail(`the input context must target chain ${expectedChainId}.`);
  try {
    return Object.freeze({
      chainId: value.chainId,
      pool: publicAddress(value.pool),
      request: requestId(value.request),
    });
  } catch {
    fail('the input context is invalid.');
  }
}

function equalContext(left: EncryptionContext, right: EncryptionContext): boolean {
  return (
    left.chainId === right.chainId && left.pool === right.pool && left.request === right.request
  );
}

function uint256(value: unknown): bigint {
  if (typeof value !== 'bigint' || value < 0n || value > UINT256_MAX)
    fail('the value must be an unsigned uint256 bigint.');
  return value;
}

function hex(value: string, name: string): Hex {
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(value)) fail(`Nox returned an invalid ${name}.`);
  return value.toLowerCase() as Hex;
}

export class SealedUint256 {
  readonly context: EncryptionContext;

  private constructor(context: EncryptionContext, raw: RawEncryptedInput) {
    this.context = context;
    rawInputs.set(this, raw);
  }

  static create(context: EncryptionContext, raw: RawEncryptedInput): SealedUint256 {
    return new SealedUint256(context, raw);
  }

  toJSON(): never {
    fail('sealed encrypted input cannot be serialized.');
  }
}

export class ConfidentialInputClient {
  readonly chainId: number;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    chainId: number,
    private readonly encryptor: NoxEncryptor,
  ) {
    if (!Number.isSafeInteger(chainId) || chainId !== SEPOLIA_CHAIN_ID)
      fail(`the client must use Ethereum Sepolia (${SEPOLIA_CHAIN_ID}).`);
    this.chainId = chainId;
  }

  async sealUint256(value: unknown, context: EncryptionContext): Promise<SealedUint256> {
    const number = uint256(value);
    const canonical = canonicalContext(context, this.chainId);
    const seal = async (): Promise<SealedUint256> => {
      const encrypted = await this.encryptor.encryptInput(
        number,
        'uint256',
        canonical.pool as Address,
      );
      return SealedUint256.create(canonical, {
        handle: hex(encrypted.handle, 'handle'),
        handleProof: hex(encrypted.handleProof, 'proof'),
      });
    };
    const operation = this.queue.then(seal, seal);
    this.queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
}

export async function createSepoliaConfidentialInputClient(
  wallet: WalletClient,
): Promise<ConfidentialInputClient> {
  const chainId = await wallet.getChainId();
  if (chainId !== SEPOLIA_CHAIN_ID)
    fail(`the client must use Ethereum Sepolia (${SEPOLIA_CHAIN_ID}).`);
  const encryptor = await createViemHandleClient(wallet);
  return new ConfidentialInputClient(chainId, encryptor);
}

export function contractEncryptedInput(
  sealed: SealedUint256,
  expectedContext: EncryptionContext,
): ContractEncryptedInput {
  const context = canonicalContext(expectedContext, sealed.context.chainId);
  if (!equalContext(sealed.context, context)) fail('the sealed input context does not match.');
  const raw = rawInputs.get(sealed);
  if (!raw) fail('the sealed input is unavailable.');
  return { ...raw };
}
