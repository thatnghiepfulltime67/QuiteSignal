// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {QuietSignalTypes} from './QuietSignalTypes.sol';

/// @notice Stable custom errors for pool, factory, and adapter integrations.
interface IQuietSignalErrors {
  error AggregateRequestMissing();
  error AggregateTimeoutNotReached(uint64 eligibleAt, uint64 currentTime);
  error AlreadyClaimed(address owner);
  error AlreadyCommitted(address owner);
  error AlreadyRefunded(address owner);
  error CallbackOwnerMismatch(address expected, address actual);
  error CommitRejected();
  error CommitWindowClosed(uint64 deadline, uint64 currentTime);
  error ConservationViolation();
  error DuplicateAggregateRequest(bytes32 requestId);
  error InvalidConfiguration();
  error InvalidFeedRound();
  error InvalidInputHandle();
  error InvalidResolutionAdapter(address adapter);
  error InvalidState(QuietSignalTypes.EpochState expected, QuietSignalTypes.EpochState actual);
  error NativeValueNotAccepted();
  error PendingCommitExists(address owner);
  error PendingCommitMissing();
  error PendingCommitTimeoutNotReached(uint64 eligibleAt, uint64 currentTime);
  error PoolAlreadyExists(bytes32 poolId);
  error ProofAlreadyConsumed(bytes32 requestId);
  error ProofContextMismatch(bytes32 requestId);
  error ResolutionGraceNotElapsed(uint64 eligibleAt, uint64 currentTime);
  error ResolutionNotReady(uint64 observationNotBefore, uint64 currentTime);
  error TerminalActionConflict(address owner);
  error UnauthorizedCollateral(address caller);
  error WrongCallbackOperator();
  error ZeroWinningPool(QuietSignalTypes.Outcome winner);
}
