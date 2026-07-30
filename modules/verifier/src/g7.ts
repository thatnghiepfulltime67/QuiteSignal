import { isAddress, isHash, toFunctionSelector, type Address, type Hash, type Hex } from 'viem';

import { SEPOLIA_CHAIN_ID, type ProtocolManifest } from './manifest.js';

export interface G7BrowserEvidence {
  schemaVersion: 1;
  workItemId: 'WEB-08';
  mode: 'real-browser-wallet';
  sourceCommit: string;
  chainId: typeof SEPOLIA_CHAIN_ID;
  browser: {
    application: 'production Vite build';
    walletProvider: 'external EIP-1193';
    walletApproval: 'explicit extension confirmation';
    unexpectedConsoleOrExceptionEvents: 0;
    persistedTraceOrScreenshot: false;
    capturedConfidentialMaterial: false;
  };
  primary: {
    releaseId: string;
    pool: Address;
    collateral: Address;
    signalIntentTransactionHash: Hash;
    collateralCallbackTransactionHash: Hash;
    finalizationTransactionHash: Hash;
  };
  recovery: {
    releaseId: string;
    pool: Address;
    kind: 'closeEpoch' | 'cancelBeforeResolution';
    transactionHash: Hash;
  };
}

export interface G7TransactionObservation {
  hash: Hash;
  status: 'success' | 'reverted';
  to: Address | null;
  input: Hex;
}

export interface G7EvidenceReport {
  schemaVersion: 1;
  workItemId: 'WEB-08';
  chainId: typeof SEPOLIA_CHAIN_ID;
  primaryReleaseId: string;
  recoveryReleaseId: string;
  receiptCount: 4;
  status: 'passed';
}

function fail(message: string): never {
  throw new Error(`Invalid G7 browser evidence: ${message}`);
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

function address(value: unknown, path: string): Address {
  const result = text(value, path);
  if (!isAddress(result, { strict: false })) fail(`${path} must be an address.`);
  return result as Address;
}

function hash(value: unknown, path: string): Hash {
  const result = text(value, path);
  if (!isHash(result)) fail(`${path} must be a transaction hash.`);
  return result as Hash;
}

function releaseId(value: unknown, path: string): string {
  const result = text(value, path);
  if (!/^DEP-(?:0[2-9]|[1-9][0-9]*)$/.test(result))
    fail(`${path} must be an explicit post-canonical release ID.`);
  return result;
}

function literal<T extends string | number | boolean>(
  value: unknown,
  expected: T,
  path: string,
): T {
  if (value !== expected) fail(`${path} is not permitted.`);
  return expected;
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) fail(`${path}.${key} is not permitted.`);
  }
  for (const key of keys) {
    if (!(key in value)) fail(`${path}.${key} is required.`);
  }
}

export function parseG7BrowserEvidence(value: unknown): G7BrowserEvidence {
  const input = record(value, 'evidence');
  assertExactKeys(
    input,
    [
      'schemaVersion',
      'workItemId',
      'mode',
      'sourceCommit',
      'chainId',
      'browser',
      'primary',
      'recovery',
    ],
    'evidence',
  );
  literal(input.schemaVersion, 1, 'evidence.schemaVersion');
  literal(input.workItemId, 'WEB-08', 'evidence.workItemId');
  literal(input.mode, 'real-browser-wallet', 'evidence.mode');
  const sourceCommit = text(input.sourceCommit, 'evidence.sourceCommit');
  if (!/^[0-9a-f]{40}$/i.test(sourceCommit))
    fail('evidence.sourceCommit must be a git commit hash.');
  literal(input.chainId, SEPOLIA_CHAIN_ID, 'evidence.chainId');

  const browser = record(input.browser, 'evidence.browser');
  assertExactKeys(
    browser,
    [
      'application',
      'walletProvider',
      'walletApproval',
      'unexpectedConsoleOrExceptionEvents',
      'persistedTraceOrScreenshot',
      'capturedConfidentialMaterial',
    ],
    'evidence.browser',
  );
  const primary = record(input.primary, 'evidence.primary');
  assertExactKeys(
    primary,
    [
      'releaseId',
      'pool',
      'collateral',
      'signalIntentTransactionHash',
      'collateralCallbackTransactionHash',
      'finalizationTransactionHash',
    ],
    'evidence.primary',
  );
  const recovery = record(input.recovery, 'evidence.recovery');
  assertExactKeys(recovery, ['releaseId', 'pool', 'kind', 'transactionHash'], 'evidence.recovery');
  const parsed: G7BrowserEvidence = {
    schemaVersion: 1,
    workItemId: 'WEB-08',
    mode: 'real-browser-wallet',
    sourceCommit,
    chainId: SEPOLIA_CHAIN_ID,
    browser: {
      application: literal(
        input.browser && browser.application,
        'production Vite build',
        'evidence.browser.application',
      ),
      walletProvider: literal(
        browser.walletProvider,
        'external EIP-1193',
        'evidence.browser.walletProvider',
      ),
      walletApproval: literal(
        browser.walletApproval,
        'explicit extension confirmation',
        'evidence.browser.walletApproval',
      ),
      unexpectedConsoleOrExceptionEvents: literal(
        browser.unexpectedConsoleOrExceptionEvents,
        0,
        'evidence.browser.unexpectedConsoleOrExceptionEvents',
      ),
      persistedTraceOrScreenshot: literal(
        browser.persistedTraceOrScreenshot,
        false,
        'evidence.browser.persistedTraceOrScreenshot',
      ),
      capturedConfidentialMaterial: literal(
        browser.capturedConfidentialMaterial,
        false,
        'evidence.browser.capturedConfidentialMaterial',
      ),
    },
    primary: {
      releaseId: releaseId(primary.releaseId, 'evidence.primary.releaseId'),
      pool: address(primary.pool, 'evidence.primary.pool'),
      collateral: address(primary.collateral, 'evidence.primary.collateral'),
      signalIntentTransactionHash: hash(
        primary.signalIntentTransactionHash,
        'evidence.primary.signalIntentTransactionHash',
      ),
      collateralCallbackTransactionHash: hash(
        primary.collateralCallbackTransactionHash,
        'evidence.primary.collateralCallbackTransactionHash',
      ),
      finalizationTransactionHash: hash(
        primary.finalizationTransactionHash,
        'evidence.primary.finalizationTransactionHash',
      ),
    },
    recovery: {
      releaseId: releaseId(recovery.releaseId, 'evidence.recovery.releaseId'),
      pool: address(recovery.pool, 'evidence.recovery.pool'),
      kind:
        recovery.kind === 'closeEpoch' || recovery.kind === 'cancelBeforeResolution'
          ? recovery.kind
          : fail('evidence.recovery.kind is not permitted.'),
      transactionHash: hash(recovery.transactionHash, 'evidence.recovery.transactionHash'),
    },
  };
  const hashes = [
    parsed.primary.signalIntentTransactionHash,
    parsed.primary.collateralCallbackTransactionHash,
    parsed.primary.finalizationTransactionHash,
    parsed.recovery.transactionHash,
  ];
  if (new Set(hashes.map((item) => item.toLowerCase())).size !== hashes.length)
    fail('receipt hashes must be unique.');
  return parsed;
}

