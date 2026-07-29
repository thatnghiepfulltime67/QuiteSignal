import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

interface PackageMetadata {
  license?: string;
  name?: string;
  version?: string;
}

function packageDirectories(): string[] {
  const output = execFileSync('npm', ['ls', '--all', '--parseable'], { encoding: 'utf8' });
  return output
    .trim()
    .split('\n')
    .filter((directory, index) => index > 0 && directory.includes('node_modules'));
}

function main(): void {
  const packages = packageDirectories();
  const missingLicense: string[] = [];

  for (const directory of packages) {
    const metadata = JSON.parse(
      readFileSync(`${directory}/package.json`, 'utf8'),
    ) as PackageMetadata;
    if (typeof metadata.license !== 'string' || metadata.license.trim().length === 0) {
      missingLicense.push(`${metadata.name ?? 'unknown'}@${metadata.version ?? 'unknown'}`);
    }
  }

  if (missingLicense.length > 0) {
    throw new Error('One or more installed packages lack license metadata.');
  }

  console.log(JSON.stringify({ packages: packages.length, status: 'licenses-present' }));
}

try {
  main();
} catch {
  console.error('dependency scan failed: review dependency advisory or license metadata.');
  process.exitCode = 1;
}
