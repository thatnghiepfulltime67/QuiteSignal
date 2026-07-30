import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

interface PackageManifest {
  scripts?: Record<string, string>;
}

const testDirectory = dirname(fileURLToPath(import.meta.url));
const protocolManifestPath = resolve(testDirectory, '../../package.json');
const rootManifestPath = resolve(testDirectory, '../../../../package.json');

function loadManifest(path: string): PackageManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageManifest;
}

test('T-DEP-02-01: deployment commands require an explicit caller-supplied revision', () => {
  const protocolScripts = loadManifest(protocolManifestPath).scripts;
  const rootScripts = loadManifest(rootManifestPath).scripts;

  assert.equal(protocolScripts?.['deploy:sepolia:plan'], 'tsx scripts/deploy/plan-sepolia.mts');
  assert.equal(protocolScripts?.['deploy:sepolia:write'], 'tsx scripts/deploy/write-sepolia.mts');
  assert.equal(
    rootScripts?.['deploy:sepolia:plan'],
    'npm run --workspace @quitesignal/protocol deploy:sepolia:plan --',
  );
  assert.equal(
    rootScripts?.['deploy:sepolia:write'],
    'npm run --workspace @quitesignal/protocol deploy:sepolia:write --',
  );

  for (const [name, command] of Object.entries(protocolScripts ?? {})) {
    if (!name.startsWith('deploy:sepolia:')) continue;
    assert.doesNotMatch(command, /DEP-\d+/);
  }
});
