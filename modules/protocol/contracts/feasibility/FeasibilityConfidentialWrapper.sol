// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IERC20} from '@openzeppelin/contracts/interfaces/IERC20.sol';
import {ERC20ToERC7984Wrapper} from '@iexec-nox/nox-confidential-contracts/contracts/token/extensions/ERC20ToERC7984Wrapper.sol';

/// @notice Unchanged Nox wrapper inheritance used only by the isolated FND-04 Sepolia harness.
contract FeasibilityConfidentialWrapper is ERC20ToERC7984Wrapper {
  constructor(
    IERC20 underlying
  )
    ERC20ToERC7984Wrapper(
      'QuietSignal Feasibility Confidential Collateral',
      'QSFCC',
      'ipfs://quitesignal-feasibility-collateral',
      underlying
    )
  {}
}
