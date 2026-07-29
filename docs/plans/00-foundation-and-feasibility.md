# P0 — Foundation and feasibility

## Objective

Eliminate technical assumptions before product implementation.

## Tasks

- [ ] Initialize and record toolchain, package manager, Node, Solidity, and Hardhat versions.
- [ ] Pin Nox packages and verify Sepolia protocol mapping against live bytecode.
- [ ] Prove encrypted external input import and context binding.
- [ ] Prove confidential compare/select, multiply, divide, subtract, and absolute-difference math.
- [ ] Prove owner viewer ACL without granting persistent compute authority.
- [ ] Prove confidential token pull, payout transfer, unwrap, finalize, and rewrap recovery.
- [ ] Prove aggregate-only public decryption and request-id replay protection.
- [ ] Select one open protocol and prove a minimal public adapter call and redemption.
- [ ] Record every finding in the feedback report and update the risk register.

## Verification

- Official Nox Hardhat integration-stack tests.
- Minimal live Sepolia transactions for every load-bearing primitive.
- Code-hash and address capture for all live dependencies.

## Suggested commit slices

1. `build: pin verified toolchain and nox packages`
2. `test: prove nox arithmetic and acl primitives`
3. `test: prove confidential asset lifecycle`
4. `test: prove aggregate decryption and replay binding`
5. `test: prove public market adapter feasibility`
6. `docs: record feasibility evidence and findings`

## Exit criteria

All tasks pass locally and on Sepolia where specified. Any failed primitive has a
documented safe alternative; otherwise P0 is blocked and product code does not begin.
