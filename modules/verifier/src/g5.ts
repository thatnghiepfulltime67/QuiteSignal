export const G5_COMPONENTS = [
  { id: 'PK-03A', file: 'PK-03A-ADAPTER.json' },
  { id: 'PK-03B', file: 'PK-03B-FACTORY.json' },
  { id: 'PK-04', file: 'PK-04-COMMIT.json' },
  { id: 'PK-05', file: 'PK-05-AGGREGATE.json' },
  { id: 'PK-06', file: 'PK-06-RESOLUTION.json' },
  { id: 'PK-07', file: 'PK-07-TERMINALS.json' },
  { id: 'PK-08', file: 'PK-08-VERIFIER.json' },
] as const;

export type G5ComponentId = (typeof G5_COMPONENTS)[number]['id'];

export interface G5ComponentReport {
  id: G5ComponentId;
  checkCount: number;
}

export interface G5EvidenceReport {
  schemaVersion: 1;
  gate: 'G5';
  componentCount: number;
  components: G5ComponentReport[];
  status: 'passed';
}

// Evidence check names may describe public outcomes such as a confidential refund
// or score ACL. Only exact data-bearing field names are prohibited, so semantic
// check labels cannot make an otherwise sanitized report unverifiable.
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
  throw new Error(`G5 evidence verification failed: ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${path} must be an object.`);
  return value as Record<string, unknown>;
}

function rejectForbiddenFields(value: unknown, path = 'evidence'): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectForbiddenFields(child, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.replace(/[^a-z]/gi, '').toLowerCase();
    if (FORBIDDEN_FIELD.has(normalizedKey)) fail(`${path}.${key} is not permitted.`);
    rejectForbiddenFields(child, `${path}.${key}`);
  }
}

function extractChainId(value: Record<string, unknown>): unknown {
  if (value.chainId !== undefined) return value.chainId;
  const environment = value.environment;
  if (!environment || typeof environment !== 'object' || Array.isArray(environment))
    return undefined;
  return (environment as Record<string, unknown>).chainId;
}

function checkCount(value: Record<string, unknown>, id: string): number {
  const checks = record(value.checks, `${id}.checks`);
  const entries = Object.entries(checks);
  if (entries.length === 0 || entries.some(([, result]) => result !== true))
    fail(`${id}.checks must contain only passing boolean checks.`);
  return entries.length;
}

export function verifyG5Evidence(
  components: Readonly<Record<G5ComponentId, unknown>>,
): G5EvidenceReport {
  const reports = G5_COMPONENTS.map(({ id }) => {
    const value = record(components[id], id);
    rejectForbiddenFields(value, id);
    if (value.schemaVersion !== 1 || value.status !== 'passed')
      fail(`${id} is not a passed v1 artifact.`);
    if (extractChainId(value) !== 11_155_111) fail(`${id} is not Ethereum Sepolia evidence.`);
    if (id !== 'PK-08') {
      if (value.gate !== 'G5' || value.workItem !== id)
        fail(`${id} is bound to the wrong gate or work item.`);
      if (typeof value.sourceCommit !== 'string' || !/^[0-9a-f]{40}$/i.test(value.sourceCommit))
        fail(`${id} has no valid source commit.`);
    }
    return { id, checkCount: checkCount(value, id) };
  });
  return {
    schemaVersion: 1,
    gate: 'G5',
    componentCount: reports.length,
    components: reports,
    status: 'passed',
  };
}
