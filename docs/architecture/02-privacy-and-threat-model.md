# Privacy, threat model, and data classification

## Data classification

| Data | Visibility | Reason |
|---|---|---|
| Market question, deadlines, adapter address | Public | Discovery and composability |
| Commit sender, tx hash, gas, timing | Public | Inherent chain metadata |
| Stake, probability, salt | Confidential | Core user signal |
| Per-user ledger and score receipt | Owner viewer only | Private position/reputation |
| Epoch aggregate | Public after k-gate | Market needs a usable signal |
| Oracle result, pot, payout rate | Public | Settlement auditability |
| Nox handle/proof | Public opaque bytes | Safe only as ciphertext metadata |

## Threats and mitigations

| Threat | Mitigation | Residual risk |
|---|---|---|
| Calldata reveals forecast/size | Encrypted stake and probability with fixed call shape | Values may be inferred from timing/correlation |
| Contract reveals user handle | Static grep plus invariant test forbids public decrypt on user handles | A future module could violate policy; CI gate is required |
| Malicious keeper inflates batch | Proof-gated unwrap and `aggregate == released` check | Gateway/TEE attestation remains a trust input |
| Tiny cohort deanonymizes | On-chain `kMin`; no aggregate decrypt below threshold | Membership and timing remain public |
| Sybil addresses control the cohort | One commit per address and explicit non-Sybil claim boundary | `kMin` is not Sybil resistance |
| Replay of external handle | Pool binding, nonce/salt, consumed request id, domain separator | Gateway API semantics can change; versions are pinned |
| Relayer logs plaintext | Relayer accepts opaque payloads only; logging redacts bytes | Host compromise can reveal metadata |
| Oracle stalls | Refund timeout before execution; explicit pending state after execution | Executed funds remain pending until the market resolves |
| User loses wallet | Owner-only decrypt is intentionally non-recoverable | Social recovery is future scope |

## Privacy invariants

P1. No plaintext confidential input appears in calldata, events, storage, logs, or analytics.

P2. Every public aggregate equals accepted encrypted inputs for that epoch, proven by verifier plus gateway proof.

P3. Only aggregate handles and protocol-required burn handles may be publicly decrypted.

P4. Adapter spend equals the amount proven released by the confidential pool.

P5. Claims and refunds never exceed the confidential pot.

P6. Owner decrypt capability is never implicitly granted to a keeper, indexer, or UI server.

P7. A score receipt is derived only from the owner-scoped forecast handle and the
public outcome; publishing aggregate market data does not publish personal score.

## Honest claims language

Use “confidential position and amount” in UI and public communication. Do not use “anonymous” or
“untraceable”: sender membership, transaction timing, market identity, and gas
metadata are public.
