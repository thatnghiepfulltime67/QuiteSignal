// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

/// @notice Read-only, zero-custody normalization of one immutable public feed condition.
interface IResolutionAdapter {
  /// @notice Unchanged public-feed proxy read by this adapter.
  function target() external view returns (address);

  /// @notice Runtime hash captured from `target` during adapter construction.
  function targetRuntimeCodeHash() external view returns (bytes32);

  /// @notice True for `answer >= threshold`, false for `answer <= threshold`.
  function greaterOrEqual() external view returns (bool);

  /// @notice Feed-native integer comparison threshold.
  function threshold() external view returns (int256);

  /// @notice Earliest timestamp at which a result may be used.
  function observationNotBefore() external view returns (uint256);

  /// @notice Maximum permitted age of the selected feed update.
  function maximumFeedAge() external view returns (uint256);

  /// @notice Returns `1` for YES or `2` for NO, never a caller-supplied result.
  function resolution()
    external
    view
    returns (uint8 winner, uint80 roundId, int256 answer, uint256 updatedAt);
}
