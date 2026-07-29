const workItem = process.argv.find((argument) => argument === 'FND-02' || argument === 'FND-03');

if (workItem === 'FND-02') {
  await import('./run-arithmetic-sepolia.mjs');
} else if (workItem === 'FND-03') {
  await import('./run-acl-sepolia.mjs');
} else {
  console.error('A supported Sepolia Nox feasibility work-item identifier is required.');
  process.exitCode = 1;
}
