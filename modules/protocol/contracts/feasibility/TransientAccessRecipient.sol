// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {ebool, euint256} from 'encrypted-types/EncryptedTypes.sol';
import {Nox} from '@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol';

/// @notice Isolated recipient used only to prove Nox transient access lifetime on Sepolia.
contract TransientAccessRecipient {
  using Nox for ebool;
  using Nox for euint256;

  function verifyTransientAccess(bytes32 encryptedHandle) external returns (bytes32) {
    euint256 value = euint256.wrap(encryptedHandle);
    euint256 recomputedValue = Nox.add(value, Nox.toEuint256(0));
    ebool matches = Nox.eq(recomputedValue, value);
    Nox.allowPublicDecryption(matches);
    return ebool.unwrap(matches);
  }
}
