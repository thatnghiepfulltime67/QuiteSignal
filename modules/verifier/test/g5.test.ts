import assert from 'node:assert/strict';
import test from 'node:test';

import { G5_COMPONENTS, type G5ComponentId, verifyG5Evidence } from '../src/g5.js';

type Components = Record<G5ComponentId, unknown>;

function components(): Components {
  return Object.fromEntries(
    G5_COMPONENTS.map(({ id }) => [
      id,
      id === 'PK-08'
        ? {
            schemaVersion: 1,
            chainId: 11_155_111,
            checks: { runtimeCodeHashes: true },
            status: 'passed',
          }
        : {
            schemaVersion: 1,
            gate: 'G5',
            workItem: id,
            sourceCommit: 'a'.repeat(40),
            environment: { chainId: 11_155_111 },
            checks: { expected: true },
            status: 'passed',
          },
    ]),
  ) as Components;
}

test('T-VERIFIER-PK09-01: complete component evidence produces a G5 report', () => {
  const report = verifyG5Evidence(components());
  assert.equal(report.status, 'passed');
  assert.equal(report.componentCount, 7);
  assert.deepEqual(
    report.components.map((component) => component.id),
    G5_COMPONENTS.map((component) => component.id),
  );
});

test('T-VERIFIER-PK09-02: component status, binding, chain, and check mutations fail closed', () => {
  const cases: Array<[string, Components]> = [
    ['missing PK-07', { ...components(), 'PK-07': undefined } as unknown as Components],
    [
      'wrong work item',
      {
        ...components(),
        'PK-06': { ...(components()['PK-06'] as object), workItem: 'PK-05' },
      },
    ],
    [
      'wrong chain',
      {
        ...components(),
        'PK-08': { ...(components()['PK-08'] as object), chainId: 1 },
      },
    ],
    [
      'failed check',
      {
        ...components(),
        'PK-05': { ...(components()['PK-05'] as object), checks: { expected: false } },
      },
    ],
    [
      'forbidden field',
      {
        ...components(),
        'PK-04': { ...(components()['PK-04'] as object), proof: 'forbidden' },
      },
    ],
  ];
  for (const [name, value] of cases) {
    assert.throws(() => verifyG5Evidence(value), /G5 evidence verification failed/, name);
  }
});
