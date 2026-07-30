import assert from 'node:assert/strict';
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
