// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IERC7984Receiver} from '@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC7984Receiver.sol';
import {externalEuint256} from '@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol';

import {QuietSignalTypes} from './QuietSignalTypes.sol';

/// @notice Public ABI for one immutable confidential epoch.
interface IQuietSignalPool is IERC7984Receiver {
  event EpochOpened(bytes32 indexed epochId, address indexed pool, uint64 deadline, uint32 kMin);
  event SignalCommitted(bytes32 indexed epochId, address indexed owner, bytes32 commitmentId);
  event EpochClosed(bytes32 indexed epochId, uint32 participantCount);
  event AggregateDecryptRequested(bytes32 indexed epochId, bytes32 indexed requestId);
  event AggregateFinalized(
    bytes32 indexed epochId,
    bytes32 indexed requestId,
    uint256 publicYes,
    uint256 publicNo
  );
  event SettlementFinalized(
    bytes32 indexed epochId,
    uint8 winner,
    uint256 aggregateCollateral,
    uint256 winningAggregate,
    uint80 roundId,
    int256 answer
  );
  event ScoreMaterialized(bytes32 indexed epochId, address indexed owner);
  event PayoutClaimed(bytes32 indexed epochId, address indexed owner, bytes32 claimId);
  event Refunded(bytes32 indexed epochId, address indexed owner, bytes32 refundId);

  function poolId() external view returns (bytes32);

  function epochId() external view returns (bytes32);

  function config() external view returns (QuietSignalTypes.PoolConfig memory);

  function epoch() external view returns (QuietSignalTypes.PublicEpoch memory);

  /// @notice Returns encrypted handles only to the calling owner.
  function ownerPosition() external view returns (QuietSignalTypes.OwnerPosition memory);

  /// @notice Accepts encrypted Nox input handles and their owner-bound proofs only.
  function commitSignal(
    externalEuint256 encryptedStake,
    bytes calldata stakeProof,
    externalEuint256 encryptedProbabilityBps,
    bytes calldata probabilityProof
  ) external;

  function closeEpoch() external;

  function requestAggregateDecrypt() external returns (bytes32 requestId);

  /// @notice Accepts a context-bound aggregate proof and never a caller-supplied total.
  function finalizeAggregate(bytes32 requestId, bytes calldata aggregateProof) external;

  /// @notice Reads the immutable adapter; no result parameter is accepted.
  function settle() external;

  function cancelBeforeResolution() external;

  function cancelAfterResolutionGrace() external;

  function materializeScore() external;

  function claim() external;

  function refund() external;
}
