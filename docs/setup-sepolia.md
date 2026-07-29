# Sepolia environment and wallet safety

All contract, Nox, ACL, asset, integration, lifecycle, recovery, and browser tests
run on Ethereum Sepolia. Offline tests remain limited to pure domain/reference-model,
formatting, typechecking, static analysis, and deterministic data validation.

## Local environment file

The repository includes `.env.example` and an ignored local `.env`. Add values only
to `.env`:

```text
SEPOLIA_RPC_URL=<your Sepolia RPC URL>
SEPOLIA_PRIVATE_KEY=<0x-prefixed test-only private key>
CONFIRM_SEPOLIA_WRITE=yes
```

Use a dedicated Sepolia-only key. Never reuse a mainnet, production, exchange,
hardware-wallet, or personally valuable identity key. Do not paste the key into
chat, shell history, screenshots, logs, evidence, source files, or npm scripts.

## Multi-wallet test actors

The k-gate requires distinct addresses. The future Sepolia test runner supports one
of two safe strategies:

1. Set a test-only `SEPOLIA_ACTOR_MNEMONIC` in `.env` and derive the configured actor count.
2. Leave it empty and let the runner generate actor wallets under ignored `.secrets/`.

The deployer funds actors with at most `SEPOLIA_ACTOR_FUNDING_ETH` each. Actor private
material never enters committed evidence. Public actor addresses and transaction
hashes may be recorded only when they do not reveal confidential input.

## Budget contract

The maximum cumulative write budget is `SEPOLIA_MAX_TOTAL_SPEND_ETH=0.5`. This is a
hard ceiling, not a target. Write tooling must:

- assert chain id `11155111`;
- require `CONFIRM_SEPOLIA_WRITE=yes`;
- produce a read-only dry-run plan first;
- estimate gas/cost and show remaining phase/total budget;
- refuse a single transaction above `SEPOLIA_MAX_SINGLE_TX_ETH`;
- preserve `SEPOLIA_MIN_RESERVE_ETH`;
- record actual gas spend in the sanitized spend ledger;
- refuse writes when ledger plus estimate would exceed the total cap.

## Planned allocation

| Phase | Maximum ETH | Purpose |
|---|---:|---|
| P0 / G1–G4 | 0.08 | Feasibility arithmetic, ACL, asset, proof/recovery, adapter spikes |
| P1 / G5 | 0.14 | Protocol deployments, invariants, adversarial and recovery cases |
| P2 / G6 | 0.12 | Canonical deployment and multi-wallet live lifecycle |
| P3 / G7 | 0.05 | Real browser success and refund/recovery journeys |
| P4 / G8 | 0.06 | Clean reproduction, verification, final read/write regressions |
| Contingency | 0.05 | Explicitly approved retries or redeployment |
| **Total ceiling** | **0.50** | Never exceed |

Unused phase budget rolls into contingency only; it does not automatically expand a
later phase. Any reallocation updates the plan and is committed before the spend.

## Preflight checks

Before the first write, tooling must verify:

- required variables exist without printing their values;
- the private key derives a funded address and the RPC reports Sepolia;
- deployer balance is sufficient but not used as the budget source of truth;
- configured actor count meets the current `kMin` scenario;
- the spend ledger is valid and matches the active source commit;
- no uncommitted contract/config change exists.

## Rotation and incident response

If a key or mnemonic appears in source, Git history, logs, screenshots, evidence, or
chat, stop all writes, consider it compromised, replace it, and move remaining
Sepolia ETH to a new test-only wallet. Deleting the exposed text is not sufficient.
