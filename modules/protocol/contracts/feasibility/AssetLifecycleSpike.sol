// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IERC20} from '@openzeppelin/contracts/interfaces/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {IERC7984Receiver} from '@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC7984Receiver.sol';
import {IERC20ToERC7984Wrapper} from '@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC20ToERC7984Wrapper.sol';
import {
  Nox,
  ebool,
  euint256,
  externalEuint256
} from '@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol';

/// @notice Isolated FND-04 receiver and recovery harness. It has no production or real-asset custody.
contract AssetLifecycleSpike is IERC7984Receiver {
  using SafeERC20 for IERC20;
  using Nox for euint256;

  enum LifecycleState {
    Empty,
    IntentRegistered,
    DepositPending,
    Held,
    UnwrapPending,
    Rewrapped,
    Returned,
    Rejected
  }

  error CallbackOwnerMismatch(address expected, address actual);
  error DepositAcceptanceMismatch();
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
  ebool private depositAccepted;
  euint256 private balanceBeforeTransfer;
  euint256 private expectedAmount;
  euint256 private heldAmount;
  euint256 private unwrapRequest;

  constructor(IERC20ToERC7984Wrapper wrapper_, IERC20 underlying_, uint48 recoveryDelay_) {
    if (recoveryDelay_ == 0) revert ZeroRecoveryDelay();
    if (address(wrapper_) == address(0) || address(underlying_) == address(0)) revert ZeroAddress();
    wrapper = wrapper_;
    underlying = underlying_;
    recoveryDelay = recoveryDelay_;
  }

  function registerExpectedStake(
    externalEuint256 encryptedAmount,
    bytes calldata inputProof
  ) external {
    _requireState(LifecycleState.Empty);
    expectedAmount = Nox.fromExternal(encryptedAmount, inputProof);
    balanceBeforeTransfer = wrapper.confidentialBalanceOf(address(this));
    if (!Nox.isAllowed(balanceBeforeTransfer, address(this))) revert MissingTransientAccess();

    owner = msg.sender;
    Nox.allowThis(expectedAmount);
    Nox.allowThis(balanceBeforeTransfer);
    state = LifecycleState.IntentRegistered;
  }

  function onConfidentialTransferReceived(
    address operator,
    address from,
    euint256,
    bytes calldata
  ) external returns (ebool) {
    if (msg.sender != address(wrapper)) revert WrongWrapper(msg.sender);
    if (operator != from) revert WrongCallbackOperator();
    if (from != owner) revert CallbackOwnerMismatch(owner, from);
    _requireState(LifecycleState.IntentRegistered);
    euint256 poolBalance = wrapper.confidentialBalanceOf(address(this));
    if (!Nox.isAllowed(poolBalance, address(this))) revert MissingTransientAccess();

    euint256 receivedAmount = Nox.sub(poolBalance, balanceBeforeTransfer);
    depositAccepted = Nox.eq(receivedAmount, expectedAmount);
    heldAmount = Nox.select(depositAccepted, receivedAmount, Nox.toEuint256(0));
    Nox.allowThis(depositAccepted);
    Nox.allowThis(heldAmount);
    Nox.addViewer(heldAmount, owner);
    Nox.allowPublicDecryption(depositAccepted);
    state = LifecycleState.DepositPending;
    return depositAccepted;
  }

  function finalizeDepositAcceptance(bytes calldata acceptanceProof) external {
    _requireState(LifecycleState.DepositPending);
    if (!Nox.publicDecrypt(depositAccepted, acceptanceProof)) revert DepositAcceptanceMismatch();
    state = LifecycleState.Held;
  }

  function rejectDeposit(bytes calldata acceptanceProof) external {
    _requireState(LifecycleState.DepositPending);
    if (Nox.publicDecrypt(depositAccepted, acceptanceProof)) revert DepositAcceptanceMismatch();
    state = LifecycleState.Rejected;
  }

  function returnToOwner(address recipient) external {
    _requireOwner();
    if (recipient != owner) revert WrongRecipient();
    if (state != LifecycleState.Held && state != LifecycleState.Rewrapped) {
      revert UnexpectedLifecycleState(LifecycleState.Held, state);
    }

    wrapper.confidentialTransfer(recipient, heldAmount);
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
    heldAmount = wrapper.confidentialBalanceOf(address(this));
    Nox.allowThis(heldAmount);
    observedReleasedAmount = expectedReleasedAmount;
    state = LifecycleState.Rewrapped;
  }

  function unwrapRequestHandle() external view returns (bytes32) {
    _requireState(LifecycleState.UnwrapPending);
    return euint256.unwrap(unwrapRequest);
  }

  function depositAcceptanceHandle() external view returns (bytes32) {
    _requireState(LifecycleState.DepositPending);
    return ebool.unwrap(depositAccepted);
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
