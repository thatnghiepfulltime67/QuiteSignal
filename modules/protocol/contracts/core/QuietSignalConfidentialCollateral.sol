// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IERC20} from '@openzeppelin/contracts/interfaces/IERC20.sol';
import {ERC20ToERC7984Wrapper} from '@iexec-nox/nox-confidential-contracts/contracts/token/extensions/ERC20ToERC7984Wrapper.sol';

/// @notice Product collateral wrapper backed by the pinned ERC-20 to ERC-7984 implementation.
/// @dev It adds no authority or balance behavior beyond the audited base wrapper.
contract QuietSignalConfidentialCollateral is ERC20ToERC7984Wrapper {
  constructor(
    IERC20 underlying
  )
    ERC20ToERC7984Wrapper(
      'QuietSignal Confidential Collateral',
      'QSCC',
      'ipfs://quitesignal/confidential-collateral',
      underlying
    )
  {}
}
