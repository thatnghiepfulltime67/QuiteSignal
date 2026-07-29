# QuietSignal — Documentation index

This is the greenfield source of truth for product, protocol, architecture, and
delivery decisions. Implementation must conform to these documents or introduce an
explicit architecture decision record.

Execution is governed by [`AGENTS.md`](AGENTS.md), tracked in [`Plan.md`](Plan.md),
and divided into reviewable work packages under [`docs/plans/`](docs/plans/README.md).

## Reading order

1. [`docs/product/00-executive-brief.md`](docs/product/00-executive-brief.md)
2. [`docs/product/01-problem-and-discovery.md`](docs/product/01-problem-and-discovery.md)
3. [`docs/product/02-competition-fit.md`](docs/product/02-competition-fit.md)
4. [`docs/product/03-product-spec.md`](docs/product/03-product-spec.md)
5. [`docs/product/04-discovery-synthesis.md`](docs/product/04-discovery-synthesis.md)
6. [`docs/architecture/01-system-architecture.md`](docs/architecture/01-system-architecture.md)
7. [`docs/architecture/02-privacy-and-threat-model.md`](docs/architecture/02-privacy-and-threat-model.md)
8. [`docs/architecture/03-data-and-control-flows.md`](docs/architecture/03-data-and-control-flows.md)
9. [`docs/engineering/01-protocol-spec.md`](docs/engineering/01-protocol-spec.md)
10. [`docs/engineering/02-api-and-events.md`](docs/engineering/02-api-and-events.md)
11. [`docs/engineering/03-repository-structure.md`](docs/engineering/03-repository-structure.md)
12. [`docs/operations/01-roadmap.md`](docs/operations/01-roadmap.md)
13. [`docs/operations/02-risk-register.md`](docs/operations/02-risk-register.md)
14. [`docs/operations/03-decision-log.md`](docs/operations/03-decision-log.md)
15. [`docs/operations/04-source-and-assumption-register.md`](docs/operations/04-source-and-assumption-register.md)
16. [`docs/operations/nox-feedback.md`](docs/operations/nox-feedback.md)

## Foundation rules

- Every privacy claim needs an invariant, a test, and live Sepolia evidence.
- The primary application path uses real state; fixtures are limited to tests and component development.
- No plaintext confidential input may cross into an application-controlled server;
  only the browser and the attested Nox boundary may process it.
- No recovery path may leave the location and ownership of funds unspecified.
- Package versions and deployed addresses are pinned only after Phase 0 verification.
