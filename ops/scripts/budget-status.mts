import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EXPECTED_CHAIN_ID = 11_155_111;

interface SpendEntry {
  actualGasCostWei: string;
}

interface SpendLedger {
  schemaVersion: number;
  chainId: number;
  maxTotalSpendWei: string;
  entries: SpendEntry[];
}

function fail(message: string): never {
  throw new Error(message);
}

function parseLedger(value: unknown): SpendLedger {
  if (value === null || typeof value !== 'object') {
    fail('The spend ledger must be a JSON object.');
  }

  const candidate = value as Partial<SpendLedger>;
  if (
    candidate.schemaVersion !== 1 ||
    candidate.chainId !== EXPECTED_CHAIN_ID ||
    typeof candidate.maxTotalSpendWei !== 'string' ||
    !Array.isArray(candidate.entries)
  ) {
    fail('The spend ledger does not match the required Sepolia schema.');
  }

  for (const entry of candidate.entries) {
    if (
      entry === null ||
      typeof entry !== 'object' ||
      typeof (entry as Partial<SpendEntry>).actualGasCostWei !== 'string' ||
      !/^\d+$/.test((entry as SpendEntry).actualGasCostWei)
    ) {
      fail('The spend ledger contains an invalid gas-cost entry.');
    }
  }

  if (!/^\d+$/.test(candidate.maxTotalSpendWei)) {
    fail('The spend ledger contains an invalid maximum spend amount.');
  }

  return candidate as SpendLedger;
}

function main(): void {
  const ledgerPath = resolve('evidence/sepolia/spend-ledger.json');
  const ledger = parseLedger(JSON.parse(readFileSync(ledgerPath, 'utf8')));
  const totalGasCostWei = ledger.entries.reduce(
    (total, entry) => total + BigInt(entry.actualGasCostWei),
    0n,
  );
  const maxTotalSpendWei = BigInt(ledger.maxTotalSpendWei);

  if (totalGasCostWei > maxTotalSpendWei) {
    fail('The recorded Sepolia gas spend exceeds the authorized allowance.');
  }

  console.log(
    JSON.stringify({
      chainId: ledger.chainId,
      entries: ledger.entries.length,
      spentGasWei: totalGasCostWei.toString(),
      remainingGasWei: (maxTotalSpendWei - totalGasCostWei).toString(),
      status: 'within-budget',
    }),
  );
}

try {
  main();
} catch {
  console.error('budget status failed: validate the sanitized Sepolia spend ledger.');
  process.exitCode = 1;
}
