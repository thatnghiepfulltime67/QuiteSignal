// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IQuietSignalErrors} from '../interfaces/IQuietSignalErrors.sol';
import {IResolutionAdapter} from '../interfaces/IResolutionAdapter.sol';

interface IChainlinkAggregatorV3 {
  function latestRoundData()
    external
    view
    returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    );
}

/// @notice Immutable, read-only binary resolution of one unchanged Chainlink feed.
/// @dev This adapter owns no assets, accepts no caller-selected result, and has no Nox dependency.
contract ChainlinkPriceFeedResolutionAdapter is IResolutionAdapter {
  uint8 internal constant YES = 1;
  uint8 internal constant NO = 2;

  address public immutable target;
  bytes32 public immutable targetRuntimeCodeHash;
  bool public immutable greaterOrEqual;
  int256 public immutable threshold;
  uint256 public immutable observationNotBefore;
  uint256 public immutable maximumFeedAge;

  constructor(
    address target_,
    bool greaterOrEqual_,
    int256 threshold_,
    uint256 observationNotBefore_,
    uint256 maximumFeedAge_
  ) {
    if (
      target_.code.length == 0 ||
      threshold_ <= 0 ||
      observationNotBefore_ == 0 ||
      observationNotBefore_ > type(uint64).max ||
      maximumFeedAge_ == 0
    ) {
      revert IQuietSignalErrors.InvalidConfiguration();
    }

    target = target_;
    targetRuntimeCodeHash = target_.codehash;
    greaterOrEqual = greaterOrEqual_;
    threshold = threshold_;
    observationNotBefore = observationNotBefore_;
    maximumFeedAge = maximumFeedAge_;
  }

  /// @inheritdoc IResolutionAdapter
  function resolution()
    external
    view
    returns (uint8 winner, uint80 roundId, int256 answer, uint256 updatedAt)
  {
    if (block.timestamp < observationNotBefore) {
      revert IQuietSignalErrors.ResolutionNotReady(
        _asUint64(observationNotBefore),
        _asUint64(block.timestamp)
      );
    }
    if (target.codehash != targetRuntimeCodeHash) revert IQuietSignalErrors.InvalidFeedRound();

    uint256 startedAt;
    uint80 answeredInRound;
    (roundId, answer, startedAt, updatedAt, answeredInRound) = IChainlinkAggregatorV3(target)
      .latestRoundData();
    if (
      roundId == 0 ||
      answer <= 0 ||
      startedAt == 0 ||
      updatedAt == 0 ||
      answeredInRound < roundId ||
      updatedAt > block.timestamp ||
      block.timestamp - updatedAt > maximumFeedAge
    ) {
      revert IQuietSignalErrors.InvalidFeedRound();
    }

    bool yes = greaterOrEqual ? answer >= threshold : answer <= threshold;
    winner = yes ? YES : NO;
  }

  function _asUint64(uint256 value) private pure returns (uint64) {
    return uint64(value);
  }
}
