# Competition fit and scoring strategy

The active product criteria are creativity, accessible end-to-end execution without
mock data, Sepolia deployment, Nox feedback, technical implementation/Nox usage,
and UX. Submission-media work is intentionally deferred until release readiness.

| Criterion | Strategy | Required evidence |
|---|---|---|
| Creativity | Private probability plus private Brier score on an open market; aggregate remains composable | Product brief and live product evidence |
| End-to-end | Wallet, gateway, contracts, adapter, and settlement use real data | Sepolia transaction set; no mock branch in the recording |
| Sepolia | Chain ID fixed to `11155111`; source-verified contracts | Deployment manifest and explorer links |
| Nox feedback | Findings include version, reproduction, impact, and workaround | `docs/operations/nox-feedback.md` |
| Technical | Encryption, ACL, aggregate decrypt, proof-gated unwrap, adapter boundary | Protocol invariants and tests |
| UX | A first-time user understands the privacy boundary in 30 seconds | Privacy legend, progress states, accessibility checks |

## Decisions that maximize score

- One real integration with a narrow scope is better than several shallow mocks.
- Say “confidential position and amount”, never “anonymous” or “untraceable”.
- Attach every product claim to an event, transaction, or verifier command.
- Provide a read-only explorer route while keeping the primary flow real.
- Publish limitations and Nox findings honestly; trust is part of the product.
