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

The evidence ledger under `docs/plans/evidence-ledger.md` maps the passed G0–G6
gates to sanitized artifacts. Product behavior is covered separately by automated
web checks, the production build, and the deployed application. The canonical
archive read and dependency advisory are closed, and the clean-clone reproduction
passes.
