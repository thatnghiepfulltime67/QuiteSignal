import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { parseActiveRelease } from '../src/release.js';

test('T-WEB-08-DEPLOYMENT-01: the historical canonical release is selected explicitly', () => {
  assert.deepEqual(
    parseActiveRelease({
      schemaVersion: 1,
      releaseId: 'DEP-01',
      manifestPath: '/quiet-signal.json',
    }),
    { releaseId: 'DEP-01', manifestPath: '/quiet-signal.json' },
  );
});

test('T-WEB-08-DEPLOYMENT-02: release pointers reject address paths and mismatched revisions', () => {
  assert.throws(() =>
    parseActiveRelease({
      schemaVersion: 1,
      releaseId: 'DEP-02',
      manifestPath: '/quiet-signal.json',
    }),
  );
  assert.throws(() =>
    parseActiveRelease({
      schemaVersion: 1,
      releaseId: 'DEP-02',
      manifestPath: '/pool/0x0000000000000000000000000000000000000001',
    }),
  );
});

test('T-WEB-08-DEPLOYMENT-03: the shipped pointer selects the verified DEP-02 manifest', () => {
  const pointer = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../../deployments/sepolia/active-release.json'), 'utf8'),
  );
  assert.deepEqual(parseActiveRelease(pointer), {
    releaseId: 'DEP-02',
    manifestPath: '/releases/DEP-02.json',
  });
});
