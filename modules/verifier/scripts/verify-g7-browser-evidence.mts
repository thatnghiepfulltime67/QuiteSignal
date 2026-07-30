import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPublicClient, http, type Hash } from 'viem';
import { sepolia } from 'viem/chains';

import {
  parseG7BrowserEvidence,
  parseManifest,
  verifyG7BrowserEvidence,
  verifyReleaseManifest,
} from '../src/index.js';

const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));

function fail(message: string): never {
  throw new Error(`G7 browser evidence verifier failed: ${message}`);
}

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function sourceCommitIsReachable(sourceCommit: string): void {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sourceCommit, 'HEAD'], {
      cwd: ROOT,
      stdio: 'ignore',
    });
  } catch {
    fail('browser evidence source commit is not reachable from current history.');
  }
}

function requireCleanWorktree(): void {
  if (execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim())
    fail('create-only verifier output requires a clean source worktree.');
}

function loadRelease(releaseId: string) {
  const path = resolve(ROOT, 'deployments/sepolia/releases', `${releaseId}.json`);
  if (!existsSync(path)) fail(`release manifest is missing: ${releaseId}.`);
  return parseManifest(JSON.parse(readFileSync(path, 'utf8')));
}

async function main(): Promise<void> {
  const evidenceArgument = argument('evidence');
  if (!evidenceArgument) fail('pass --evidence=<public G7 evidence JSON path>.');
  const evidencePath = resolve(ROOT, evidenceArgument);
  if (!existsSync(evidencePath)) fail('the requested G7 evidence file does not exist.');
  const evidence = parseG7BrowserEvidence(JSON.parse(readFileSync(evidencePath, 'utf8')));
  sourceCommitIsReachable(evidence.sourceCommit);
  const environmentPath = resolve(ROOT, '.env');
  if (existsSync(environmentPath)) process.loadEnvFile(environmentPath);
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) fail('SEPOLIA_RPC_URL is required for read-only receipt verification.');
  const client = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl, { retryCount: 0, timeout: 30_000 }),
  });
  if ((await client.getChainId()) !== evidence.chainId)
    fail('the configured RPC is not Ethereum Sepolia.');
  const primaryManifest = loadRelease(evidence.primary.releaseId);
  const recoveryManifest = loadRelease(evidence.recovery.releaseId);
  const hashes = [
    evidence.primary.signalIntentTransactionHash,
    evidence.primary.collateralCallbackTransactionHash,
    evidence.primary.finalizationTransactionHash,
    evidence.recovery.transactionHash,
  ];
  const [primaryRelease, recoveryRelease, transactions, verificationBlock] = await Promise.all([
    verifyReleaseManifest(client as never, primaryManifest),
    verifyReleaseManifest(client as never, recoveryManifest),
    Promise.all(
      hashes.map(async (hash) => {
        const [transaction, receipt] = await Promise.all([
          client.getTransaction({ hash }),
          client.getTransactionReceipt({ hash }),
        ]);
        return {
          hash,
          status: receipt.status,
          to: transaction.to,
          input: transaction.input,
          blockNumber: receipt.blockNumber.toString(),
        };
      }),
    ),
    client.getBlockNumber(),
  ]);
  const report = verifyG7BrowserEvidence(
    evidence,
    {
      primary: primaryManifest,
      recovery: recoveryManifest,
    },
    transactions,
  );
  const output = {
    ...report,
    verificationBlock: verificationBlock.toString(),
    primaryManifestVerification: primaryRelease,
    recoveryManifestVerification: recoveryRelease,
    receipts: transactions.map(({ hash, status, to, blockNumber }) => ({
      hash,
      status,
      to,
      blockNumber,
    })),
  };
  const outputArgument = argument('out');
  if (outputArgument) {
    requireCleanWorktree();
    const outputPath = resolve(ROOT, outputArgument);
    if (existsSync(outputPath)) fail(`refusing to overwrite existing output: ${outputArgument}.`);
    writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
  }
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'G7 browser evidence verification failed.'}\n`,
  );
  process.exitCode = 1;
});
