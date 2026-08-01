# Passed evidence ledger

This ledger lists only gates with completed, sanitized evidence. It never contains
confidential plaintext, raw handles, proofs, private RPC credentials, wallet
signatures, keys, seed phrases, environment dumps, or unsanitized terminal history.

| Gate | Status   | Environment                    | Primary evidence                                                                                                           | Verified outcome                                                                                                                   |
| ---- | -------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| G0   | `passed` | Offline and Sepolia read       | `evidence/offline/G0/FND-01.json`, `evidence/reports/G0-summary.md`                                                        | Reproducible toolchain, compile, formatting, scans, budget validation, and Sepolia/Nox preflight                                   |
| G1   | `passed` | Offline and Sepolia write/read | `evidence/{offline,sepolia}/G1/FND-02.json`, `evidence/{offline,sepolia}/G1/FND-03.json`, `evidence/reports/G1-summary.md` | Confidential arithmetic, context binding, ACL persistence, owner-only viewing, and unauthorized-access rejection                   |
| G2   | `passed` | Sepolia write/read             | `evidence/{offline,sepolia}/G2/FND-04.json`, `evidence/reports/G2-summary.md`                                              | Confidential asset pull, callback binding, atomic mismatch refund, unwrap, rewrap, recovery, and replay rejection                  |
| G3   | `passed` | Sepolia write/read             | `evidence/{offline,sepolia}/G3/FND-05.json`, named below-k/timeout/recovery artifacts, `evidence/reports/G3-summary.md`    | Cohort-gated aggregate disclosure, proof binding, timeout recovery, terminal refunds, and custody conservation                     |
| G4   | `passed` | Sepolia write/read             | `evidence/{offline,sepolia}/G4/FND-06-RESOLUTION.json`, `evidence/reports/G4-resolution-feasibility.md`                    | Immutable Chainlink ETH/USD resolution, runtime/ABI binding, freshness checks, deterministic threshold outcomes, and zero custody  |
| G5   | `passed` | Offline and Sepolia write/read | `evidence/{offline,sepolia}/G5/G5-PROTOCOL.json` and its named PK-03A through PK-08 components                             | Complete protocol state, custody, ACL, recovery, settlement, score, payout, adversarial, and mutation-safe verifier coverage       |
| G6   | `passed` | Aggregated Sepolia evidence    | `evidence/sepolia/G6/G6-PROTOCOL.json` and its sixteen named components                                                    | Canonical deployment, typed SDK, public verifier, automation, read-model rebuild, two-owner success, below-k, and timeout recovery |

The public addresses, transaction references, chain blocks, source commits, and
component checks remain in the named artifacts. G6 is the final protocol evidence
gate for the submitted scope; browser product checks and the deployed application
are documented separately in the P3 work package.
