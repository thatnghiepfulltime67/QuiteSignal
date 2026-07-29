import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

interface DetectionRule {
  id: string;
  expression: RegExp;
}

const RULES: DetectionRule[] = [
  { id: 'private-key-pem', expression: /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/ },
  { id: 'github-token', expression: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { id: 'aws-access-key', expression: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    id: 'private-key-assignment',
    expression: /(?:SEPOLIA_)?PRIVATE_KEY\s*[:=]\s*['"]?0x[a-fA-F0-9]{64}\b/,
  },
  {
    id: 'mnemonic-assignment',
    expression: /(?:ACTOR_)?MNEMONIC\s*[:=]\s*['"]?[a-z]+(?:\s+[a-z]+){11,}/i,
  },
];

function trackedFiles(): string[] {
  const output = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  return output.split('\0').filter(Boolean);
}

function historyPatch(): string {
  return execFileSync('git', ['log', '--all', '--format=', '--patch', '--no-ext-diff'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

function detect(value: string): string | undefined {
  return RULES.find((rule) => rule.expression.test(value))?.id;
}

function main(): void {
  for (const file of trackedFiles()) {
    const content = readFileSync(resolve(file));
    if (content.includes(0)) {
      continue;
    }

    const detection = detect(content.toString('utf8'));
    if (detection) {
      throw new Error(detection);
    }
  }

  const historyDetection = detect(historyPatch());
  if (historyDetection) {
    throw new Error(historyDetection);
  }

  console.log(JSON.stringify({ status: 'clear', scope: 'tracked-files-and-history' }));
}

try {
  main();
} catch {
  console.error('secret scan failed: redact and rotate the detected credential before continuing.');
  process.exitCode = 1;
}
