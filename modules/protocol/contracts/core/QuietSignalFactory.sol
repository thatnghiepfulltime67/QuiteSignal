// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IERC165} from '@openzeppelin/contracts/interfaces/IERC165.sol';
import {IERC7984} from '@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC7984.sol';

import {IQuietSignalErrors} from '../interfaces/IQuietSignalErrors.sol';
import {IQuietSignalFactory} from '../interfaces/IQuietSignalFactory.sol';
import {IResolutionAdapter} from '../interfaces/IResolutionAdapter.sol';
import {QuietSignalTypes} from '../interfaces/QuietSignalTypes.sol';
import {QuietSignalPool} from './QuietSignalPool.sol';

/// @notice Permissionless CREATE2 factory for one immutable pool configuration.
/// @dev The factory is non-custodial and has no owner, upgrade, or lifecycle authority.
contract QuietSignalFactory is IQuietSignalFactory {
  mapping(bytes32 poolId => address pool) private _poolById;
  mapping(bytes32 configHash => bytes32 poolId) private _poolIdByConfigHash;
  mapping(bytes32 deploymentSalt => bytes32 poolId) private _poolIdByDeploymentSalt;

  function createPool(
    QuietSignalTypes.PoolConfig calldata config_,
    bytes32 deploymentSalt
  ) external override returns (address pool) {
    _validateConfig(config_);
    bytes32 configHash = _configHash(config_);
    bytes32 poolId_ = poolIdFor(config_, deploymentSalt);
    if (
      _poolById[poolId_] != address(0) ||
      _poolIdByConfigHash[configHash] != bytes32(0) ||
      _poolIdByDeploymentSalt[deploymentSalt] != bytes32(0)
    ) {
      revert IQuietSignalErrors.PoolAlreadyExists(poolId_);
    }

    pool = address(new QuietSignalPool{salt: poolId_}(poolId_, config_));
    _poolById[poolId_] = pool;
    _poolIdByConfigHash[configHash] = poolId_;
    _poolIdByDeploymentSalt[deploymentSalt] = poolId_;
    emit PoolCreated(
      poolId_,
      pool,
      configHash,
      config_.confidentialCollateral,
      config_.resolutionAdapter,
      config_.deadline,
      config_.kMin
    );
  }

  function poolIdFor(
    QuietSignalTypes.PoolConfig calldata config_,
    bytes32 deploymentSalt
  ) public view override returns (bytes32) {
    return
      keccak256(abi.encode(block.chainid, address(this), _configHash(config_), deploymentSalt));
  }

  function poolOf(bytes32 poolId_) external view override returns (address) {
    return _poolById[poolId_];
  }

  function _configHash(
    QuietSignalTypes.PoolConfig calldata config_
  ) private pure returns (bytes32) {
    return keccak256(abi.encode(config_));
  }

  function _validateConfig(QuietSignalTypes.PoolConfig calldata config_) private view {
    if (
      config_.confidentialCollateral == address(0) ||
      config_.resolutionAdapter == address(0) ||
      config_.deadline <= block.timestamp ||
      config_.commitTimeout == 0 ||
      config_.kMin == 0 ||
      config_.aggregateTimeout == 0 ||
      config_.resolutionGrace == 0
    ) {
      revert IQuietSignalErrors.InvalidConfiguration();
    }
    if (
      config_.confidentialCollateral.code.length == 0 ||
      !_supportsERC7984(config_.confidentialCollateral)
    ) {
      revert IQuietSignalErrors.InvalidConfiguration();
    }
    if (config_.resolutionAdapter.code.length == 0) {
      revert IQuietSignalErrors.InvalidResolutionAdapter(config_.resolutionAdapter);
    }

    address target;
    bytes32 expectedRuntimeHash;
    uint256 observationNotBefore;
    uint256 maximumFeedAge;
    int256 threshold;
    try IResolutionAdapter(config_.resolutionAdapter).target() returns (address target_) {
      target = target_;
    } catch {
      revert IQuietSignalErrors.InvalidResolutionAdapter(config_.resolutionAdapter);
    }
    try IResolutionAdapter(config_.resolutionAdapter).targetRuntimeCodeHash() returns (
      bytes32 runtimeHash
    ) {
      expectedRuntimeHash = runtimeHash;
    } catch {
      revert IQuietSignalErrors.InvalidResolutionAdapter(config_.resolutionAdapter);
    }
    try IResolutionAdapter(config_.resolutionAdapter).observationNotBefore() returns (
      uint256 observation_
    ) {
      observationNotBefore = observation_;
    } catch {
      revert IQuietSignalErrors.InvalidResolutionAdapter(config_.resolutionAdapter);
    }
    try IResolutionAdapter(config_.resolutionAdapter).maximumFeedAge() returns (
      uint256 maximumAge_
    ) {
      maximumFeedAge = maximumAge_;
    } catch {
      revert IQuietSignalErrors.InvalidResolutionAdapter(config_.resolutionAdapter);
    }
    try IResolutionAdapter(config_.resolutionAdapter).threshold() returns (int256 threshold_) {
      threshold = threshold_;
    } catch {
      revert IQuietSignalErrors.InvalidResolutionAdapter(config_.resolutionAdapter);
    }

    if (
      target == address(0) ||
      target.code.length == 0 ||
      target.codehash != expectedRuntimeHash ||
      observationNotBefore < config_.deadline ||
      maximumFeedAge == 0 ||
      threshold <= 0
    ) {
      revert IQuietSignalErrors.InvalidResolutionAdapter(config_.resolutionAdapter);
    }
  }

  function _supportsERC7984(address collateral) private view returns (bool) {
    try IERC165(collateral).supportsInterface(type(IERC7984).interfaceId) returns (bool supported) {
      return supported;
    } catch {
      return false;
    }
  }
}
