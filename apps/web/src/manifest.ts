export interface PublicManifest {
  chainId: 11155111;
  poolAddress: string;
  collateralAddress: string;
  faucetAddress: string;
  deployedAtBlock: string;
  threshold: string;
  comparison: 'greater-or-equal' | 'less-than';
  observationNotBefore: string;
}

function isAddress(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value);
}

export function parsePublicManifest(value: unknown): PublicManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Manifest is invalid.');
  const source = value as Record<string, unknown>;
  const deployment = source.deployment as Record<string, unknown> | undefined;
  const configuration = deployment?.configuration as Record<string, unknown> | undefined;
  const pools = source.pools as Array<Record<string, unknown>> | undefined;
  const contracts = source.contracts as Array<Record<string, unknown>> | undefined;
  const pool = pools?.[0];
  const fixture = contracts?.find((contract) => contract.id === 'fixture');
  const wrapper = contracts?.find((contract) => contract.id === 'wrapper');
  if (
    source.schemaVersion !== 1 ||
    source.chainId !== 11_155_111 ||
    !deployment ||
    typeof deployment.deployedAtBlock !== 'string' ||
    !configuration ||
    typeof configuration.threshold !== 'string' ||
    (configuration.comparison !== 'greater-or-equal' && configuration.comparison !== 'less-than') ||
    typeof configuration.observationNotBefore !== 'string' ||
    !pool ||
    !isAddress(pool.address) ||
    !isAddress(pool.confidentialCollateral) ||
    !fixture ||
    !isAddress(fixture.address) ||
    !wrapper ||
    !isAddress(wrapper.address) ||
    wrapper.address.toLowerCase() !== pool.confidentialCollateral.toLowerCase()
  ) {
    throw new Error('Manifest is not a canonical Sepolia deployment.');
  }
  return {
    chainId: 11_155_111,
    poolAddress: pool.address,
    collateralAddress: pool.confidentialCollateral,
    faucetAddress: fixture.address,
    deployedAtBlock: deployment.deployedAtBlock,
    threshold: configuration.threshold,
    comparison: configuration.comparison,
    observationNotBefore: configuration.observationNotBefore,
  };
}
