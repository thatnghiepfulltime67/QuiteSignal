export type DomainErrorCode =
  | 'ALREADY_CLAIMED'
  | 'ALREADY_COMMITTED'
  | 'ALREADY_REFUNDED'
  | 'AGGREGATE_MISMATCH'
  | 'AGGREGATE_REQUEST_MISMATCH'
  | 'AGGREGATE_REQUEST_MISSING'
  | 'AGGREGATE_TIMEOUT_NOT_REACHED'
  | 'COMMIT_WINDOW_CLOSED'
  | 'DUPLICATE_AGGREGATE_REQUEST'
  | 'EMPTY_OWNER'
  | 'INVALID_CONFIGURATION'
  | 'INVALID_STATE'
  | 'NEGATIVE_PROBABILITY'
  | 'NON_POSITIVE_STAKE'
  | 'RESOLUTION_GRACE_NOT_REACHED'
  | 'RESOLUTION_NOT_READY'
  | 'STALE_OR_INVALID_ROUND'
  | 'TERMINAL_CONFLICT'
  | 'ZERO_WINNING_POOL';

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export function fail(code: DomainErrorCode, message: string): never {
  throw new DomainError(code, message);
}
