# API, SDK, and event contract

## SDK surface

```ts
interface QuietSignalClient {
  encryptSignal(input: SignalInput, pool: Address): Promise<EncryptedSignal>;
  commitSignal(signal: EncryptedSignal): Promise<TxResult>;
  getPublicEpoch(): Promise<PublicEpochView>;
  decryptOwnPosition(): Promise<PrivatePositionView>;
  materializeScore(): Promise<TxResult>;
  claim(): Promise<TxResult>;
}
```

The client instance is bound to one `(chainId, pool)` pair. `SignalInput` never
crosses the relayer boundary. `EncryptedSignal` contains opaque handles, gateway
proofs, the pool domain separator, and a client nonce.

## Events

Events may contain only public addresses, ids, states, aggregate totals, and public
feed facts; they never contain plaintext signals, encrypted handles, proofs, or
decrypted owner positions.

```text
PoolCreated(poolId, pool, configHash, confidentialCollateral, resolutionAdapter, deadline, kMin)
EpochOpened(epochId, pool, deadline, kMin)
SignalCommitted(epochId, sender, commitmentId)
EpochClosed(epochId, participantCount)
AggregateDecryptRequested(epochId, requestId)
AggregateFinalized(epochId, requestId, publicYes, publicNo)
SettlementFinalized(epochId, winner, aggregateCollateral, winningAggregate, roundId, answer)
ScoreMaterialized(epochId, owner)
PayoutClaimed(epochId, owner, claimId)
Refunded(epochId, owner, refundId)
```

The stable ABI deliberately excludes encrypted handles, proofs, stake,
probability, payout, refund, and score values from every event. `commitSignal`
accepts `(externalEncryptedStake, stakeProof, externalEncryptedProbability,
probabilityProof)` only; all four values are opaque Nox/proof data, never plaintext
amounts. `finalizeAggregate` accepts only its request id and bound proof. `settle`
has no result parameter and reads the immutable adapter condition itself.

## Read API

The indexer exposes only chain-derived public views: condition metadata, epoch state,
participant count, aggregate totals after reveal, resolution metadata, and tx links.
Owner-specific values are fetched from the contract and decrypted in-browser.

## Idempotency

Every mutation has a client request id. The SDK maps replacement transactions and
retries to one logical operation. Proof submissions reject context mismatch before
spending gas where possible.

## SDK type rules

- `SignalInput` contains decimal strings, never JavaScript `number` values.
- Probability is normalized to integer basis points before encryption.
- Chain id, pool address, epoch id, and client nonce are mandatory domain fields.
- Opaque handles and proofs use branded types and cannot be passed as plain `Hex`.
- Public and private views are separate types; a public API cannot return a private field.
