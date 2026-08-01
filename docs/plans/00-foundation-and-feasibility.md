# P0 — Foundation and feasibility

Status: `complete`

## Objective

Replace every load-bearing technical assumption with direct Ethereum Sepolia
evidence before production modules are accepted. Pure arithmetic and deterministic
reference expectations remain offline-only checks.

## Prerequisites

- Product, privacy, protocol, and architecture documents are internally consistent.
- A throwaway Sepolia wallet strategy and evidence-sanitization policy are active.
- Every write follows the committed budget and spend-ledger controls.

## Completed work-item register

| ID     | Delivered outcome                                                     | Primary evidence                                                         | Intended commit                                  |
| ------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------ |
| FND-01 | Reproducible toolchain, doctor, scans, and Sepolia read preflight     | `evidence/offline/G0/FND-01.json`                                        | `build: pin verified workspace toolchain`        |
| FND-02 | Confidential signal arithmetic and matching Sepolia vectors           | `evidence/{offline,sepolia}/G1/FND-02.json`                              | `test: prove encrypted signal arithmetic`        |
| FND-03 | Context binding, ACL persistence, owner viewing, and access rejection | `evidence/{offline,sepolia}/G1/FND-03.json`                              | `test: prove handle binding and acl lifecycle`   |
| FND-04 | Confidential asset pull, callback, unwrap, rewrap, and recovery       | `evidence/{offline,sepolia}/G2/FND-04.json`                              | `test: prove confidential asset recovery`        |
| FND-05 | Cohort disclosure, aggregate proof, timeout, and terminal refunds     | `evidence/{offline,sepolia}/G3/FND-05.json` and named terminal artifacts | `test: prove aggregate disclosure and recovery`  |
| FND-06 | Immutable public price-feed resolution with zero custody              | `evidence/{offline,sepolia}/G4/FND-06-RESOLUTION.json`                   | `test: prove public resolution adapter boundary` |
| FND-07 | Sanitized feasibility decision, risks, and architecture records       | G0–G4 summaries and evidence ledger                                      | `docs: record feasibility gates and decisions`   |

## Acceptance and negative coverage

- G0–G4 are recorded as passed in the evidence ledger.
- Nox arithmetic, ACL, asset, proof, recovery, and public-resolution boundaries are
  proven directly on Sepolia.
- Wrong context, unauthorized viewer, missing callback permission, replay, stale
  feed, premature action, invalid target, timeout, and duplicate terminal actions
  are rejected by the named cases.
- No feasibility contract or adapter has application authority or production custody.
- Evidence contains public facts only and excludes confidential values, handles,
  proofs, calldata, credentials, signatures, and private RPC configuration.

## Verification

- `npm run doctor`
- `npm run check:offline`
- `npm run verify:evidence -- G3`
- `npm run verify:g4:evidence`
- `npm run check:sepolia:read`
- `git diff --check`

## Privacy, custody, and recovery impact

The feasibility fixtures use valueless Sepolia assets. All tested custody states and
recovery paths are documented in the passed artifacts; no fixture is promoted to the
canonical product deployment.

## Completion decision

P0 is complete. G0–G4 passed with sanitized offline and Sepolia evidence, enabling
the protocol kernel without a mock privacy primitive or trusted resolution service.
