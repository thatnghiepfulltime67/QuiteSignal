const workItem = process.argv.find(
  (argument) =>
    argument === 'FND-02' ||
    argument === 'FND-03' ||
    argument === 'FND-04' ||
    argument === 'FND-05' ||
    argument === 'FND-05-TIMEOUT' ||
    argument === 'FND-05-RECOVERY' ||
    argument === 'FND-05-BELOW-K' ||
    argument === 'FND-05-BELOW-K-RESUME',
);

if (workItem === 'FND-02') {
  await import('./run-arithmetic-sepolia.mjs');
} else if (workItem === 'FND-03') {
  await import('./run-acl-sepolia.mjs');
} else if (workItem === 'FND-04') {
  await import('./run-asset-lifecycle-sepolia.mjs');
} else if (workItem === 'FND-05') {
  await import('./run-aggregate-recovery-sepolia.mjs');
} else if (workItem === 'FND-05-TIMEOUT') {
  await import('./run-fnd05-timeout-sepolia.mjs');
} else if (workItem === 'FND-05-RECOVERY') {
  await import('./run-fnd05-aggregate-recovery-sepolia.mjs');
} else if (workItem === 'FND-05-BELOW-K') {
  await import('./run-fnd05-below-k-sepolia.mjs');
} else if (workItem === 'FND-05-BELOW-K-RESUME') {
  await import('./resume-fnd05-below-k-sepolia.mjs');
} else {
  console.error('A supported Sepolia Nox feasibility work-item identifier is required.');
  process.exitCode = 1;
}
