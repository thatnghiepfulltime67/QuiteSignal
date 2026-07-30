# Verification command and test matrix

Commands below are the required root-script contract. A command becomes mandatory
as soon as its owning package exists. G0 records exact tools and final script names;
renaming requires synchronized updates here and in CI.

## Environment classes

| Class           |     Network access |       Chain writes |                         Secrets | Purpose                                        |
| --------------- | -----------------: | -----------------: | ------------------------------: | ---------------------------------------------- |
| `offline`       |                 No |                 No |                            None | Pure domain, formatting, static checks         |
| `sepolia-read`  |                RPC |                 No |             Public RPC optional | Code hash, manifest, evidence, public verifier |
| `sepolia-write` |          RPC + Nox |                Yes | Ignored throwaway wallet config | Every contract/Nox/ACL/lifecycle gate          |
| `web-live`      | RPC + deployed app | User-approved only |                     Wallet-held | G7 release journey                             |

No default command may write to Sepolia. Write commands must assert chain id `11155111`,
require `CONFIRM_SEPOLIA_WRITE=yes`, print a dry-run plan first, and reject broad or
production-key configuration.

## Root command contract

| Command                                                   | Environment                  | Purpose                                                                                     | Required by     |
| --------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------- | --------------- |
| `npm ci`                                                  | network install              | Reproducible dependencies                                                                   | G0–G8           |
| `npm run doctor`                                          | offline/sepolia-read         | Versions, RPC/chain, public config, budget ledger; no secret values                         | G0              |
| `npm run format:check`                                    | offline                      | Formatting and generated-file cleanliness                                                   | every commit/CI |
| `npm run lint`                                            | offline                      | TS/Solidity/framework lint                                                                  | G5–G8           |
| `npm run typecheck`                                       | offline                      | Strict workspace type safety                                                                | G5–G8           |
| `npm run compile`                                         | offline                      | Contracts and module build graph                                                            | G0–G8           |
| `npm run test:automation`                                 | offline                      | Permissionless policy and runner race/schema tests                                          | G6–G8           |
| `npm run test:indexer`                                    | offline                      | Deterministic public-event reducer and checkpoint tests                                     | G6–G8           |
| `npm run rebuild:indexer:sepolia`                         | sepolia-read                 | Manifest-bound finalized public-event replay and checkpoint evidence                        | G6–G8           |
| `npm run run:live:sepolia -- --stage=<name> [--write]`    | sepolia-read / sepolia-write | Bounded fresh two-owner lifecycle stage with explicit P2 ledger attribution                 | G6              |
| `npm run write:live01:manifest`                           | sepolia-read                 | Guarded public manifest generation from LIVE-01 ledger and historical chain facts           | G6              |
| `npm run test:unit`                                       | offline                      | Domain, SDK, reducer, component units                                                       | G5–G8           |
| `npm run test:model`                                      | offline                      | Pure state/math/reference-model property and fuzz tests                                     | G1/G5/G8        |
| `npm run test:contracts:sepolia -- <case>`                | sepolia-write                | Named contract state/economic case                                                          | G1–G6/G8        |
| `npm run test:nox:sepolia -- <case>`                      | sepolia-write                | Named ACL/compute/proof/asset case                                                          | G1–G3/G5/G8     |
| `npm run test:adapter:sepolia -- [--write]`               | sepolia-read / sepolia-write | Dry-run or confirmed immutable direct-adapter cases                                         | PK-03A/G5       |
| `npm run test:factory:sepolia -- [--write]`               | sepolia-read / sepolia-write | Dry-run, confirmed CREATE2 shell deployment, or read-only verification                      | PK-03B/G5       |
| `npm run test:commit:sepolia -- --stage=<name> [--write]` | sepolia-read / sepolia-write | One bounded real ERC-7984/Nox confidential commit or recovery operation per invocation      | PK-04/G5        |
| `npm run test:adversarial:sepolia -- <case>`              | sepolia-write                | Replay, unauthorized, timeout, stale feed, reentrancy case                                  | G5/G8           |
| `npm run test:e2e:sepolia`                                | sepolia-write                | Full lifecycle across deployed modules                                                      | G5–G8           |
| `npm run test:web`                                        | offline                      | Component, accessibility, and deterministic UI-state tests                                  | G7/G8           |
| `npm run test:sepolia:read`                               | sepolia-read                 | Manifest, bytecode, events, public verifier                                                 | G6–G8           |
| `npm run deploy:sepolia:plan`                             | sepolia-read                 | Deterministic write plan, addresses, estimated cost                                         | G6              |
| `npm run deploy:sepolia:write`                            | sepolia-write                | Guarded canonical deployment; produces manifest only after post-deploy readbacks            | G6              |
| `npm run test:sepolia:write -- <case>`                    | sepolia-write                | One named live gate case                                                                    | G1–G6           |
| `npm run verify:protocol:sepolia -- --manifest=<path>`    | sepolia-read                 | Runtime hashes, immutable bindings, historical/current public epoch, and receipts           | G6/G8           |
| `npm run verify:evidence -- G3`                           | sepolia-read                 | G3 evidence shape, receipts, commit reachability, runtime/binding context, terminal custody | G3              |
| `npm run assess:g4:sepolia`                               | sepolia-read                 | Public target runtime and configuration discovery; may record a feasibility blocker         | G4              |
| `npm run assess:g4:resolution:sepolia`                    | sepolia-read                 | Chainlink ETH/USD target metadata, runtime, and current round assessment                    | G4              |
| `npm run verify:g4:evidence`                              | sepolia-read                 | G4 source/receipt/runtime-template/target-round/negative-case and zero-custody evidence     | G4              |
| `npm run verify:g5:evidence`                              | offline/sepolia-read         | Fail-closed aggregation of every named sanitized G5 component artifact                      | PK-09/G5        |
| `npm run scan:secrets`                                    | offline                      | Repository/history/generated evidence scan                                                  | every commit/G8 |
| `npm run scan:dependencies`                               | network/read                 | Advisories and licenses                                                                     | G0/G8           |
| `npm run check:offline`                                   | offline                      | Complete no-chain merge gate                                                                | G0–G8           |
| `npm run check:sepolia:read`                              | sepolia-read                 | Complete no-write chain/evidence gate                                                       | G0/G6–G8        |

