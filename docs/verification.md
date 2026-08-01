# Verification

## Offline checks

These checks do not provide contract or privacy evidence:

```sh
npm run format:check
npm run typecheck
npm run test:verifier
npm run test:sdk
npm run test:automation
npm run test:indexer
npm run test:web
npm run scan:secrets
```

`npm run compile` additionally builds the Hardhat artifacts. It must run under the
exact Node/npm versions in `.nvmrc`; a local runtime mismatch is a failed release
check, not evidence to be ignored.

## Sepolia read checks

```sh
npm run check:sepolia:read
npm run verify:evidence
npm run verify:protocol:sepolia -- --manifest=deployments/sepolia/quiet-signal.json
```

The verifiers independently read chain id, runtime bytecode, immutable bindings,
public epoch state, receipts, and spend-ledger entries. They never accept copied
manifest values as proof.

## Named evidence

The evidence ledger under `docs/plans/evidence-ledger.md` maps G0–G7 to sanitized
artifacts. G7 currently has a scoped `user_confirmed` attestation for the production
primary journey with two real Sepolia wallets; it is not an independent recovery,
ACL, or accessibility report. G8 remains blocked until clean reproduction, live
read checks, evidence validation, risk closure, and a clean committed worktree all
pass.
