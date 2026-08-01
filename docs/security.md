# Security and privacy

## Trust boundary

Nox performs computation over encrypted values. Contracts enforce ACL, custody,
state transitions, proof context, and conservation. The browser wallet signs user
transactions. Relayers and indexers may improve liveness and reads but do not hold
confidential plaintext or authority to spend pool assets.

## Claims we make

- Confidential owner position, amount, and score under the documented ACL path.
- Aggregate-only public disclosure after the k threshold.
- Permissionless terminal recovery paths with documented funds locations.
- Unchanged public resolution target; the adapter receives no pool assets.

## Explicit limitations

Public membership, timing, wallet identity, transaction metadata, pool configuration,
and aggregate results remain visible. The threshold is not Sybil resistance. Nox
gateway/TEE availability and its operational trust assumptions remain relevant.
Oracle data and resolution liveness are bounded by the immutable feed condition and
grace/refund path. Post-execution recovery cannot restore data that a wallet has
lost; owners must retain wallet access and use the documented network.

## Handling rules

Do not log, persist, screenshot, or send confidential form values, encrypted handles,
proofs, signatures, private keys, seed phrases, or RPC credentials. Report a security
issue privately to the repository owner; do not open a public issue containing
secrets or user data.
