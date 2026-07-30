export const G6_COMPONENTS = [
  { id: 'SDK-02', file: 'SDK-02-CLIENT.json' },
  { id: 'SDK-03', file: 'SDK-03-TRANSACTION-CLIENT.json' },
  { id: 'DEP-01', file: 'DEP-01-DEPLOYMENT.json' },
  { id: 'VER-01', file: 'VER-01-PUBLIC-VERIFIER.json' },
  { id: 'AUT-01', file: 'AUT-01-RELAYER.json' },
  { id: 'IDX-01', file: 'IDX-01-READ-MODEL.json' },
  { id: 'LIVE-01-MANIFEST', file: 'LIVE-01-MANIFEST.json' },
  { id: 'LIVE-01-VERIFIER', file: 'LIVE-01-VERIFIER.json' },
  { id: 'LIVE-01-READ-MODEL', file: 'LIVE-01-READ-MODEL.json' },
  { id: 'LIVE-02-BELOW-K-MANIFEST', file: 'LIVE-02-BELOW-K-MANIFEST.json' },
  { id: 'LIVE-02-BELOW-K-VERIFIER', file: 'LIVE-02-BELOW-K-VERIFIER.json' },
  { id: 'LIVE-02-BELOW-K-READ-MODEL', file: 'LIVE-02-BELOW-K-READ-MODEL.json' },
  { id: 'LIVE-02-TIMEOUT-MANIFEST', file: 'LIVE-02-TIMEOUT-MANIFEST.json' },
  { id: 'LIVE-02-TIMEOUT-VERIFIER', file: 'LIVE-02-TIMEOUT-VERIFIER.json' },
  { id: 'LIVE-02-TIMEOUT-READ-MODEL', file: 'LIVE-02-TIMEOUT-READ-MODEL.json' },
  { id: 'LIVE-02-RECOVERY', file: 'LIVE-02-RECOVERY.json' },
] as const;

export type G6ComponentId = (typeof G6_COMPONENTS)[number]['id'];

export interface G6ComponentReport {
  id: G6ComponentId;
  file: (typeof G6_COMPONENTS)[number]['file'];
  conclusionCount: number;
}

export interface G6EvidenceReport {
  schemaVersion: 1;
  gate: 'G6';
  componentCount: number;
  components: G6ComponentReport[];
  sourceCommits: string[];
  coverage: {
    sdk: true;
    deployment: true;
    publicVerifier: true;
    permissionlessAutomation: true;
    rebuildableReadModel: true;
    settledTwoOwnerLifecycle: true;
    belowThresholdRecovery: true;
    aggregateTimeoutRecovery: true;
  };
  status: 'passed';
}

const SEPOLIA_CHAIN_ID = 11_155_111;
const ZERO_BYTES32 = `0x${'0'.repeat(64)}`;
const SOURCE_COMMIT = /^[0-9a-f]{40}$/i;

// Check labels can describe a public terminal outcome. Only exact data-bearing
// field names are prohibited, so a sanitized public evidence schema remains usable.
const FORBIDDEN_FIELD = new Set([
  'plaintext',
  'privatekey',
  'secret',
  'seed',
  'mnemonic',
  'signature',
  'stake',
  'probability',
  'position',
  'payout',
  'refund',
  'score',
  'handle',
  'handleproof',
  'proof',
]);

function fail(message: string): never {
  throw new Error(`G6 evidence verification failed: ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(`${path} must be an array.`);
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${path} must be a non-empty string.`);
  return value;
}

function number(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    fail(`${path} must be a safe integer.`);
  }
  return value;
}

function rejectForbiddenFields(value: unknown, path = 'evidence'): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectForbiddenFields(child, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.replace(/[^a-z]/gi, '').toLowerCase();
    if (FORBIDDEN_FIELD.has(normalized)) fail(`${path}.${key} is not permitted.`);
    rejectForbiddenFields(child, `${path}.${key}`);
  }
}

function extractChainId(value: Record<string, unknown>): unknown {
  if (value.chainId !== undefined) return value.chainId;
  const environment = value.environment;
  if (environment && typeof environment === 'object' && !Array.isArray(environment)) {
    return (environment as Record<string, unknown>).chainId;
  }
  const checkpoint = value.checkpoint;
  if (checkpoint && typeof checkpoint === 'object' && !Array.isArray(checkpoint)) {
    return (checkpoint as Record<string, unknown>).chainId;
  }
  return undefined;
}

