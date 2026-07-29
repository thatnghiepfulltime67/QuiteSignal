# Repository working agreement

These instructions apply to the entire repository unless a deeper `AGENTS.md`
explicitly narrows them.

## Language and project identity

- Write all source code, comments, documentation, commit messages, issues, and
  user-facing copy in English.
- Treat this repository as a greenfield product. Do not mention, link to, import
  from, or preserve naming from any external legacy or benchmark project.
- Use [`Plan.md`](Plan.md) as the execution source of truth. Product, architecture,
  engineering, operations, and work-package documents live under `docs/`.
- Use [`DESIGN.md`](DESIGN.md) as the source of truth for visual semantics,
  responsive behavior, accessibility, and motion in user-facing interfaces.

## Planning workflow

1. Select the smallest incomplete work package in `docs/plans/`.
2. Give the slice a stable work-item ID and mark only one package or task in progress.
3. Confirm its prerequisites, acceptance criteria, tests, and privacy impact.
4. Implement one independently reviewable slice.
5. Run the narrowest relevant checks, then the broader gate required by the plan.
6. Update documentation and plan status in the same slice when behavior changed.
7. Commit the slice before starting an unrelated change.

Every active work item must name its output files, checks, evidence location, privacy
impact, rollback/recovery behavior, and intended commit message before implementation.

Do not implement stretch scope while an MVP gate is incomplete. Do not start
application code until the Phase 0 feasibility gate is explicitly accepted.

## Commit discipline

- Create a small commit after every independently reviewable change.
- Keep one concern per commit; never mix refactoring, features, formatting, and
  documentation unless they are inseparable for correctness.
- Prefer Conventional Commit prefixes: `docs:`, `test:`, `feat:`, `fix:`,
  `refactor:`, `build:`, `ci:`, and `chore:`.
- A commit must leave the repository in a coherent state and include the relevant
  tests or documentation updates.
- Run `git diff --check` before every commit and record the checks performed in the
  handoff when they are not self-evident.
- Never commit secrets, private keys, seed phrases, confidential plaintext, raw
  handles, proofs, wallet signatures, environment files, or generated private data.
- Do not amend, squash, force-push, or rewrite shared history unless the user asks.
- Preserve unrelated user changes. Never stage files outside the active slice.
- If Git is unavailable or the workspace is not initialized, do not pretend a
  commit was created; report the condition and continue only with authorized work.

## Architecture rules

- Privacy-critical correctness belongs in contracts and Nox, not an application backend.
- One pool owns one market and one epoch in the MVP; no cross-epoch accounting.
- The public protocol is reached only through the documented adapter boundary.
- Relayers and indexers never receive confidential plaintext or exclusive authority.
- Every state must have a documented funds location and recovery behavior.
- Every privacy claim must map to P1–P7 and protocol invariant I1–I10.
- New external dependencies require a trust-model entry, risk entry, and decision record.
- Architecture changes require an ADR before implementation when they alter trust,
  custody, privacy, state transitions, or public interfaces.

## Verification rules

- Run every contract, Nox, ACL, confidential-asset, adapter, lifecycle, recovery,
  and browser acceptance test on Ethereum Sepolia. Do not use a local blockchain
  or local Nox stack as contract evidence.
- Offline tests are limited to pure domain/reference models, schemas, formatting,
  typechecking, static analysis, and deterministic data validation.
- Pure fakes may support offline domain tests but never contract/privacy evidence.
- Enforce the committed Sepolia budget and spend-ledger rules before every write.
- Test happy paths, invalid states, replay, timeout, recovery, rounding, ACL, and
  conservation properties.
- Stop work and record a blocker if a stop-ship condition in the risk register is met.

## Documentation rules

- Keep documents concise, normative, and free of implementation claims that have
  not passed the corresponding feasibility gate.
- Update `Plan.md`, the active work package, and relevant specs whenever scope or
  behavior changes.
- Submission media planning is deferred until the product and Sepolia verification
  gates are complete.
