// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IERC20} from '@openzeppelin/contracts/interfaces/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {IERC7984Receiver} from '@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC7984Receiver.sol';
import {IERC20ToERC7984Wrapper} from '@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC20ToERC7984Wrapper.sol';
import {Nox, ebool, euint256} from '@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol';

/// @notice Isolated FND-04 receiver and recovery harness. It has no production or real-asset custody.
contract AssetLifecycleSpike is IERC7984Receiver {
  using SafeERC20 for IERC20;
  using Nox for euint256;

  enum LifecycleState {
    Empty,
    Held,
    UnwrapPending,
    Rewrapped,
    Returned
  }

  error EarlyRecovery(uint48 availableAt);
  error MissingTransientAccess();
  error OwnerOnly(address caller);
  error PublicBalanceNotEmpty(uint256 balance);
  error ReleaseDeltaMismatch();
  error UnexpectedLifecycleState(LifecycleState expected, LifecycleState actual);
  error WrongCallbackOperator();
  error WrongRecipient();
  error WrongWrapper(address caller);
  error ZeroAddress();
  error ZeroRecoveryDelay();

  IERC20 public immutable underlying;
  IERC20ToERC7984Wrapper public immutable wrapper;
  uint48 public immutable recoveryDelay;

  address public owner;
  LifecycleState public state;
  uint48 public recoveryAvailableAt;
  uint256 public observedReleasedAmount;
  euint256 private heldAmount;
  euint256 private unwrapRequest;

  constructor(IERC20ToERC7984Wrapper wrapper_, IERC20 underlying_, uint48 recoveryDelay_) {
    if (recoveryDelay_ == 0) revert ZeroRecoveryDelay();
    if (address(wrapper_) == address(0) || address(underlying_) == address(0)) revert ZeroAddress();
    wrapper = wrapper_;
    underlying = underlying_;
    recoveryDelay = recoveryDelay_;
  }

  function onConfidentialTransferReceived(
    address operator,
    address from,
    euint256 amount,
    bytes calldata
  ) external returns (ebool) {
    if (msg.sender != address(wrapper)) revert WrongWrapper(msg.sender);
    if (operator != from) revert WrongCallbackOperator();
    _requireState(LifecycleState.Empty);
    if (!Nox.isAllowed(amount, address(this))) revert MissingTransientAccess();

    heldAmount = amount;
    owner = from;
    Nox.allowThis(heldAmount);
    Nox.addViewer(heldAmount, owner);
    state = LifecycleState.Held;
    return Nox.toEbool(true);
  }

  function returnToOwner(address recipient) external {
    _requireOwner();
    if (recipient != owner) revert WrongRecipient();
    if (state != LifecycleState.Held && state != LifecycleState.Rewrapped) {
      revert UnexpectedLifecycleState(LifecycleState.Held, state);
    }

    euint256 poolBalance = wrapper.confidentialBalanceOf(address(this));
    wrapper.confidentialTransfer(recipient, poolBalance);
    state = LifecycleState.Returned;
  }

  function requestUnwrapForRecovery() external {
    _requireOwner();
    _requireState(LifecycleState.Held);
    if (underlying.balanceOf(address(this)) != 0) {
      revert PublicBalanceNotEmpty(underlying.balanceOf(address(this)));
    }

    euint256 poolBalance = wrapper.confidentialBalanceOf(address(this));
    unwrapRequest = wrapper.unwrap(address(this), address(this), poolBalance);
    recoveryAvailableAt = uint48(block.timestamp) + recoveryDelay;
    state = LifecycleState.UnwrapPending;
  }

  function recoverAndRewrap(
    bytes calldata decryptedAmountAndProof,
    uint256 expectedReleasedAmount
  ) external {
    _requireState(LifecycleState.UnwrapPending);
    if (block.timestamp < recoveryAvailableAt) revert EarlyRecovery(recoveryAvailableAt);

    uint256 balanceBefore = underlying.balanceOf(address(this));
    if (balanceBefore != 0) revert PublicBalanceNotEmpty(balanceBefore);
    wrapper.finalizeUnwrap(unwrapRequest, decryptedAmountAndProof);
    uint256 balanceAfter = underlying.balanceOf(address(this));
    if (balanceAfter != expectedReleasedAmount) revert ReleaseDeltaMismatch();

    underlying.forceApprove(address(wrapper), expectedReleasedAmount);
    wrapper.wrap(address(this), expectedReleasedAmount);
    observedReleasedAmount = expectedReleasedAmount;
    state = LifecycleState.Rewrapped;
  }

  function unwrapRequestHandle() external view returns (bytes32) {
    _requireState(LifecycleState.UnwrapPending);
    return euint256.unwrap(unwrapRequest);
  }

  function probeMissingAccess(bytes32 handle) external {
    euint256 value = euint256.wrap(handle);
    Nox.add(value, Nox.toEuint256(0));
  }

  function _requireOwner() private view {
    if (msg.sender != owner) revert OwnerOnly(msg.sender);
  }

  function _requireState(LifecycleState expected) private view {
    if (state != expected) revert UnexpectedLifecycleState(expected, state);
  }
}
