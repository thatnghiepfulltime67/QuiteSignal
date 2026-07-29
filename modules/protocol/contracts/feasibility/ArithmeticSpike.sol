// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {externalEuint256, ebool, euint256} from 'encrypted-types/EncryptedTypes.sol';
import {Nox} from '@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol';

/// @notice Isolated P0 arithmetic feasibility harness. It has no asset custody or production imports.
contract ArithmeticSpike {
  using Nox for ebool;
  using Nox for euint256;

  uint256 internal constant BPS_SCALE = 10_000;

  error DuplicateVector(uint256 vectorId);
  error EmptyBatch();
  error UninitializedExternalHandle();
  error UnknownVector(uint256 vectorId);

  struct VectorInput {
    uint256 vectorId;
    externalEuint256 stake;
    bytes stakeProof;
    externalEuint256 probabilityBps;
    bytes probabilityProof;
    externalEuint256 outcomeBps;
    bytes outcomeProof;
    externalEuint256 expectedYes;
    bytes expectedYesProof;
    externalEuint256 expectedNo;
    bytes expectedNoProof;
    externalEuint256 expectedScore;
    bytes expectedScoreProof;
  }

  struct ResultHandles {
    ebool yesMatches;
    ebool noMatches;
    ebool scoreMatches;
  }

  mapping(uint256 vectorId => ResultHandles result) private results;
  mapping(uint256 vectorId => bool exists) private hasResult;
  ResultHandles private safetyResults;
  bool private hasSafetyResult;

  function evaluateBatch(VectorInput[] calldata inputs) external {
    if (inputs.length == 0) revert EmptyBatch();

    for (uint256 index; index < inputs.length; ++index) {
      _evaluate(inputs[index]);
    }

    _evaluateSafetyGuards();
  }

  function resultHandles(
    uint256 vectorId
  ) external view returns (bytes32 yesMatches, bytes32 noMatches, bytes32 scoreMatches) {
    if (!hasResult[vectorId]) revert UnknownVector(vectorId);
    ResultHandles storage result = results[vectorId];
    return (
      ebool.unwrap(result.yesMatches),
      ebool.unwrap(result.noMatches),
      ebool.unwrap(result.scoreMatches)
    );
  }

  function safetyHandles()
    external
    view
    returns (bytes32 multiplicationSafe, bytes32 subtractionSafe, bytes32 divisionSafe)
  {
    if (!hasSafetyResult) revert UnknownVector(type(uint256).max);
    return (
      ebool.unwrap(safetyResults.yesMatches),
      ebool.unwrap(safetyResults.noMatches),
      ebool.unwrap(safetyResults.scoreMatches)
    );
  }

  function _evaluate(VectorInput calldata input) private {
    if (hasResult[input.vectorId]) revert DuplicateVector(input.vectorId);
    if (
      externalEuint256.unwrap(input.stake) == bytes32(0) ||
      externalEuint256.unwrap(input.probabilityBps) == bytes32(0) ||
      externalEuint256.unwrap(input.outcomeBps) == bytes32(0) ||
      externalEuint256.unwrap(input.expectedYes) == bytes32(0) ||
      externalEuint256.unwrap(input.expectedNo) == bytes32(0) ||
      externalEuint256.unwrap(input.expectedScore) == bytes32(0)
    ) {
      revert UninitializedExternalHandle();
    }

    euint256 stake = Nox.fromExternal(input.stake, input.stakeProof);
    euint256 probability = Nox.fromExternal(input.probabilityBps, input.probabilityProof);
    euint256 outcome = Nox.fromExternal(input.outcomeBps, input.outcomeProof);
    euint256 expectedYes = Nox.fromExternal(input.expectedYes, input.expectedYesProof);
    euint256 expectedNo = Nox.fromExternal(input.expectedNo, input.expectedNoProof);
    euint256 expectedScore = Nox.fromExternal(input.expectedScore, input.expectedScoreProof);

    euint256 scale = Nox.toEuint256(BPS_SCALE);
    ebool isProbabilityInRange = Nox.le(probability, scale);
    euint256 clampedProbability = Nox.select(isProbabilityInRange, probability, scale);
    euint256 yesAllocation = Nox.div(Nox.mul(stake, clampedProbability), scale);
    euint256 noAllocation = Nox.sub(stake, yesAllocation);

    ebool outcomeIsNotGreater = Nox.le(outcome, clampedProbability);
    euint256 positiveDifference = Nox.sub(clampedProbability, outcome);
    euint256 negativeDifference = Nox.sub(outcome, clampedProbability);
    euint256 absoluteError = Nox.select(
      outcomeIsNotGreater,
      positiveDifference,
      negativeDifference
    );
    euint256 squaredError = Nox.mul(absoluteError, absoluteError);
    euint256 brierLoss = Nox.div(squaredError, scale);
    euint256 score = Nox.sub(scale, brierLoss);

    ResultHandles storage result = results[input.vectorId];
    result.yesMatches = Nox.eq(yesAllocation, expectedYes);
    result.noMatches = Nox.eq(noAllocation, expectedNo);
    result.scoreMatches = Nox.eq(score, expectedScore);
    hasResult[input.vectorId] = true;

    Nox.allowPublicDecryption(result.yesMatches);
    Nox.allowPublicDecryption(result.noMatches);
    Nox.allowPublicDecryption(result.scoreMatches);
  }

  function _evaluateSafetyGuards() private {
    euint256 zero = Nox.toEuint256(0);
    euint256 one = Nox.toEuint256(1);
    euint256 scale = Nox.toEuint256(BPS_SCALE);
    euint256 maximum = Nox.toEuint256(type(uint256).max);
    (ebool multiplicationSafe, ) = Nox.safeMul(maximum, scale);
    (ebool subtractionSafe, ) = Nox.safeSub(zero, one);
    (ebool divisionSafe, ) = Nox.safeDiv(one, zero);

    safetyResults = ResultHandles({
      yesMatches: multiplicationSafe,
      noMatches: subtractionSafe,
      scoreMatches: divisionSafe
    });
    hasSafetyResult = true;

    Nox.allowPublicDecryption(multiplicationSafe);
    Nox.allowPublicDecryption(subtractionSafe);
    Nox.allowPublicDecryption(divisionSafe);
  }
}
