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

/// @notice Isolated FND-05 cohort, disclosure, and recovery harness for Sepolia feasibility.
/// @dev It is not a production pool and never calls an adapter.
contract AggregateRecoverySpike is IERC7984Receiver {
  using SafeERC20 for IERC20;
  using Nox for ebool;
  using Nox for euint256;

  uint256 public constant BPS_SCALE = 10_000;
  uint256 public constant EPOCH_ID = 1;
  bytes32 private constant AGGREGATE_REQUEST_DOMAIN = keccak256(
    'QuietSignal.FND05.AggregateRequest.v1'
  );

  enum LifecycleState {
    Open,
    CommitPending,
    AggregatePending,
    UnwrapPending,
    Refundable
  }

  enum FundsLocation {
    OwnerConfidentialCustody,
    CallbackOutcomePending,
    PoolConfidentialCustody,
    BurnPendingProof
  }

  struct Position {
    euint256 stake;
    euint256 probabilityBps;
    euint256 yesAllocation;
    euint256 noAllocation;
    bool committed;
    bool refunded;
  }

  error AggregateAlreadyRequested();
  error AggregateNotFinalized();
  error CallbackOwnerMismatch(address expected, address actual);
  error CommitAlreadyStarted(address owner);
  error CommitRejected();
  error CommitWindowClosed(uint48 deadline);
  error ConservationViolation(uint256 expected, uint256 actual);
  error EarlyRecovery(uint48 availableAt);
  error EarlyTimeout(uint48 availableAt);
  error InvalidAggregateProofContext(bytes32 expected, bytes32 actual);
  error InvalidLifecycleState(LifecycleState expected, LifecycleState actual);
  error InvalidProbabilityProof();
  error InvalidStakeProof();
  error MissingTransientAccess();
  error NotCommitted(address owner);
  error PendingCommitNotExpired(uint48 availableAt);
  error PositionAlreadyRefunded(address owner);
  error PublicBalanceNotEmpty(uint256 balance);
  error PublicDecryptMismatch(uint256 declaredValue, uint256 provenValue);
  error WrongCallbackOperator();
  error WrongWrapper(address caller);
  error ZeroAddress();
  error ZeroDuration();
  error ZeroThreshold();

  IERC20 public immutable underlying;
  IERC20ToERC7984Wrapper public immutable wrapper;
  uint48 public immutable aggregateTimeout;
  uint48 public immutable openDuration;
  uint48 public immutable pendingCommitTimeout;
  uint48 public immutable recoveryDelay;
  uint256 public immutable kMin;

  LifecycleState public state;
  uint48 public aggregatePendingSince;
  uint48 public deadline;
  uint48 public pendingCommitAvailableAt;
  uint48 public recoveryAvailableAt;
  uint256 public participantCount;
  uint256 public publicNo;
  uint256 public publicYes;
  uint256 public observedReleasedAmount;
  address public pendingOwner;
  bytes32 public aggregateRequestId;
  bool private aggregatesInitialized;
  bool private callbackReceived;

  euint256 private aggregateNo;
  euint256 private aggregateTotal;
  euint256 private aggregateYes;
  euint256 private balanceBeforeTransfer;
  ebool private commitAccepted;
  euint256 private pendingNo;
  euint256 private pendingProbabilityBps;
  euint256 private pendingStake;
  euint256 private pendingYes;
  euint256 private unwrapRequest;

  mapping(address owner => Position) private positions;

  constructor(
    IERC20ToERC7984Wrapper wrapper_,
    IERC20 underlying_,
    uint256 kMin_,
    uint48 openDuration_,
    uint48 aggregateTimeout_,
    uint48 recoveryDelay_,
    uint48 pendingCommitTimeout_
  ) {
    if (address(wrapper_) == address(0) || address(underlying_) == address(0)) {
      revert ZeroAddress();
    }
    if (kMin_ == 0) revert ZeroThreshold();
    if (
      openDuration_ == 0 ||
      aggregateTimeout_ == 0 ||
      recoveryDelay_ == 0 ||
      pendingCommitTimeout_ == 0
    ) {
      revert ZeroDuration();
    }

    wrapper = wrapper_;
    underlying = underlying_;
    kMin = kMin_;
    openDuration = openDuration_;
    aggregateTimeout = aggregateTimeout_;
    recoveryDelay = recoveryDelay_;
    pendingCommitTimeout = pendingCommitTimeout_;
  }

  function commitSignal(
    externalEuint256 encryptedStake,
    bytes calldata stakeProof,
    externalEuint256 encryptedProbabilityBps,
    bytes calldata probabilityProof
  ) external {
    _requireState(LifecycleState.Open);
    if (positions[msg.sender].committed || pendingOwner == msg.sender) {
      revert CommitAlreadyStarted(msg.sender);
    }
    if (deadline != 0 && block.timestamp >= deadline) revert CommitWindowClosed(deadline);
    if (externalEuint256.unwrap(encryptedStake) == bytes32(0)) revert InvalidStakeProof();
    if (externalEuint256.unwrap(encryptedProbabilityBps) == bytes32(0)) {
      revert InvalidProbabilityProof();
    }

    _initializeAggregates();

    pendingStake = Nox.fromExternal(encryptedStake, stakeProof);
    pendingProbabilityBps = Nox.fromExternal(encryptedProbabilityBps, probabilityProof);
    euint256 scale = Nox.toEuint256(BPS_SCALE);
    ebool probabilityInRange = Nox.le(pendingProbabilityBps, scale);
    pendingProbabilityBps = Nox.select(probabilityInRange, pendingProbabilityBps, scale);
    pendingYes = Nox.div(Nox.mul(pendingStake, pendingProbabilityBps), scale);
    pendingNo = Nox.sub(pendingStake, pendingYes);
    balanceBeforeTransfer = wrapper.confidentialBalanceOf(address(this));
    if (!Nox.isAllowed(balanceBeforeTransfer, address(this))) revert MissingTransientAccess();

    Nox.allowThis(pendingStake);
    Nox.allowThis(pendingProbabilityBps);
    Nox.allowThis(pendingYes);
    Nox.allowThis(pendingNo);
    Nox.allowThis(balanceBeforeTransfer);
    pendingOwner = msg.sender;
    pendingCommitAvailableAt = uint48(block.timestamp) + pendingCommitTimeout;
    callbackReceived = false;
    if (deadline == 0) deadline = uint48(block.timestamp) + openDuration;
    state = LifecycleState.CommitPending;
  }

  function onConfidentialTransferReceived(
    address operator,
    address from,
    euint256,
    bytes calldata
  ) external returns (ebool) {
    if (msg.sender != address(wrapper)) revert WrongWrapper(msg.sender);
    if (operator != from) revert WrongCallbackOperator();
    if (from != pendingOwner) revert CallbackOwnerMismatch(pendingOwner, from);
    _requireState(LifecycleState.CommitPending);

    euint256 currentBalance = wrapper.confidentialBalanceOf(address(this));
    if (!Nox.isAllowed(currentBalance, address(this))) revert MissingTransientAccess();
    euint256 receivedStake = Nox.sub(currentBalance, balanceBeforeTransfer);
    commitAccepted = Nox.eq(receivedStake, pendingStake);
    callbackReceived = true;
    Nox.allowThis(commitAccepted);
    Nox.allowPublicDecryption(commitAccepted);
    Nox.allowTransient(commitAccepted, msg.sender);
    return commitAccepted;
  }

  function finalizeCommit(bytes calldata acceptanceProof) external {
    _requireState(LifecycleState.CommitPending);
    if (!Nox.publicDecrypt(commitAccepted, acceptanceProof)) revert CommitRejected();

    Position storage position = positions[pendingOwner];
    position.stake = pendingStake;
    position.probabilityBps = pendingProbabilityBps;
    position.yesAllocation = pendingYes;
    position.noAllocation = pendingNo;
    position.committed = true;
    Nox.allowThis(position.stake);
    Nox.allowThis(position.probabilityBps);
    Nox.allowThis(position.yesAllocation);
    Nox.allowThis(position.noAllocation);
    Nox.addViewer(position.stake, pendingOwner);
    Nox.addViewer(position.probabilityBps, pendingOwner);
    Nox.addViewer(position.yesAllocation, pendingOwner);
    Nox.addViewer(position.noAllocation, pendingOwner);

    aggregateYes = Nox.add(aggregateYes, pendingYes);
    aggregateNo = Nox.add(aggregateNo, pendingNo);
    aggregateTotal = Nox.add(aggregateTotal, pendingStake);
    Nox.allowThis(aggregateYes);
    Nox.allowThis(aggregateNo);
    Nox.allowThis(aggregateTotal);
    participantCount += 1;
    _clearPendingCommit();
    state = LifecycleState.Open;
  }

  function rejectPendingCommit(bytes calldata acceptanceProof) external {
    _requireState(LifecycleState.CommitPending);
    if (Nox.publicDecrypt(commitAccepted, acceptanceProof)) revert CommitRejected();
    _clearPendingCommit();
    state = LifecycleState.Open;
  }

  function expirePendingCommit() external {
    _requireState(LifecycleState.CommitPending);
    if (block.timestamp < pendingCommitAvailableAt) {
      revert PendingCommitNotExpired(pendingCommitAvailableAt);
    }
    _clearPendingCommit();
    state = LifecycleState.Open;
  }

  function closeEpoch() external {
    _requireState(LifecycleState.Open);
    if (deadline == 0 || block.timestamp < deadline) revert CommitWindowClosed(deadline);
    if (participantCount < kMin) {
      state = LifecycleState.Refundable;
      return;
    }
    aggregatePendingSince = uint48(block.timestamp);
    state = LifecycleState.AggregatePending;
  }

  function requestAggregateDecrypt() external {
    _requireState(LifecycleState.AggregatePending);
    if (aggregateRequestId != bytes32(0)) revert AggregateAlreadyRequested();
    Nox.allowPublicDecryption(aggregateYes);
    Nox.allowPublicDecryption(aggregateNo);
    aggregateRequestId = _aggregateProofContext(block.chainid, address(this), EPOCH_ID);
  }

  function finalizeAggregate(
    bytes32 suppliedRequestId,
    uint256 declaredYes,
    uint256 declaredNo,
    bytes calldata yesProof,
    bytes calldata noProof
  ) external {
    _requireState(LifecycleState.AggregatePending);
    if (aggregateRequestId == bytes32(0)) revert AggregateNotFinalized();
    if (suppliedRequestId != aggregateRequestId) {
      revert InvalidAggregateProofContext(aggregateRequestId, suppliedRequestId);
    }

    uint256 provenYes = Nox.publicDecrypt(aggregateYes, yesProof);
    uint256 provenNo = Nox.publicDecrypt(aggregateNo, noProof);
    if (declaredYes != provenYes) revert PublicDecryptMismatch(declaredYes, provenYes);
    if (declaredNo != provenNo) revert PublicDecryptMismatch(declaredNo, provenNo);

    publicYes = provenYes;
    publicNo = provenNo;
    Nox.allowTransient(aggregateTotal, address(wrapper));
    unwrapRequest = wrapper.unwrap(address(this), address(this), aggregateTotal);
    Nox.allowThis(unwrapRequest);
    recoveryAvailableAt = uint48(block.timestamp) + recoveryDelay;
    state = LifecycleState.UnwrapPending;
  }

  function cancelBeforeUnwrap() external {
    _requireState(LifecycleState.AggregatePending);
    uint48 availableAt = aggregatePendingSince + aggregateTimeout;
    if (block.timestamp < availableAt) revert EarlyTimeout(availableAt);
    state = LifecycleState.Refundable;
  }

  function recoverUnwrap(bytes calldata decryptedAmountAndProof) external {
    _requireState(LifecycleState.UnwrapPending);
    if (block.timestamp < recoveryAvailableAt) revert EarlyRecovery(recoveryAvailableAt);
    uint256 balanceBefore = underlying.balanceOf(address(this));
    if (balanceBefore != 0) revert PublicBalanceNotEmpty(balanceBefore);

    wrapper.finalizeUnwrap(unwrapRequest, decryptedAmountAndProof);
    uint256 releasedCollateral = underlying.balanceOf(address(this));
    uint256 expectedCollateral = publicYes + publicNo;
    if (releasedCollateral != expectedCollateral) {
      revert ConservationViolation(expectedCollateral, releasedCollateral);
    }

    underlying.forceApprove(address(wrapper), releasedCollateral);
    wrapper.wrap(address(this), releasedCollateral);
    observedReleasedAmount = releasedCollateral;
    state = LifecycleState.Refundable;
  }

  function refund() external {
    _requireState(LifecycleState.Refundable);
    Position storage position = positions[msg.sender];
    if (!position.committed) revert NotCommitted(msg.sender);
    if (position.refunded) revert PositionAlreadyRefunded(msg.sender);
    Nox.allowTransient(position.stake, address(wrapper));
    wrapper.confidentialTransfer(msg.sender, position.stake);
    position.refunded = true;
  }

  function aggregateHandles() external view returns (bytes32 yes, bytes32 no, bytes32 total) {
    return (
      euint256.unwrap(aggregateYes),
      euint256.unwrap(aggregateNo),
      euint256.unwrap(aggregateTotal)
    );
  }

  function aggregateAccess() external view returns (bool yes, bool no, bool total) {
    return (
      Nox.isPubliclyDecryptable(aggregateYes),
      Nox.isPubliclyDecryptable(aggregateNo),
      Nox.isPubliclyDecryptable(aggregateTotal)
    );
  }

  function positionHandles(
    address owner
  ) external view returns (bytes32 stake, bytes32 probabilityBps, bytes32 yes, bytes32 no) {
    Position storage position = positions[owner];
    if (!position.committed) revert NotCommitted(owner);
    return (
      euint256.unwrap(position.stake),
      euint256.unwrap(position.probabilityBps),
      euint256.unwrap(position.yesAllocation),
      euint256.unwrap(position.noAllocation)
    );
  }

  function unwrapRequestHandle() external view returns (bytes32) {
    _requireState(LifecycleState.UnwrapPending);
    return euint256.unwrap(unwrapRequest);
  }

  function pendingCommitAcceptanceHandle() external view returns (bytes32) {
    _requireState(LifecycleState.CommitPending);
    return ebool.unwrap(commitAccepted);
  }

  function fundsLocation() external view returns (FundsLocation) {
    if (state == LifecycleState.CommitPending) {
      return
        callbackReceived
          ? FundsLocation.CallbackOutcomePending
          : FundsLocation.OwnerConfidentialCustody;
    }
    if (state == LifecycleState.UnwrapPending) return FundsLocation.BurnPendingProof;
    return FundsLocation.PoolConfidentialCustody;
  }

  function aggregateProofContext(
    uint256 chainId,
    address pool,
    uint256 epochId
  ) external pure returns (bytes32) {
    return _aggregateProofContext(chainId, pool, epochId);
  }

  function _aggregateProofContext(
    uint256 chainId,
    address pool,
    uint256 epochId
  ) private pure returns (bytes32) {
    return keccak256(abi.encode(AGGREGATE_REQUEST_DOMAIN, chainId, pool, epochId));
  }

  function _clearPendingCommit() private {
    pendingOwner = address(0);
    pendingCommitAvailableAt = 0;
    callbackReceived = false;
  }

  function _initializeAggregates() private {
    if (aggregatesInitialized) return;
    aggregateYes = Nox.toEuint256(0);
    aggregateNo = Nox.toEuint256(0);
    aggregateTotal = Nox.toEuint256(0);
    Nox.allowThis(aggregateYes);
    Nox.allowThis(aggregateNo);
    Nox.allowThis(aggregateTotal);
    aggregatesInitialized = true;
  }

  function _requireState(LifecycleState expected) private view {
    if (state != expected) revert InvalidLifecycleState(expected, state);
  }
}
