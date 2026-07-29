# Verification command and test matrix

Commands below are the required root-script contract. A command becomes mandatory
as soon as its owning package exists. G0 records exact tools and final script names;
renaming requires synchronized updates here and in CI.

## Environment classes

| Class | Network access | Chain writes | Secrets | Purpose |
|---|---:|---:|---:|---|
| `offline` | No | No | None | Pure domain, formatting, static checks |
| `local-nox` | Local containers only | Local only | Generated ephemeral | ACL, compute, contract integration |
| `sepolia-read` | RPC | No | Public RPC optional | Code hash, manifest, evidence, public verifier |
| `sepolia-write` | RPC + Nox | Yes | Ignored throwaway wallet config | G1–G6 live gates only |
| `web-live` | RPC + deployed app | User-approved only | Wallet-held | G7 release journey |

No default command may write to Sepolia. Write commands must assert chain id `11155111`,
require `CONFIRM_SEPOLIA_WRITE=yes`, print a dry-run plan first, and reject broad or
production-key configuration.

## Root command contract

| Command | Environment | Purpose | Required by |
|---|---|---|---|
| `npm ci` | network install | Reproducible dependencies | G0–G8 |
| `npm run doctor` | offline | Versions, Docker/plugin, public config, no secret values | G0 |
| `npm run format:check` | offline | Formatting and generated-file cleanliness | every commit/CI |
| `npm run lint` | offline | TS/Solidity/framework lint | G5–G8 |
| `npm run typecheck` | offline | Strict workspace type safety | G5–G8 |
| `npm run compile` | offline | Contracts and module build graph | G0–G8 |
| `npm run test:unit` | offline | Domain, SDK, reducer, component units | G5–G8 |
| `npm run test:contracts` | local-nox | Contract state and economic correctness | G5–G8 |
| `npm run test:nox` | local-nox | ACL, compute, proof, confidential asset integration | G1–G5/G8 |
| `npm run test:invariant` | local-nox | I1–I10, fuzz, property/reference model | G5/G8 |
| `npm run test:adversarial` | local-nox | Replay, unauthorized, timeout, slippage, reentrancy | G5/G8 |
| `npm run test:e2e:local` | local-nox | Full local lifecycle across modules | G5/G8 |
| `npm run test:web` | offline/local | Component, accessibility, browser journeys | G7/G8 |
| `npm run test:sepolia:read` | sepolia-read | Manifest, bytecode, events, public verifier | G6–G8 |
| `npm run deploy:sepolia:plan` | sepolia-read | Deterministic write plan, addresses, estimated cost | G6 |
| `npm run deploy:sepolia` | sepolia-write | Confirmed deployment only | G6 |
| `npm run test:sepolia:write -- <case>` | sepolia-write | One named live gate case | G1–G6 |
| `npm run verify:deployment` | sepolia-read | Sources, runtime hashes, ABI/address sync | G6/G8 |
| `npm run verify:evidence` | sepolia-read | Evidence schema, receipts, commit/code context | every gate/G8 |
| `npm run scan:secrets` | offline | Repository/history/generated evidence scan | every commit/G8 |
| `npm run scan:dependencies` | network/read | Advisories and licenses | G0/G8 |
| `npm run check:all` | offline + local-nox | Complete non-live merge gate | G5–G8 |

## Test-layer matrix

| Layer | Required coverage | Forbidden shortcut |
|---|---|---|
| Pure domain | Every state/transition/error; deterministic reference math | RPC or contract dependency |
| Contract unit | Guards, events, storage, access, balance deltas | Plaintext shadow state |
| Nox integration | Real official local compute/ACL/token/proof paths | Handwritten privacy mock as evidence |
| Property/fuzz | Conservation, payout bound, monotonic state, replay uniqueness | Only happy-path examples |
| Adversarial | Unauthorized ACL, malicious keeper inputs, stale proofs, reentrancy, timeouts | Trusting returned adapter values |
| Cross-package local | SDK → chain → verifier → read model lifecycle | Fixture substitution on primary path |
| Sepolia live | Load-bearing success plus named failure/recovery cases | Manual chain-state mutation |
| Web | Real manifest, wallet states, a11y, mobile, reconnect, retry | Runtime demo/mock switch |

## Quantitative release floors

- 100% explicit transition/error mapping for the protocol state machine.
- At least 1,000 fuzz/property cases per invariant in PR checks and 10,000 in G8.
- No high/critical static-analysis finding without documented resolution.
- No known critical dependency advisory; high advisories require risk acceptance.
- Zero serious/critical automated accessibility violations on primary routes.
- No unhandled promise rejection, browser console error, or plaintext-field log in e2e.
- Deployment manifest, generated bindings, and verified runtime hashes must match exactly.

Coverage percentage is diagnostic, not proof. G5 may set package-specific coverage floors
after the test harness exists, but cannot replace transition/invariant traceability.

## Mandatory negative scenarios

- Invalid chain/pool proof context and replayed request id.
- Unauthorized owner viewer, compute authority, token transfer, and adapter use.
- Commit after deadline, duplicate commit, below-k close, and zero participants.
- Aggregate/plaintext conservation mismatch and stale/public proof.
- Slippage revert, adapter residual balance, false return value, and unresolved market.
- Unwrap requested but adapter unavailable; delayed finalize-and-rewrap recovery.
- Zero winning aggregate, rounding extremes, duplicate claim/refund, claim/refund conflict.
- Relayer duplicate/race/reorg, indexer rebuild, RPC outage, and replacement transaction.
- Wallet rejection, account/chain change, gateway timeout, reload, and reconnect.

## CI lanes

| Lane | Trigger | Commands | Write authority |
|---|---|---|---|
| Fast | Every commit/PR | format, lint, typecheck, compile, unit | None |
| Protocol | PR touching contracts/domain | Nox, contracts, invariant, adversarial | Local only |
| Product | PR touching SDK/apps | local e2e, web, accessibility | Local only |
| Security | PR + scheduled | secrets, dependencies, licenses, static analysis | None |
| Sepolia read | PR/release candidate | read verifier, manifest, evidence | None |
| Sepolia write | Manual protected workflow | one named case with confirmation | Throwaway testnet only |
| Release | G8 candidate | clean install and all non-live + read checks | None |
