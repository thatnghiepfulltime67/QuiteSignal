// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

/// @notice Narrow live diagnostic for a permissionless aggregate-finalization call.
/// @dev It deliberately records only a fixed error class. Proof bytes and encrypted
/// handles are neither emitted nor stored.
interface IAggregateFinalizationTarget {
  function finalizeAggregate(
    bytes32 suppliedRequestId,
    uint256 declaredYes,
    uint256 declaredNo,
    bytes calldata yesProof,
    bytes calldata noProof
  ) external;
}

contract AggregateFinalizationProbe {
  enum Result {
    Succeeded,
    InvalidLifecycleState,
    AggregateNotFinalized,
    InvalidAggregateProofContext,
    PublicDecryptMismatch,
    MissingTransientAccess,
    WrapperUnauthorizedAmount,
    NoxNotAllowed,
    NoxUnauthorizedSender,
    InvalidProof,
    MalformedDecryptedData,
    UnknownFailure
  }

  event FinalizationProbed(address indexed target, Result result);

  Result public lastResult;

  function probe(
    IAggregateFinalizationTarget target,
    bytes32 suppliedRequestId,
    uint256 declaredYes,
    uint256 declaredNo,
    bytes calldata yesProof,
    bytes calldata noProof
  ) external returns (Result result) {
    try target.finalizeAggregate(suppliedRequestId, declaredYes, declaredNo, yesProof, noProof) {
      result = Result.Succeeded;
    } catch (bytes memory reason) {
      result = _classify(reason);
    }

    lastResult = result;
    emit FinalizationProbed(address(target), result);
  }

  function _classify(bytes memory reason) private pure returns (Result) {
    if (reason.length < 4) return Result.UnknownFailure;

    bytes4 selector;
    assembly ('memory-safe') {
      selector := mload(add(reason, 0x20))
    }

    if (selector == bytes4(keccak256('InvalidLifecycleState(uint8,uint8)'))) {
      return Result.InvalidLifecycleState;
    }
    if (selector == bytes4(keccak256('AggregateNotFinalized()'))) {
      return Result.AggregateNotFinalized;
    }
    if (selector == bytes4(keccak256('InvalidAggregateProofContext(bytes32,bytes32)'))) {
      return Result.InvalidAggregateProofContext;
    }
    if (selector == bytes4(keccak256('PublicDecryptMismatch(uint256,uint256)'))) {
      return Result.PublicDecryptMismatch;
    }
    if (selector == bytes4(keccak256('MissingTransientAccess()'))) {
      return Result.MissingTransientAccess;
    }
    if (selector == bytes4(keccak256('ERC7984UnauthorizedUseOfEncryptedAmount(bytes32,address)'))) {
      return Result.WrapperUnauthorizedAmount;
    }
    if (selector == bytes4(keccak256('NotAllowed(bytes32,address)'))) {
      return Result.NoxNotAllowed;
    }
    if (selector == bytes4(keccak256('UnauthorizedSender(address)'))) {
      return Result.NoxUnauthorizedSender;
    }
    if (selector == bytes4(keccak256('InvalidProof(bytes,string)'))) {
      return Result.InvalidProof;
    }
    if (selector == bytes4(keccak256('MalformedDecryptedData(bytes)'))) {
      return Result.MalformedDecryptedData;
    }
    return Result.UnknownFailure;
  }
}