## Test-layer matrix

| Layer                    | Required coverage                                                             | Forbidden shortcut                                       |
| ------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| Pure domain              | Every state/transition/error; deterministic reference math                    | RPC or contract dependency                               |
| Contract unit            | Guards, events, storage, access, balance deltas                               | Plaintext shadow state                                   |
| Nox/contract integration | Named Sepolia compute/ACL/token/proof cases                                   | Local blockchain or handwritten privacy mock as evidence |
| Property/fuzz            | Conservation, payout bound, monotonic state, replay uniqueness                | Only happy-path examples                                 |
| Adversarial              | Unauthorized ACL, malicious keeper inputs, stale proofs, reentrancy, timeouts | Trusting returned adapter values                         |
| Cross-module Sepolia     | SDK → chain → verifier → read model lifecycle                                 | Fixture substitution on primary path                     |
| Sepolia contract         | Load-bearing success plus named failure/recovery cases                        | Manual chain-state mutation or local-chain substitution  |
| Web                      | Real manifest, wallet states, a11y, mobile, reconnect, retry                  | Runtime demo/mock switch                                 |

## Quantitative release floors

- 100% explicit transition/error mapping for the protocol state machine.
- At least 1,000 offline reference-model fuzz/property cases per invariant in PR
  checks and 10,000 in G8; contract conclusions require named Sepolia vectors.
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
- Stale/incomplete feed round, wrong resolution target, caller result injection, and unresolved condition.
- Resolution grace expiry, zero target custody, and confidential refund recovery.
- Zero winning aggregate, rounding extremes, duplicate claim/refund, claim/refund conflict.
- Relayer duplicate/race/reorg, indexer rebuild, RPC outage, and replacement transaction.
- Wallet rejection, account/chain change, gateway timeout, reload, and reconnect.

## CI lanes

| Lane             | Trigger                     | Commands                                                | Write authority        |
| ---------------- | --------------------------- | ------------------------------------------------------- | ---------------------- |
| Fast             | Every commit/PR             | format, lint, typecheck, compile, unit                  | None                   |
| Protocol offline | PR touching protocol/domain | compile, model/property, static analysis                | None                   |
| Product offline  | PR touching client/apps     | unit, reducer, web, accessibility                       | None                   |
| Security         | PR + scheduled              | secrets, dependencies, licenses, static analysis        | None                   |
| Sepolia read     | PR/release candidate        | read verifier, manifest, evidence                       | None                   |
| Sepolia write    | Manual protected workflow   | one named contract/Nox/lifecycle case with budget guard | Throwaway testnet only |
| Release          | G8 candidate                | clean install and all non-live + read checks            | None                   |
