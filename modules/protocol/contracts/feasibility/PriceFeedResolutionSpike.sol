// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

interface IAggregatorV3Like {
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

/// @notice Isolated G4 harness for immutable, zero-custody public-feed resolution.
/// @dev This feasibility contract has no payable entry point, owner, token, or Nox handle.
contract PriceFeedResolutionSpike {
  error FeedHasNoCode();
  error FutureFeedTimestamp(uint256 updatedAt, uint256 currentTimestamp);
  error IncompleteRound(
    uint80 roundId,
    uint80 answeredInRound,
    uint256 startedAt,
    uint256 updatedAt
  );
  error InvalidMaximumFeedAge();
  error InvalidObservationTime();
  error NonPositiveAnswer(int256 answer);
  error ObservationNotReached(uint256 observationNotBefore, uint256 currentTimestamp);
  error StaleRound(uint256 updatedAt, uint256 maximumAge, uint256 currentTimestamp);

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
    if (target_.code.length == 0) revert FeedHasNoCode();
    if (observationNotBefore_ == 0) revert InvalidObservationTime();
    if (maximumFeedAge_ == 0) revert InvalidMaximumFeedAge();

    target = target_;
    targetRuntimeCodeHash = target_.codehash;
    greaterOrEqual = greaterOrEqual_;
    threshold = threshold_;
    observationNotBefore = observationNotBefore_;
    maximumFeedAge = maximumFeedAge_;
  }

  function resolution()
    external
    view
    returns (bool yes, int256 answer, uint80 roundId, uint256 updatedAt)
  {
    if (block.timestamp < observationNotBefore) {
      revert ObservationNotReached(observationNotBefore, block.timestamp);
    }

    uint256 startedAt;
    uint80 answeredInRound;
    (roundId, answer, startedAt, updatedAt, answeredInRound) = IAggregatorV3Like(target)
      .latestRoundData();
    if (roundId == 0 || startedAt == 0 || updatedAt == 0 || answeredInRound < roundId) {
      revert IncompleteRound(roundId, answeredInRound, startedAt, updatedAt);
    }
    if (updatedAt > block.timestamp) revert FutureFeedTimestamp(updatedAt, block.timestamp);
    if (answer <= 0) revert NonPositiveAnswer(answer);
    if (block.timestamp - updatedAt > maximumFeedAge) {
      revert StaleRound(updatedAt, maximumFeedAge, block.timestamp);
    }

    yes = greaterOrEqual ? answer >= threshold : answer <= threshold;
  }
}
