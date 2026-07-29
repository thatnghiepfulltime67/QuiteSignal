# Risk register

| ID | Risk | Likelihood | Impact | Mitigation / gate | Owner |
|---|---|---:|---:|---|---|
| R-01 | Nox package or address changes | Medium | High | Pin version; verify network mapping before every deploy | Protocol |
| R-02 | Sepolia Nox/SDK/contract versions or ACL semantics diverge | Medium | Critical | Pin versions and prove every load-bearing ACL path directly on Sepolia | Protocol |
| R-03 | Public zero or malformed handle leaks side | Medium | Critical | Both sides externally encrypted; fixed shape; static rule | SDK |
| R-04 | Tiny cohort permits inference | Medium | High | k-gate blocks aggregate reveal; honest UI wording | Product |
| R-05 | Keeper stalls async lifecycle | Medium | High | Permissionless pokes, monitoring, timeout refund | Operations |
| R-06 | Oracle stalls or resolves incorrectly | Medium | High | Explicit trust display; refund before execution; future oracle adapter | Protocol |
| R-07 | Public-market price moves during the epoch | High | Medium | Slippage bounds, short windows, atomic batch | Market |
| R-08 | Integer rounding overpays | Low | Critical | Floor division, payout invariant, property tests | Protocol |
| R-09 | Frontend logs confidential input | Medium | Critical | Redaction policy, no analytics on forms, e2e log scan | Web |
| R-10 | Primary application path depends on mock data | Medium | High | Sepolia e2e gate and transaction manifest | Web |
| R-11 | Scope exceeds hackathon capacity | High | High | Binary-market MVP; stretch scope isolated | Product |
| R-12 | Claim overstates anonymity | Medium | High | Approved claims language from threat model | Communications |
| R-13 | Sybil commits make k misleading | Medium | High | One commit/address; explicitly state that k is not Sybil resistance | Product |
| R-14 | Unwrap proof never becomes available | Low | Critical | Phase 0 live liveness test; stop-ship if no bounded operational recovery | Protocol |
| R-15 | Encrypted score arithmetic is unsupported or unsafe | Medium | Medium | Sepolia arithmetic spike; private score remains gated | Protocol |

## Stop-ship conditions

- Any plaintext signal appears in calldata, events, logs, screenshots, or analytics.
- Aggregate handles can be decrypted below k.
- A keeper can spend more collateral than a proven aggregate.
- Claims or refunds can exceed the pot.
- The Sepolia flow cannot be reproduced from a clean environment.
- Any terminal or recovery state has no documented funds location.
