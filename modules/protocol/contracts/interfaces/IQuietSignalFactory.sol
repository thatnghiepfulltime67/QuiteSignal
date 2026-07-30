// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {QuietSignalTypes} from './QuietSignalTypes.sol';

/// @notice Permissionless factory for one immutable pool per deployment salt.
interface IQuietSignalFactory {
  event PoolCreated(
    bytes32 indexed poolId,
    address indexed pool,
    bytes32 indexed configHash,
    address confidentialCollateral,
    address resolutionAdapter,
    uint64 deadline,
    uint32 kMin
  );

  function createPool(
    QuietSignalTypes.PoolConfig calldata config,
    bytes32 deploymentSalt
  ) external returns (address pool);

  function poolIdFor(
    QuietSignalTypes.PoolConfig calldata config,
    bytes32 deploymentSalt
  ) external view returns (bytes32 poolId);

  function poolOf(bytes32 poolId) external view returns (address pool);
}
