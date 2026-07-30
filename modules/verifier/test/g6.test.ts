import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { G6_COMPONENTS, type G6ComponentId, verifyG6Evidence } from '../src/g6.js';

const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));

type Components = Record<G6ComponentId, unknown>;

function components(): Components {
  return Object.fromEntries(
    G6_COMPONENTS.map(({ id, file }) => [
      id,
      JSON.parse(readFileSync(resolve(ROOT, 'evidence/sepolia/G6', file), 'utf8')),
    ]),
  ) as Components;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test('T-VERIFIER-G6-01: complete Sepolia component evidence produces a G6 report', () => {
  const report = verifyG6Evidence(components());
  assert.equal(report.status, 'passed');
  assert.equal(report.componentCount, G6_COMPONENTS.length);
  assert.deepEqual(
    report.components.map((component) => component.id),
    G6_COMPONENTS.map((component) => component.id),
  );
  assert.equal(report.coverage.aggregateTimeoutRecovery, true);
});

test('T-VERIFIER-G6-02: lifecycle, recovery, and privacy mutations fail closed', () => {
  const valid = components();
  const cases: Array<[string, Components]> = [
    [
      'settled lifecycle has only one participant',
      {
        ...valid,
        'LIVE-01-READ-MODEL': {
          ...(clone(valid['LIVE-01-READ-MODEL']) as object),
          projection: {
            ...(clone(valid['LIVE-01-READ-MODEL']) as { projection: object }).projection,
            participantCount: 1,
          },
        },
      },
    ],
    [
      'timeout recovery omits cancellation',
      {
        ...valid,
        'LIVE-02-RECOVERY': {
          ...(clone(valid['LIVE-02-RECOVERY']) as object),
          cases: (
            clone(valid['LIVE-02-RECOVERY']) as { cases: Array<Record<string, unknown>> }
          ).cases.map((entry) =>
            entry.id === 'timeout'
              ? {
                  ...entry,
                  selectorReceipts: {
                    ...(entry.selectorReceipts as object),
                    cancel: [],
                  },
                }
              : entry,
          ),
        },
      },
    ],
    [
      'forbidden confidential-shaped field',
      {
        ...valid,
        'SDK-02': {
          ...(clone(valid['SDK-02']) as object),
          handle: 'forbidden',
        },
      },
    ],
  ];
  for (const [name, value] of cases) {
    assert.throws(() => verifyG6Evidence(value), /G6 evidence verification failed/, name);
  }
});
