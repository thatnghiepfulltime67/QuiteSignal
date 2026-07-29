# System architecture

## Design goals

1. Privacy-critical logic lives in contracts and Nox, not in a blindly trusted backend.
2. The public market is an adapter dependency; its bytecode is not forked or modified.
3. The asynchronous gateway/proof lifecycle is explicit and retryable.
4. SDK, contracts, relayer, indexer, and UI have one-way dependency direction.

## Context diagram

```mermaid
flowchart LR
  U[User wallet + browser] -->|encryptInput| G[Nox gateway / TEE]
  U -->|handles + proofs| C[QuietSignalPool]
  K[Permissionless keeper] --> C
  G -->|decryption proofs| K
  C --> A[MarketAdapter]
  A --> M[Open conditional market]
  O[Oracle / resolver] --> M
  C --> I[Indexer / read model]
  I --> W[Web application]
  U --> W
```

## Module boundaries

| Module | Owns | Must not own |
|---|---|---|
| `contracts/core` | Epoch state, encrypted ledgers, ACL, settlement bounds | UI formatting, gateway calls |
| `contracts/adapters` | Narrow interface to public market | Private input decryption |
| `modules/confidential-client` | Encryption, proof packing, ACL-safe helpers | Wallet custody, business policy |
| `modules/domain` | Pure state machine, schemas, error taxonomy | RPC side effects |
| `services/automation` | Permissionless lifecycle pokes, proof queue | Plaintext user signal, user key |
| `services/indexer` | Public events and chain-derived read model | Confidential-handle decryption |
| `apps/web` | UX, wallet, client encryption, owner decryption | Trusted settlement decisions |
| `modules/verifier` | Independent chain-data recomputation | Privileged contract calls |

## On-chain lifecycle

```mermaid
stateDiagram-v2
  [*] --> OPEN
  OPEN --> CLOSED: deadline / close
  CLOSED --> REFUNDABLE: count < k
  CLOSED --> AGGREGATE_PENDING: count >= k
  AGGREGATE_PENDING --> UNWRAP_PENDING: aggregate proof accepted
  UNWRAP_PENDING --> EXECUTED: unwrap proof + adapter batch
  UNWRAP_PENDING --> REFUNDABLE: recovery finalize + rewrap
  EXECUTED --> SETTLED: oracle result available
  REFUNDABLE --> REFUNDED
  SETTLED --> SETTLED: each owner claims once
```

## Trust boundaries

- Browser ↔ Nox boundary: plaintext originates in the browser and may be processed
  only inside the attested confidential-compute boundary; it never enters an
  application-controlled backend or the public chain.
- Browser ↔ wallet: the wallet authorizes funds and transactions; the app stores no keys.
- Keeper ↔ contract: the keeper is replaceable; proof checks bound all amounts.
- Oracle ↔ market: outcome resolution is an explicit external trust assumption.

## Availability model

Lifecycle calls are permissionless where safe. A relayer accelerates but is not a
custodian. The indexer can be rebuilt from events and is not the source of truth.
Once market execution occurs, the original collateral cannot be refunded; resolution
liveness becomes an explicit oracle/market dependency.
