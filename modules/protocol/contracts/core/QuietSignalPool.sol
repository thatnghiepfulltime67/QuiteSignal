// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IQuietSignalErrors} from '../interfaces/IQuietSignalErrors.sol';
import {QuietSignalTypes} from '../interfaces/QuietSignalTypes.sol';

/// @notice Immutable configuration container for one future confidential epoch.
/// @dev PK-03B intentionally exposes no custody callback or lifecycle mutation.
contract QuietSignalPool {
  bytes32 public immutable poolId;
  bytes32 public immutable epochId;
  address public immutable confidentialCollateral;
  address public immutable resolutionAdapter;
  uint64 public immutable deadline;
  uint32 public immutable kMin;
  uint64 public immutable aggregateTimeout;
  uint64 public immutable resolutionGrace;

  QuietSignalTypes.PublicEpoch private _epoch;

  event EpochOpened(bytes32 indexed epochId, address indexed pool, uint64 deadline, uint32 kMin);

  constructor(bytes32 poolId_, QuietSignalTypes.PoolConfig memory config_) {
    if (
      poolId_ == bytes32(0) ||
      config_.confidentialCollateral == address(0) ||
      config_.resolutionAdapter == address(0) ||
      config_.deadline <= block.timestamp ||
      config_.kMin == 0 ||
      config_.aggregateTimeout == 0 ||
      config_.resolutionGrace == 0
    ) {
      revert IQuietSignalErrors.InvalidConfiguration();
    }

    poolId = poolId_;
    epochId = keccak256(abi.encode(block.chainid, address(this), poolId_));
    confidentialCollateral = config_.confidentialCollateral;
    resolutionAdapter = config_.resolutionAdapter;
    deadline = config_.deadline;
    kMin = config_.kMin;
    aggregateTimeout = config_.aggregateTimeout;
    resolutionGrace = config_.resolutionGrace;
    _epoch = QuietSignalTypes.PublicEpoch({
      state: QuietSignalTypes.EpochState.OPEN,
      winner: QuietSignalTypes.Outcome.UNRESOLVED,
      deadline: config_.deadline,
      participantCount: 0,
      aggregateRequestId: bytes32(0),
      aggregatePendingAt: 0,
      resolutionPendingAt: 0,
      publicYes: 0,
      publicNo: 0,
      settledRoundId: 0,
      settledAnswer: 0
    });

    emit EpochOpened(epochId, address(this), config_.deadline, config_.kMin);
  }

  function config() external view returns (QuietSignalTypes.PoolConfig memory) {
    return
      QuietSignalTypes.PoolConfig({
        confidentialCollateral: confidentialCollateral,
        resolutionAdapter: resolutionAdapter,
        deadline: deadline,
        kMin: kMin,
        aggregateTimeout: aggregateTimeout,
        resolutionGrace: resolutionGrace
      });
  }

  function epoch() external view returns (QuietSignalTypes.PublicEpoch memory) {
    return _epoch;
  }
}
