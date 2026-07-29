# P3 — Web and read model

## Prerequisite

P2 has a stable SDK, manifest, and live Sepolia environment.

## Tasks

- [ ] Implement market and privacy-boundary onboarding.
- [ ] Implement encrypted probability/stake form with decimal-safe validation.
- [ ] Implement wallet approval, commit, replacement, retry, and failure states.
- [ ] Implement public epoch timeline from rebuildable chain-derived data.
- [ ] Implement owner-only position, score materialization, payout, and refund views.
- [ ] Implement read-only verification view linked to public evidence.
- [ ] Add keyboard, screen-reader, mobile, loading, empty, and error-state coverage.
- [ ] Add log scanning and tests that reject mock state on the primary application path.

## Verification

- Strict typecheck, lint, component tests, accessibility checks, and browser e2e.
- Primary e2e runs against the live Sepolia manifest.
- Refreshing or rebuilding the indexer does not change source-of-truth behavior.

## Exit criteria

An unfamiliar user can complete the real flow from the README without a privileged
backend, fixture switch, or unexplained privacy claim.
