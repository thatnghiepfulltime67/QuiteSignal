// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IERC7984} from '@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC7984.sol';
import {IERC7984Receiver} from '@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC7984Receiver.sol';
import {
  Nox,
  ebool,
  euint256,
  externalEuint256
} from '@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol';

import {IQuietSignalErrors} from '../interfaces/IQuietSignalErrors.sol';
import {IResolutionAdapter} from '../interfaces/IResolutionAdapter.sol';
import {QuietSignalTypes} from '../interfaces/QuietSignalTypes.sol';

/// @notice Immutable one-epoch pool with bounded intent-bound confidential custody.
/// @dev PK-05 adds only the k-gated aggregate disclosure boundary.
contract QuietSignalPool is IERC7984Receiver {
  using Nox for ebool;
  using Nox for euint256;

  uint256 private constant BPS_SCALE = 10_000;

  bytes32 public immutable poolId;
  bytes32 public immutable epochId;
  IERC7984 public immutable confidentialCollateral;
  address public immutable resolutionAdapter;
  uint64 public immutable deadline;
  uint64 public immutable commitTimeout;
  uint32 public immutable kMin;
  uint64 public immutable aggregateTimeout;
  uint64 public immutable resolutionGrace;

  QuietSignalTypes.PublicEpoch private _epoch;
  mapping(address owner => QuietSignalTypes.OwnerPosition position) private _positions;

  struct PendingCommit {
    address owner;
    uint64 availableAt;
    bool callbackReceived;
    euint256 stake;
    euint256 probabilityBps;
    euint256 yesAllocation;
    euint256 noAllocation;
    euint256 balanceBeforeTransfer;
    euint256 conditionallyHeldStake;
    ebool accepted;
  }

  PendingCommit private _pending;
  euint256 private _aggregateYes;
  euint256 private _aggregateNo;
  euint256 private _aggregateTotal;
  bool private _aggregatesInitialized;

  event EpochOpened(bytes32 indexed epochId, address indexed pool, uint64 deadline, uint32 kMin);
  event SignalIntentRegistered(bytes32 indexed epochId, address indexed owner, uint64 availableAt);
  event SignalIntentCleared(bytes32 indexed epochId, address indexed owner, bool callbackReceived);
  event SignalCommitted(bytes32 indexed epochId, address indexed owner, bytes32 commitmentId);
  event EpochClosed(bytes32 indexed epochId, uint32 participantCount);
  event AggregateDecryptRequested(bytes32 indexed epochId, bytes32 indexed requestId);
  event AggregateFinalized(
    bytes32 indexed epochId,
    bytes32 indexed requestId,
    uint256 publicYes,
    uint256 publicNo
  );
  event SettlementFinalized(
    bytes32 indexed epochId,
    uint8 winner,
    uint256 aggregateCollateral,
    uint256 winningAggregate,
    uint80 roundId,
    int256 answer
  );
  event ScoreMaterialized(bytes32 indexed epochId, address indexed owner);
  event PayoutClaimed(bytes32 indexed epochId, address indexed owner, bytes32 claimId);
  event Refunded(bytes32 indexed epochId, address indexed owner, bytes32 refundId);

  constructor(bytes32 poolId_, QuietSignalTypes.PoolConfig memory config_) {
    if (
      poolId_ == bytes32(0) ||
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

    poolId = poolId_;
    epochId = keccak256(abi.encode(block.chainid, address(this), poolId_));
    confidentialCollateral = IERC7984(config_.confidentialCollateral);
    resolutionAdapter = config_.resolutionAdapter;
    deadline = config_.deadline;
    commitTimeout = config_.commitTimeout;
    kMin = config_.kMin;
    aggregateTimeout = config_.aggregateTimeout;
    resolutionGrace = config_.resolutionGrace;
    _epoch = QuietSignalTypes.PublicEpoch({
      state: QuietSignalTypes.EpochState.OPEN,
      winner: QuietSignalTypes.Outcome.UNRESOLVED,
      deadline: config_.deadline,
      participantCount: 0,
      aggregateRequestId: bytes32(0),
      aggregatePendingAt: 0,
      resolutionPendingAt: 0,
      publicYes: 0,
      publicNo: 0,
      settledRoundId: 0,
      settledAnswer: 0
    });

    emit EpochOpened(epochId, address(this), config_.deadline, config_.kMin);
  }

  function config() external view returns (QuietSignalTypes.PoolConfig memory) {
    return
      QuietSignalTypes.PoolConfig({
        confidentialCollateral: address(confidentialCollateral),
        resolutionAdapter: resolutionAdapter,
        deadline: deadline,
        commitTimeout: commitTimeout,
        kMin: kMin,
        aggregateTimeout: aggregateTimeout,
        resolutionGrace: resolutionGrace
      });
  }

  function epoch() external view returns (QuietSignalTypes.PublicEpoch memory) {
    return _epoch;
  }

  /// @notice Returns only the caller's opaque owner position handles.
  function ownerPosition() external view returns (QuietSignalTypes.OwnerPosition memory) {
    return _positions[msg.sender];
  }

  function pendingCommit()
    external
    view
    returns (address owner, uint64 availableAt, bool callbackReceived)
  {
    return (_pending.owner, _pending.availableAt, _pending.callbackReceived);
  }

  function pendingAcceptanceHandle() external view returns (bytes32) {
    _requirePendingCallback();
    return ebool.unwrap(_pending.accepted);
  }

  /// @notice Registers an owner-bound encrypted signal before its token callback.
  function commitSignal(
    externalEuint256 encryptedStake,
    bytes calldata stakeProof,
    externalEuint256 encryptedProbabilityBps,
    bytes calldata probabilityProof
  ) external {
    _requireState(QuietSignalTypes.EpochState.OPEN);
    if (_pending.owner != address(0)) revert IQuietSignalErrors.PendingCommitExists(_pending.owner);
    if (_positions[msg.sender].committed) revert IQuietSignalErrors.AlreadyCommitted(msg.sender);
    if (block.timestamp >= deadline) {
      revert IQuietSignalErrors.CommitWindowClosed(deadline, uint64(block.timestamp));
    }
    if (
      externalEuint256.unwrap(encryptedStake) == bytes32(0) ||
      externalEuint256.unwrap(encryptedProbabilityBps) == bytes32(0)
    ) revert IQuietSignalErrors.InvalidInputHandle();

    euint256 stake = Nox.fromExternal(encryptedStake, stakeProof);
    euint256 probability = Nox.fromExternal(encryptedProbabilityBps, probabilityProof);
    euint256 scale = Nox.toEuint256(BPS_SCALE);
    euint256 clampedProbability = Nox.select(Nox.le(probability, scale), probability, scale);
    (euint256 yesAllocation, euint256 noAllocation) = _deriveAllocation(
      stake,
      clampedProbability,
      scale
    );
    euint256 balanceBeforeTransfer = confidentialCollateral.confidentialBalanceOf(address(this));
    if (!Nox.isAllowed(balanceBeforeTransfer, address(this))) {
      revert IQuietSignalErrors.UnauthorizedCollateral(address(confidentialCollateral));
    }

    _initializeAggregates();
    _pending.owner = msg.sender;
    _pending.availableAt = uint64(block.timestamp) + commitTimeout;
    _pending.stake = stake;
    _pending.probabilityBps = clampedProbability;
    _pending.yesAllocation = yesAllocation;
    _pending.noAllocation = noAllocation;
    _pending.balanceBeforeTransfer = balanceBeforeTransfer;
    Nox.allowThis(stake);
    Nox.allowThis(clampedProbability);
    Nox.allowThis(yesAllocation);
    Nox.allowThis(noAllocation);
    Nox.allowThis(balanceBeforeTransfer);
    _epoch.state = QuietSignalTypes.EpochState.COMMIT_PENDING;
    emit SignalIntentRegistered(epochId, msg.sender, _pending.availableAt);
  }

  /// @inheritdoc IERC7984Receiver
  function onConfidentialTransferReceived(
    address operator,
    address from,
    euint256,
    bytes calldata
  ) external returns (ebool) {
    if (msg.sender != address(confidentialCollateral)) {
      revert IQuietSignalErrors.UnauthorizedCollateral(msg.sender);
    }
    if (operator != from) revert IQuietSignalErrors.WrongCallbackOperator();
    _requireState(QuietSignalTypes.EpochState.COMMIT_PENDING);
    if (from != _pending.owner) {
      revert IQuietSignalErrors.CallbackOwnerMismatch(_pending.owner, from);
    }

    euint256 balanceAfterTransfer = confidentialCollateral.confidentialBalanceOf(address(this));
    if (!Nox.isAllowed(balanceAfterTransfer, address(this))) {
      revert IQuietSignalErrors.UnauthorizedCollateral(address(confidentialCollateral));
    }
    euint256 receivedStake = Nox.sub(balanceAfterTransfer, _pending.balanceBeforeTransfer);
    euint256 zero = Nox.toEuint256(0);
    euint256 expectedStake = Nox.select(
      Nox.ne(_pending.stake, zero),
      _pending.stake,
      Nox.toEuint256(1)
    );
    _pending.accepted = Nox.eq(receivedStake, expectedStake);
    _pending.conditionallyHeldStake = Nox.select(_pending.accepted, receivedStake, zero);
    _pending.callbackReceived = true;
    Nox.allowThis(_pending.accepted);
    Nox.allowThis(_pending.conditionallyHeldStake);
    Nox.allowPublicDecryption(_pending.accepted);
    Nox.allowTransient(_pending.accepted, msg.sender);
    return _pending.accepted;
  }

  /// @notice Finalizes a callback whose amount-free acceptance proof is true.
  function finalizeCommit(bytes calldata acceptanceProof) external {
    _requirePendingCallback();
    if (!Nox.publicDecrypt(_pending.accepted, acceptanceProof)) {
      revert IQuietSignalErrors.CommitRejected();
    }

    address owner = _pending.owner;
    QuietSignalTypes.OwnerPosition storage position = _positions[owner];
    position.committed = true;
    position.stake = _pending.stake;
    position.probabilityBps = _pending.probabilityBps;
    position.yesAllocation = _pending.yesAllocation;
    position.noAllocation = _pending.noAllocation;
    Nox.allowThis(position.stake);
    Nox.allowThis(position.probabilityBps);
    Nox.allowThis(position.yesAllocation);
    Nox.allowThis(position.noAllocation);
    Nox.addViewer(position.stake, owner);
    Nox.addViewer(position.probabilityBps, owner);
    Nox.addViewer(position.yesAllocation, owner);
    Nox.addViewer(position.noAllocation, owner);

    _aggregateYes = Nox.add(_aggregateYes, _pending.yesAllocation);
    _aggregateNo = Nox.add(_aggregateNo, _pending.noAllocation);
    _aggregateTotal = Nox.add(_aggregateTotal, _pending.stake);
    Nox.allowThis(_aggregateYes);
    Nox.allowThis(_aggregateNo);
    Nox.allowThis(_aggregateTotal);
    _epoch.participantCount += 1;
    bytes32 commitmentId = keccak256(abi.encode(epochId, owner, _epoch.participantCount));
    _clearPending();
    emit SignalCommitted(epochId, owner, commitmentId);
  }

  /// @notice Clears a callback whose amount-free acceptance proof is false.
  function rejectPendingCommit(bytes calldata acceptanceProof) external {
    _requirePendingCallback();
    if (Nox.publicDecrypt(_pending.accepted, acceptanceProof)) {
      revert IQuietSignalErrors.CommitRejected();
    }
    _clearPending();
  }

  /// @notice Permissionlessly clears or returns a stalled pending intent after timeout.
  function expirePendingCommit() external {
    _requireState(QuietSignalTypes.EpochState.COMMIT_PENDING);
    if (_pending.owner == address(0)) revert IQuietSignalErrors.PendingCommitMissing();
    if (block.timestamp < _pending.availableAt) {
      revert IQuietSignalErrors.PendingCommitTimeoutNotReached(
        _pending.availableAt,
        uint64(block.timestamp)
      );
    }
    if (_pending.callbackReceived) {
      Nox.allowTransient(_pending.conditionallyHeldStake, address(confidentialCollateral));
      confidentialCollateral.confidentialTransfer(_pending.owner, _pending.conditionallyHeldStake);
    }
    _clearPending();
  }

  /// @notice Closes the commit window and applies the immutable cohort threshold.
  function closeEpoch() external {
    _requireState(QuietSignalTypes.EpochState.OPEN);
    if (block.timestamp < deadline) {
      revert IQuietSignalErrors.CommitWindowClosed(deadline, uint64(block.timestamp));
    }
    if (_epoch.participantCount < kMin) {
      _epoch.state = QuietSignalTypes.EpochState.REFUNDABLE;
      emit EpochClosed(epochId, _epoch.participantCount);
      return;
    }
    _epoch.aggregatePendingAt = uint64(block.timestamp);
    _epoch.state = QuietSignalTypes.EpochState.AGGREGATE_PENDING;
    emit EpochClosed(epochId, _epoch.participantCount);
  }

  /// @notice Enables public decryption for the two k-gated aggregate handles only.
  function requestAggregateDecrypt() external returns (bytes32 requestId) {
    _requireState(QuietSignalTypes.EpochState.AGGREGATE_PENDING);
    if (_epoch.aggregateRequestId != bytes32(0)) {
      revert IQuietSignalErrors.DuplicateAggregateRequest(_epoch.aggregateRequestId);
    }
    requestId = _aggregateRequestId();
    _epoch.aggregateRequestId = requestId;
    Nox.allowPublicDecryption(_aggregateYes);
    Nox.allowPublicDecryption(_aggregateNo);
    emit AggregateDecryptRequested(epochId, requestId);
  }

  /// @notice Returns only handles already enabled for aggregate public decryption.
  function aggregateDisclosureHandles()
    external
    view
    returns (bytes32 yesHandle, bytes32 noHandle)
  {
    _requireState(QuietSignalTypes.EpochState.AGGREGATE_PENDING);
    if (_epoch.aggregateRequestId == bytes32(0)) {
      revert IQuietSignalErrors.AggregateRequestMissing();
    }
    return (euint256.unwrap(_aggregateYes), euint256.unwrap(_aggregateNo));
  }

  /// @notice Stores only proof-verified YES/NO aggregate totals for resolution.
  function finalizeAggregate(
    bytes32 suppliedRequestId,
    bytes calldata yesProof,
    bytes calldata noProof
  ) external {
    _requireState(QuietSignalTypes.EpochState.AGGREGATE_PENDING);
    bytes32 requestId = _epoch.aggregateRequestId;
    if (requestId == bytes32(0)) revert IQuietSignalErrors.AggregateRequestMissing();
    if (suppliedRequestId != requestId) {
      revert IQuietSignalErrors.ProofContextMismatch(suppliedRequestId);
    }
    uint256 publicYes = Nox.publicDecrypt(_aggregateYes, yesProof);
    uint256 publicNo = Nox.publicDecrypt(_aggregateNo, noProof);
    _epoch.publicYes = publicYes;
    _epoch.publicNo = publicNo;
    _epoch.resolutionPendingAt = uint64(block.timestamp);
    _epoch.state = QuietSignalTypes.EpochState.RESOLUTION_PENDING;
    emit AggregateFinalized(epochId, requestId, publicYes, publicNo);
  }

  /// @notice Makes a stalled aggregate request refundable after its immutable timeout.
  function cancelBeforeResolution() external {
    _requireState(QuietSignalTypes.EpochState.AGGREGATE_PENDING);
    uint64 eligibleAt = _epoch.aggregatePendingAt + aggregateTimeout;
    if (block.timestamp < eligibleAt) {
      revert IQuietSignalErrors.AggregateTimeoutNotReached(eligibleAt, uint64(block.timestamp));
    }
    _epoch.state = QuietSignalTypes.EpochState.REFUNDABLE;
  }

  /// @notice Resolves exclusively from the immutable adapter and never caller input.
  function settle() external {
    _requireState(QuietSignalTypes.EpochState.RESOLUTION_PENDING);
    (uint8 winnerValue, uint80 roundId, int256 answer, ) = IResolutionAdapter(resolutionAdapter)
      .resolution();
    QuietSignalTypes.Outcome winner;
    uint256 winningAggregate;
    if (winnerValue == uint8(QuietSignalTypes.Outcome.YES)) {
      winner = QuietSignalTypes.Outcome.YES;
      winningAggregate = _epoch.publicYes;
    } else if (winnerValue == uint8(QuietSignalTypes.Outcome.NO)) {
      winner = QuietSignalTypes.Outcome.NO;
      winningAggregate = _epoch.publicNo;
    } else {
      revert IQuietSignalErrors.InvalidFeedRound();
    }
    if (winningAggregate == 0) revert IQuietSignalErrors.ZeroWinningPool(winner);
    _epoch.winner = winner;
    _epoch.settledRoundId = roundId;
    _epoch.settledAnswer = answer;
    _epoch.state = QuietSignalTypes.EpochState.SETTLED;
    emit SettlementFinalized(
      epochId,
      winnerValue,
      _epoch.publicYes + _epoch.publicNo,
      winningAggregate,
      roundId,
      answer
    );
  }

  /// @notice Makes an unresolved post-aggregate epoch refundable after immutable grace.
  function cancelAfterResolutionGrace() external {
    _requireState(QuietSignalTypes.EpochState.RESOLUTION_PENDING);
    uint64 eligibleAt = _epoch.resolutionPendingAt + resolutionGrace;
    if (block.timestamp < eligibleAt) {
      revert IQuietSignalErrors.ResolutionGraceNotElapsed(eligibleAt, uint64(block.timestamp));
    }
    _epoch.state = QuietSignalTypes.EpochState.REFUNDABLE;
  }

  /// @notice Derives the caller's owner-viewable Brier score after immutable settlement.
  function materializeScore() external {
    _requireState(QuietSignalTypes.EpochState.SETTLED);
    QuietSignalTypes.OwnerPosition storage position = _positionForTerminalAction(msg.sender);
    euint256 outcomeBps = Nox.toEuint256(
      _epoch.winner == QuietSignalTypes.Outcome.YES ? BPS_SCALE : 0
    );
    ebool outcomeAtOrBelowForecast = Nox.le(outcomeBps, position.probabilityBps);
    euint256 positiveDifference = Nox.sub(position.probabilityBps, outcomeBps);
    euint256 negativeDifference = Nox.sub(outcomeBps, position.probabilityBps);
    euint256 absoluteError = Nox.select(
      outcomeAtOrBelowForecast,
      positiveDifference,
      negativeDifference
    );
    euint256 score = Nox.sub(
      Nox.toEuint256(BPS_SCALE),
      Nox.div(Nox.mul(absoluteError, absoluteError), Nox.toEuint256(BPS_SCALE))
    );
    position.scoreBps = score;
    Nox.allowThis(score);
    Nox.addViewer(score, msg.sender);
    emit ScoreMaterialized(epochId, msg.sender);
  }

  /// @notice Pays the caller's encrypted pro-rata winning allocation once.
  function claim() external {
    _requireState(QuietSignalTypes.EpochState.SETTLED);
    QuietSignalTypes.OwnerPosition storage position = _positionForTerminalAction(msg.sender);
    if (position.claimed) revert IQuietSignalErrors.AlreadyClaimed(msg.sender);
    if (position.refunded) revert IQuietSignalErrors.TerminalActionConflict(msg.sender);
    uint256 winningAggregate =
      _epoch.winner == QuietSignalTypes.Outcome.YES ? _epoch.publicYes : _epoch.publicNo;
    euint256 winningAllocation =
      _epoch.winner == QuietSignalTypes.Outcome.YES
        ? position.yesAllocation
        : position.noAllocation;
    euint256 payout = Nox.div(
      Nox.mul(winningAllocation, Nox.toEuint256(_epoch.publicYes + _epoch.publicNo)),
      Nox.toEuint256(winningAggregate)
    );
    position.claimed = true;
    Nox.allowTransient(payout, address(confidentialCollateral));
    confidentialCollateral.confidentialTransfer(msg.sender, payout);
    emit PayoutClaimed(epochId, msg.sender, keccak256(abi.encode(epochId, msg.sender)));
  }

  /// @notice Returns the caller's original encrypted stake once when the epoch is refundable.
  function refund() external {
    _requireState(QuietSignalTypes.EpochState.REFUNDABLE);
    QuietSignalTypes.OwnerPosition storage position = _positionForTerminalAction(msg.sender);
    if (position.refunded) revert IQuietSignalErrors.AlreadyRefunded(msg.sender);
    if (position.claimed) revert IQuietSignalErrors.TerminalActionConflict(msg.sender);
    position.refunded = true;
    Nox.allowTransient(position.stake, address(confidentialCollateral));
    confidentialCollateral.confidentialTransfer(msg.sender, position.stake);
    emit Refunded(epochId, msg.sender, keccak256(abi.encode(epochId, msg.sender)));
  }

  function _deriveAllocation(
    euint256 stake,
    euint256 probabilityBps,
    euint256 scale
  ) private returns (euint256 yesAllocation, euint256 noAllocation) {
    // Splitting stake into quotient and remainder prevents stake * probability overflow.
    euint256 quotient = Nox.div(stake, scale);
    euint256 remainder = Nox.sub(stake, Nox.mul(quotient, scale));
    yesAllocation = Nox.add(
      Nox.mul(quotient, probabilityBps),
      Nox.div(Nox.mul(remainder, probabilityBps), scale)
    );
    noAllocation = Nox.sub(stake, yesAllocation);
  }

  function _positionForTerminalAction(
    address owner
  ) private view returns (QuietSignalTypes.OwnerPosition storage position) {
    position = _positions[owner];
    if (!position.committed) revert IQuietSignalErrors.NotCommitted(owner);
  }

  function _initializeAggregates() private {
    if (_aggregatesInitialized) return;
    _aggregateYes = Nox.toEuint256(0);
    _aggregateNo = Nox.toEuint256(0);
    _aggregateTotal = Nox.toEuint256(0);
    Nox.allowThis(_aggregateYes);
    Nox.allowThis(_aggregateNo);
    Nox.allowThis(_aggregateTotal);
    _aggregatesInitialized = true;
  }

  function _aggregateRequestId() private view returns (bytes32) {
    return
      keccak256(
        abi.encode(
          block.chainid,
          address(this),
          epochId,
          euint256.unwrap(_aggregateYes),
          euint256.unwrap(_aggregateNo)
        )
      );
  }

  function _requirePendingCallback() private view {
    _requireState(QuietSignalTypes.EpochState.COMMIT_PENDING);
    if (_pending.owner == address(0) || !_pending.callbackReceived) {
      revert IQuietSignalErrors.PendingCommitMissing();
    }
  }

  function _clearPending() private {
    address owner = _pending.owner;
    bool callbackReceived = _pending.callbackReceived;
    delete _pending;
    _epoch.state = QuietSignalTypes.EpochState.OPEN;
    emit SignalIntentCleared(epochId, owner, callbackReceived);
  }

  function _requireState(QuietSignalTypes.EpochState expected) private view {
    if (_epoch.state != expected) {
      revert IQuietSignalErrors.InvalidState(expected, _epoch.state);
    }
  }
}
