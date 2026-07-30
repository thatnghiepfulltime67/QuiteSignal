export interface PublicManifest {
  chainId: 11155111;
  poolAddress: string;
  collateralAddress: string;
  deployedAtBlock: string;
}

export function parsePublicManifest(value: unknown): PublicManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Manifest is invalid.');
  const source = value as Record<string, unknown>;
  const deployment = source.deployment as Record<string, unknown> | undefined;
  const pools = source.pools as Array<Record<string, unknown>> | undefined;
  const pool = pools?.[0];
  if (
    source.schemaVersion !== 1 ||
    source.chainId !== 11_155_111 ||
    !deployment ||
    typeof deployment.deployedAtBlock !== 'string' ||
    !pool ||
    typeof pool.address !== 'string' ||
    !/^0x[0-9a-f]{40}$/i.test(pool.address) ||
    typeof pool.confidentialCollateral !== 'string' ||
    !/^0x[0-9a-f]{40}$/i.test(pool.confidentialCollateral)
  ) {
    throw new Error('Manifest is not a canonical Sepolia deployment.');
  }
  return {
    chainId: 11_155_111,
    poolAddress: pool.address,
    collateralAddress: pool.confidentialCollateral,
    deployedAtBlock: deployment.deployedAtBlock,
  };
}
