// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {ebool, euint256, externalEuint256} from 'encrypted-types/EncryptedTypes.sol';
import {Nox} from '@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol';

/// @notice Isolated P0 ACL feasibility harness. It has no asset custody or production imports.
contract AclSpike {
  using Nox for ebool;
  using Nox for euint256;

  error AlreadyMaterialized();
  error MissingDerivedHandle();
  error UninitializedExternalHandle();
  error ZeroOwner();

  address public owner;
  euint256 private derivedValue;
  ebool private persistenceMatches;
  bool private materialized;
  bool private persistenceProven;

  function materialize(
    externalEuint256 encryptedOwnerValue,
    bytes calldata ownerValueProof,
    address ownerAddress
  ) external {
    if (materialized) revert AlreadyMaterialized();
    if (ownerAddress == address(0)) revert ZeroOwner();
    if (externalEuint256.unwrap(encryptedOwnerValue) == bytes32(0)) {
      revert UninitializedExternalHandle();
    }

    euint256 importedValue = Nox.fromExternal(encryptedOwnerValue, ownerValueProof);
    derivedValue = Nox.add(importedValue, Nox.toEuint256(1));
    Nox.allowThis(derivedValue);
    Nox.addViewer(derivedValue, ownerAddress);

    owner = ownerAddress;
    materialized = true;
  }

  function provePersistence() external {
    if (!materialized) revert MissingDerivedHandle();

    euint256 recomputedValue = Nox.add(derivedValue, Nox.toEuint256(0));
    persistenceMatches = Nox.eq(recomputedValue, derivedValue);
    Nox.allowPublicDecryption(persistenceMatches);
    persistenceProven = true;
  }

  function derivedHandle() external view returns (bytes32) {
    if (!materialized) revert MissingDerivedHandle();
    return euint256.unwrap(derivedValue);
  }

  function persistenceHandle() external view returns (bytes32) {
    if (!persistenceProven) revert MissingDerivedHandle();
    return ebool.unwrap(persistenceMatches);
  }

  function authorityOf(
    address actor
  ) external view returns (bool canCompute, bool canView, bool publiclyDecryptable) {
    if (!materialized) revert MissingDerivedHandle();
    return (
      Nox.isAllowed(derivedValue, actor),
      Nox.isViewer(derivedValue, actor),
      Nox.isPubliclyDecryptable(derivedValue)
    );
  }
}
