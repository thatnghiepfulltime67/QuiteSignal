export interface ActiveRelease {
  releaseId: string;
  manifestPath: string;
}

export function parseActiveRelease(value: unknown): ActiveRelease {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Active release pointer is invalid.');
  const source = value as Record<string, unknown>;
  if (source.schemaVersion !== 1 || typeof source.releaseId !== 'string')
    throw new Error('Active release pointer is invalid.');
  const releaseId = source.releaseId;
  const expectedPath =
    releaseId === 'DEP-01' ? '/quiet-signal.json' : `/releases/${releaseId}.json`;
  if (!/^DEP-(?:0[1-9]|[1-9][0-9]*)$/.test(releaseId) || source.manifestPath !== expectedPath)
    throw new Error('Active release pointer does not name a canonical manifest.');
  return { releaseId, manifestPath: expectedPath };
}
