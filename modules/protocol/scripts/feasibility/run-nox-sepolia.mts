const workItem = process.argv.find(
  (argument) =>
    argument === 'FND-02' ||
    argument === 'FND-03' ||
    argument === 'FND-04' ||
    argument === 'FND-05',
);

if (workItem === 'FND-02') {
  await import('./run-arithmetic-sepolia.mjs');
} else if (workItem === 'FND-03') {
  await import('./run-acl-sepolia.mjs');
} else if (workItem === 'FND-04') {
  await import('./run-asset-lifecycle-sepolia.mjs');
} else if (workItem === 'FND-05') {
  await import('./run-aggregate-recovery-sepolia.mjs');
} else {
  console.error('A supported Sepolia Nox feasibility work-item identifier is required.');
  process.exitCode = 1;
}