function requirePassedChecks(value: Record<string, unknown>, id: string): number {
  const checks = record(value.checks, `${id}.checks`);
  const entries = Object.entries(checks);
  if (entries.length === 0 || entries.some(([, result]) => result !== true)) {
    fail(`${id}.checks must contain only passing boolean checks.`);
  }
  return entries.length;
}

function requireV1Artifact(value: Record<string, unknown>, id: string): void {
  if (value.schemaVersion !== 1) fail(`${id} is not a v1 artifact.`);
}

function requirePassedArtifact(value: Record<string, unknown>, id: string): void {
  requireV1Artifact(value, id);
  if (value.status !== 'passed') fail(`${id} is not a passed artifact.`);
}

function requireSepolia(value: Record<string, unknown>, id: string): void {
  requirePassedArtifact(value, id);
  if (extractChainId(value) !== SEPOLIA_CHAIN_ID) fail(`${id} is not Ethereum Sepolia evidence.`);
}

function requireWorkItem(value: Record<string, unknown>, id: string, workItem: string): void {
  if (value.workItem !== workItem && value.workItemId !== workItem) {
    fail(`${id} is bound to the wrong work item.`);
  }
}

function sourceCommit(value: Record<string, unknown>, id: string): string | undefined {
  if (value.sourceCommit === undefined) return undefined;
  const commit = string(value.sourceCommit, `${id}.sourceCommit`);
  if (!SOURCE_COMMIT.test(commit)) fail(`${id}.sourceCommit is invalid.`);
  return commit.toLowerCase();
}

function requireManifest(value: Record<string, unknown>, id: string, workItem: string): number {
  requireV1Artifact(value, id);
  if (extractChainId(value) !== SEPOLIA_CHAIN_ID) fail(`${id} is not Ethereum Sepolia evidence.`);
  const deployment = record(value.deployment, `${id}.deployment`);
  if (deployment.workItemId !== workItem) fail(`${id} is bound to the wrong work item.`);
  string(deployment.deployedAtBlock, `${id}.deployment.deployedAtBlock`);
  const contracts = array(value.contracts, `${id}.contracts`);
  const pools = array(value.pools, `${id}.pools`);
  const receipts = array(value.receipts, `${id}.receipts`);
  if (contracts.length < 5 || pools.length !== 1 || receipts.length === 0) {
    fail(`${id} is missing its public deployment context.`);
  }
  return contracts.length + pools.length + receipts.length;
}

function requireProjection(
  value: Record<string, unknown>,
  id: string,
  expected: { phase: string; participants: number },
): void {
  requireSepolia(value, id);
  requireWorkItem(value, id, 'IDX-01');
  if (value.environment !== 'sepolia-read') fail(`${id} is not a Sepolia read-model report.`);
  const projection = record(value.projection, `${id}.projection`);
  if (
    projection.phase !== expected.phase ||
    number(projection.participantCount, `${id}.projection.participantCount`) !==
      expected.participants
  ) {
    fail(`${id} does not contain the expected finalized public projection.`);
  }
}

function requireNonNegativeDecimal(value: unknown, path: string): void {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) fail(`${path} must be a decimal integer.`);
}

