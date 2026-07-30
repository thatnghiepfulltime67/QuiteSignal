export type Brand<Value, Name extends string> = Value & { readonly __brand: Name };

export type PublicAddress = Brand<string, 'PublicAddress'>;
export type PoolId = Brand<string, 'PoolId'>;
export type RequestId = Brand<string, 'RequestId'>;
export type TransactionHash = Brand<string, 'TransactionHash'>;
export type DecimalInput = Brand<string, 'DecimalInput'>;

const UINT256_MAX = (1n << 256n) - 1n;

function fail(message: string): never {
  throw new Error(`Invalid public protocol value: ${message}`);
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string') fail(`${name} must be a string.`);
  return value;
}

function requireHex(value: unknown, name: string, bytes: number): string {
  const result = requireString(value, name);
  if (!new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`).test(result))
    fail(`${name} must be exactly ${bytes} bytes of hexadecimal data.`);
  return result.toLowerCase();
}

function requireDecimals(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 77)
    fail('decimal places must be an integer from 0 through 77.');
}

export function publicAddress(value: unknown): PublicAddress {
  return requireHex(value, 'address', 20) as PublicAddress;
}

export function poolId(value: unknown): PoolId {
  return requireHex(value, 'pool id', 32) as PoolId;
}

export function requestId(value: unknown): RequestId {
  return requireHex(value, 'request id', 32) as RequestId;
}

export function transactionHash(value: unknown): TransactionHash {
  return requireHex(value, 'transaction hash', 32) as TransactionHash;
}

export function decimalInput(value: unknown, decimals: number): DecimalInput {
  requireDecimals(decimals);
  const result = requireString(value, 'decimal value');
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(result))
    fail('decimal value must be a canonical non-negative decimal string.');
  const fraction = result.split('.')[1] ?? '';
  if (fraction.length > decimals) fail('decimal value exceeds the declared precision.');
  const [whole] = result.split('.');
  if (whole === undefined) fail('decimal value has no whole component.');
  const units =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0');
  if (units > UINT256_MAX) fail('decimal value exceeds uint256.');
  return result as DecimalInput;
}

export function parseBaseUnits(value: DecimalInput, decimals: number): bigint {
  requireDecimals(decimals);
  const [whole, fraction = ''] = value.split('.');
  if (whole === undefined) fail('decimal value has no whole component.');
  const units =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0');
  if (units > UINT256_MAX) fail('decimal value exceeds uint256.');
  return units;
}

export function formatBaseUnits(value: bigint, decimals: number): DecimalInput {
  requireDecimals(decimals);
  if (value < 0n || value > UINT256_MAX) fail('base units must be an unsigned uint256.');
  if (decimals === 0) return value.toString() as DecimalInput;
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return (fraction.length === 0 ? whole.toString() : `${whole}.${fraction}`) as DecimalInput;
}
