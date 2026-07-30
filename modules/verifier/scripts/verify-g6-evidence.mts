import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { G6_COMPONENTS, verifyG6Evidence, type G6ComponentId } from '../src/g6.js';

const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function fail(message: string): never {
  throw new Error(message);
}

function assertSourceCommitReachable(sourceCommit: string): void {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sourceCommit, 'HEAD'], {
      cwd: ROOT,
      stdio: 'ignore',
    });
  } catch {
    fail(`Evidence source commit is not reachable from current history: ${sourceCommit}`);
  }
}

function assertCleanWorktree(): void {
  const status = execFileSync('git', ['status', '--porcelain'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (status.length > 0) fail('G6 evidence output requires a clean source worktree.');
}

function loadComponent(path: string, id: G6ComponentId): unknown {
  if (!existsSync(path)) fail(`Missing required G6 component evidence: ${id}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function main(): Promise<void> {
  const evidenceDirectory = resolve(ROOT, argument('evidence-dir') ?? 'evidence/sepolia/G6');
  if (!existsSync(evidenceDirectory))
    fail(`Evidence directory does not exist: ${evidenceDirectory}`);
  const components = Object.fromEntries(
    G6_COMPONENTS.map(({ id, file }) => [id, loadComponent(resolve(evidenceDirectory, file), id)]),
  ) as Record<G6ComponentId, unknown>;
  const report = verifyG6Evidence(components);
  report.sourceCommits.forEach(assertSourceCommitReachable);

  const output = `${JSON.stringify(report, null, 2)}\n`;
  const outputPath = argument('out');
  if (outputPath) {
    assertCleanWorktree();
    const path = resolve(ROOT, outputPath);
    if (existsSync(path)) fail(`Refusing to overwrite existing G6 evidence: ${outputPath}`);
    writeFileSync(path, output, { encoding: 'utf8', flag: 'wx' });
  }
  process.stdout.write(output);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `G6 evidence verifier failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`,
  );
  process.exitCode = 1;
});