export function verifyG6Evidence(
  components: Readonly<Record<G6ComponentId, unknown>>,
): G6EvidenceReport {
  const evidence = Object.fromEntries(
    G6_COMPONENTS.map(({ id }) => {
      const value = record(components[id], id);
      rejectForbiddenFields(value, id);
      return [id, value];
    }),
  ) as Record<G6ComponentId, Record<string, unknown>>;

  const conclusions = new Map<G6ComponentId, number>();
  const commits = new Set<string>();
  const captureCommit = (id: G6ComponentId): void => {
    const commit = sourceCommit(evidence[id], id);
    if (commit) commits.add(commit);
  };

  for (const id of ['SDK-02', 'SDK-03'] as const) {
    const value = evidence[id];
    requireSepolia(value, id);
    if (value.gate !== 'G6' || value.phase !== 'P2')
      fail(`${id} is bound to the wrong gate or phase.`);
    requireWorkItem(value, id, id);
    conclusions.set(id, requirePassedChecks(value, id));
    captureCommit(id);
  }

  for (const id of ['DEP-01', 'VER-01'] as const) {
    const value = evidence[id];
    requireSepolia(value, id);
    conclusions.set(id, requirePassedChecks(value, id));
    captureCommit(id);
  }

  const automation = evidence['AUT-01'];
  requirePassedArtifact(automation, 'AUT-01');
  requireWorkItem(automation, 'AUT-01', 'AUT-01');
  if (automation.environment !== 'sepolia-read') fail('AUT-01 is not a Sepolia read report.');
  const actions = array(automation.actions, 'AUT-01.actions').map((value, index) =>
    record(value, `AUT-01.actions[${index}]`),
  );
  const actionNames = actions.map((value, index) =>
    string(value.action, `AUT-01.actions[${index}].action`),
  );
  if (
    actionNames.length !== 3 ||
    new Set(actionNames).size !== 3 ||
    !['close-epoch', 'request-aggregate-decrypt', 'finalize-aggregate'].every((name) =>
      actionNames.includes(name),
    )
  ) {
    fail('AUT-01 does not contain one of every required permissionless action.');
  }
  const automationEpoch = record(automation.publicEpoch, 'AUT-01.publicEpoch');
  if (
    number(automationEpoch.state, 'AUT-01.publicEpoch.state') !== 3 ||
    number(automationEpoch.participantCount, 'AUT-01.publicEpoch.participantCount') !== 2
  ) {
    fail('AUT-01 did not reach the expected aggregate-finalized public state.');
  }
  requireNonNegativeDecimal(automationEpoch.publicYes, 'AUT-01.publicEpoch.publicYes');
  requireNonNegativeDecimal(automationEpoch.publicNo, 'AUT-01.publicEpoch.publicNo');
  if (automationEpoch.publicYes === '0' || automationEpoch.publicNo === '0') {
    fail('AUT-01 is missing one side of the public aggregate.');
  }
  const automationChecks = record(automation.checks, 'AUT-01.checks');
  if (automationChecks.sepoliaChain !== true) fail('AUT-01 does not prove Ethereum Sepolia.');
  conclusions.set('AUT-01', requirePassedChecks(automation, 'AUT-01'));
  captureCommit('AUT-01');

  const indexer = evidence['IDX-01'];
  requireProjection(indexer, 'IDX-01', { phase: 'refundable', participants: 0 });
  conclusions.set('IDX-01', requirePassedChecks(indexer, 'IDX-01'));
  captureCommit('IDX-01');

  for (const [id, workItem] of [
    ['LIVE-01-MANIFEST', 'LIVE-01'],
    ['LIVE-02-BELOW-K-MANIFEST', 'LIVE-02'],
    ['LIVE-02-TIMEOUT-MANIFEST', 'LIVE-02'],
  ] as const) {
    conclusions.set(id, requireManifest(evidence[id], id, workItem));
    captureCommit(id);
  }

  for (const id of [
    'LIVE-01-VERIFIER',
    'LIVE-02-BELOW-K-VERIFIER',
    'LIVE-02-TIMEOUT-VERIFIER',
  ] as const) {
    const value = evidence[id];
    requireSepolia(value, id);
    conclusions.set(id, requirePassedChecks(value, id));
    captureCommit(id);
  }

  const successProjection = evidence['LIVE-01-READ-MODEL'];
  requireProjection(successProjection, 'LIVE-01-READ-MODEL', { phase: 'settled', participants: 2 });
  const successPublic = record(successProjection.projection, 'LIVE-01-READ-MODEL.projection');
  requireNonNegativeDecimal(successPublic.publicYes, 'LIVE-01-READ-MODEL.projection.publicYes');
  requireNonNegativeDecimal(successPublic.publicNo, 'LIVE-01-READ-MODEL.projection.publicNo');
  if (
    successPublic.publicYes === '0' ||
    successPublic.publicNo === '0' ||
    successPublic.winner !== 1
  ) {
    fail('LIVE-01 is missing its settled public aggregate or winner.');
  }
  conclusions.set(
    'LIVE-01-READ-MODEL',
    requirePassedChecks(successProjection, 'LIVE-01-READ-MODEL'),
  );
  captureCommit('LIVE-01-READ-MODEL');

  const belowProjection = evidence['LIVE-02-BELOW-K-READ-MODEL'];
  requireProjection(belowProjection, 'LIVE-02-BELOW-K-READ-MODEL', {
    phase: 'refundable',
    participants: 1,
  });
  const belowPublic = record(belowProjection.projection, 'LIVE-02-BELOW-K-READ-MODEL.projection');
  if (belowPublic.aggregateRequestId !== null)
    fail('Below-threshold recovery requested an aggregate.');
  conclusions.set(
    'LIVE-02-BELOW-K-READ-MODEL',
    requirePassedChecks(belowProjection, 'LIVE-02-BELOW-K-READ-MODEL'),
  );
  captureCommit('LIVE-02-BELOW-K-READ-MODEL');

  const timeoutProjection = evidence['LIVE-02-TIMEOUT-READ-MODEL'];
  requireProjection(timeoutProjection, 'LIVE-02-TIMEOUT-READ-MODEL', {
    phase: 'refundable',
    participants: 2,
  });
  const timeoutPublic = record(
    timeoutProjection.projection,
    'LIVE-02-TIMEOUT-READ-MODEL.projection',
  );
  if (
    timeoutPublic.aggregateRequestId === null ||
    timeoutPublic.aggregateRequestId === ZERO_BYTES32
  ) {
    fail('Timeout recovery is missing the aggregate request context.');
  }
  conclusions.set(
    'LIVE-02-TIMEOUT-READ-MODEL',
    requirePassedChecks(timeoutProjection, 'LIVE-02-TIMEOUT-READ-MODEL'),
  );
  captureCommit('LIVE-02-TIMEOUT-READ-MODEL');

  const recovery = evidence['LIVE-02-RECOVERY'];
  requirePassedArtifact(recovery, 'LIVE-02-RECOVERY');
  if (recovery.environment !== 'sepolia-read') {
    fail('LIVE-02-RECOVERY is not a passed Sepolia read artifact.');
  }
  const cases = array(recovery.cases, 'LIVE-02-RECOVERY.cases').map((value, index) =>
    record(value, `LIVE-02-RECOVERY.cases[${index}]`),
  );
  if (cases.length !== 2) fail('LIVE-02-RECOVERY must contain exactly two recovery cases.');
  const casesById = new Map(cases.map((value) => [value.id, value]));
  const below = record(casesById.get('below-k'), 'LIVE-02-RECOVERY.below-k');
  const timeout = record(casesById.get('timeout'), 'LIVE-02-RECOVERY.timeout');
  const belowEpoch = record(below.publicEpoch, 'LIVE-02-RECOVERY.below-k.publicEpoch');
  const timeoutEpoch = record(timeout.publicEpoch, 'LIVE-02-RECOVERY.timeout.publicEpoch');
  for (const [caseId, recoveryCase] of [
    ['below-k', below],
    ['timeout', timeout],
  ] as const) {
    const historical = record(
      recoveryCase.historicalVerification,
      `LIVE-02-RECOVERY.${caseId}.historicalVerification`,
    );
    if (historical.chainId !== SEPOLIA_CHAIN_ID || historical.status !== 'passed') {
      fail(`LIVE-02-RECOVERY.${caseId} lacks a passed Ethereum Sepolia verification.`);
    }
  }
  if (
    belowEpoch.state !== 5 ||
    belowEpoch.participantCount !== 1 ||
    belowEpoch.aggregateRequestId !== ZERO_BYTES32 ||
    timeoutEpoch.state !== 5 ||
    timeoutEpoch.participantCount !== 2 ||
    timeoutEpoch.aggregateRequestId === ZERO_BYTES32
  ) {
    fail('LIVE-02 recovery cases do not prove the expected terminal public states.');
  }
  const timeoutReceipts = record(
    timeout.selectorReceipts,
    'LIVE-02-RECOVERY.timeout.selectorReceipts',
  );
  if (
    array(timeoutReceipts.request, 'LIVE-02-RECOVERY.timeout.selectorReceipts.request').length !==
      1 ||
    array(timeoutReceipts.cancel, 'LIVE-02-RECOVERY.timeout.selectorReceipts.cancel').length !==
      1 ||
    array(timeoutReceipts.refunds, 'LIVE-02-RECOVERY.timeout.selectorReceipts.refunds').length !== 2
  ) {
    fail('LIVE-02 timeout recovery receipt set is incomplete.');
  }
  conclusions.set('LIVE-02-RECOVERY', requirePassedChecks(recovery, 'LIVE-02-RECOVERY'));
  captureCommit('LIVE-02-RECOVERY');

  return {
    schemaVersion: 1,
    gate: 'G6',
    componentCount: G6_COMPONENTS.length,
    components: G6_COMPONENTS.map(({ id, file }) => ({
      id,
      file,
      conclusionCount: conclusions.get(id) ?? fail(`${id} has no conclusion count.`),
    })),
    sourceCommits: [...commits].sort(),
    coverage: {
      sdk: true,
      deployment: true,
      publicVerifier: true,
      permissionlessAutomation: true,
      rebuildableReadModel: true,
      settledTwoOwnerLifecycle: true,
      belowThresholdRecovery: true,
      aggregateTimeoutRecovery: true,
    },
    status: 'passed',
  };
}
