import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { G5_COMPONENTS, verifyG5Evidence, type G5ComponentId } from './g5.js';

const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function fail(message: string): never {
  throw new Error(message);
}

async function main(): Promise<void> {
  const evidenceDirectory = resolve(ROOT, argument('evidence-dir') ?? 'evidence/sepolia/G5');
  if (!existsSync(evidenceDirectory))
    fail(`Evidence directory does not exist: ${evidenceDirectory}`);
  const components = Object.fromEntries(
    G5_COMPONENTS.map(({ id, file }) => {
      const path = resolve(evidenceDirectory, file);
      if (!existsSync(path)) fail(`Missing required G5 component evidence: ${file}`);
      return [id, JSON.parse(readFileSync(path, 'utf8'))];
    }),
  );
  const report = verifyG5Evidence(components as Record<G5ComponentId, unknown>);
  const output = `${JSON.stringify(report, null, 2)}\n`;
  const outputPath = argument('out');
  if (outputPath) writeFileSync(resolve(ROOT, outputPath), output);
  process.stdout.write(output);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `G5 evidence verifier failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`,
  );
  process.exitCode = 1;
});
