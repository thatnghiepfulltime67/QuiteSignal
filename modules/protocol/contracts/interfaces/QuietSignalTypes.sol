// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {euint256} from '@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol';

/// @notice Shared ABI types for one immutable QuietSignal pool and epoch.
library QuietSignalTypes {
  enum EpochState {
    OPEN,
    COMMIT_PENDING,
    AGGREGATE_PENDING,
    RESOLUTION_PENDING,
    SETTLED,
    REFUNDABLE
  }

  enum Outcome {
    UNRESOLVED,
    YES,
    NO
  }

  struct PoolConfig {
    address confidentialCollateral;
    address resolutionAdapter;
    uint64 deadline;
    uint64 commitTimeout;
    uint32 kMin;
    uint64 aggregateTimeout;
    uint64 resolutionGrace;
  }

  struct PublicEpoch {
    EpochState state;
    Outcome winner;
    uint64 deadline;
    uint32 participantCount;
    bytes32 aggregateRequestId;
    uint64 aggregatePendingAt;
    uint64 resolutionPendingAt;
    uint256 publicYes;
    uint256 publicNo;
    uint80 settledRoundId;
    int256 settledAnswer;
  }

  struct OwnerPosition {
    bool committed;
    bool claimed;
    bool refunded;
    euint256 stake;
    euint256 probabilityBps;
    euint256 yesAllocation;
    euint256 noAllocation;
    euint256 scoreBps;
  }
}