function assertManifestBinding(
  release: string,
  pool: Address,
  collateral: Address | undefined,
  manifest: ProtocolManifest,
  path: string,
): void {
  if (manifest.chainId !== SEPOLIA_CHAIN_ID || manifest.canonicalDeployment?.workItemId !== release)
    fail(`${path} does not match its immutable release manifest.`);
  const binding = manifest.pools.find(
    (candidate) => candidate.address.toLowerCase() === pool.toLowerCase(),
  );
  if (!binding) fail(`${path} pool is absent from its immutable release manifest.`);
  if (collateral && binding.confidentialCollateral.toLowerCase() !== collateral.toLowerCase())
    fail(`${path} collateral does not match its immutable pool binding.`);
}

function assertTransaction(
  expected: { hash: Hash; to: Address; selector: Hex },
  observation: G7TransactionObservation | undefined,
  path: string,
): void {
  if (!observation || observation.hash.toLowerCase() !== expected.hash.toLowerCase())
    fail(`${path} receipt is missing.`);
  if (observation.status !== 'success') fail(`${path} receipt did not succeed.`);
  if (!observation.to || observation.to.toLowerCase() !== expected.to.toLowerCase())
    fail(`${path} recipient does not match the release binding.`);
  if (observation.input.slice(0, 10).toLowerCase() !== expected.selector.toLowerCase())
    fail(`${path} selector does not match the required browser action.`);
}

export function verifyG7BrowserEvidence(
  evidence: G7BrowserEvidence,
  manifests: { primary: ProtocolManifest; recovery: ProtocolManifest },
  transactions: readonly G7TransactionObservation[],
): G7EvidenceReport {
  assertManifestBinding(
    evidence.primary.releaseId,
    evidence.primary.pool,
    evidence.primary.collateral,
    manifests.primary,
    'primary',
  );
  assertManifestBinding(
    evidence.recovery.releaseId,
    evidence.recovery.pool,
    undefined,
    manifests.recovery,
    'recovery',
  );
  const byHash = new Map(
    transactions.map((transaction) => [transaction.hash.toLowerCase(), transaction]),
  );
  assertTransaction(
    {
      hash: evidence.primary.signalIntentTransactionHash,
      to: evidence.primary.pool,
      selector: toFunctionSelector('commitSignal(bytes32,bytes,bytes32,bytes)'),
    },
    byHash.get(evidence.primary.signalIntentTransactionHash.toLowerCase()),
    'signal intent',
  );
  assertTransaction(
    {
      hash: evidence.primary.collateralCallbackTransactionHash,
      to: evidence.primary.collateral,
      selector: toFunctionSelector('confidentialTransferAndCall(address,bytes32,bytes,bytes)'),
    },
    byHash.get(evidence.primary.collateralCallbackTransactionHash.toLowerCase()),
    'collateral callback',
  );
  assertTransaction(
    {
      hash: evidence.primary.finalizationTransactionHash,
      to: evidence.primary.pool,
      selector: toFunctionSelector('finalizeCommit(bytes)'),
    },
    byHash.get(evidence.primary.finalizationTransactionHash.toLowerCase()),
    'finalization',
  );
  assertTransaction(
    {
      hash: evidence.recovery.transactionHash,
      to: evidence.recovery.pool,
      selector: toFunctionSelector(
        evidence.recovery.kind === 'closeEpoch' ? 'closeEpoch()' : 'cancelBeforeResolution()',
      ),
    },
    byHash.get(evidence.recovery.transactionHash.toLowerCase()),
    'permissionless recovery',
  );
  return {
    schemaVersion: 1,
    workItemId: 'WEB-08',
    chainId: SEPOLIA_CHAIN_ID,
    primaryReleaseId: evidence.primary.releaseId,
    recoveryReleaseId: evidence.recovery.releaseId,
    receiptCount: 4,
    status: 'passed',
  };
}
