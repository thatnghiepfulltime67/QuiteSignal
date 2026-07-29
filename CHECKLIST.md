# Architecture readiness checklist

## Traceability

- [ ] Every functional requirement maps to a state transition and acceptance test.
- [ ] Every privacy claim maps to P1–P7 and protocol invariant I1–I10.
- [ ] Every external dependency appears in the trust model and risk register.

## Protocol safety

- [ ] Funds location is known in every state.
- [ ] State transitions and per-owner terminal flags are monotonic.
- [ ] Aggregate, unwrap, payout, and refund proofs are context-bound and single-use.
- [ ] No owner-shaped handle is publicly decrypted.
- [ ] Adapter execution is bounded by observed collateral balance deltas.
- [ ] Recovery after unwrap is proven on the official local stack and Sepolia.

## Delivery

- [ ] The primary frontend path uses no mock data.
- [ ] A clean-environment Sepolia e2e is reproducible.
- [ ] Contracts, target code hashes, ABIs, and transaction evidence are in the deployment manifest.
- [ ] Feedback report, license, disclosure, and release artifacts are complete.
