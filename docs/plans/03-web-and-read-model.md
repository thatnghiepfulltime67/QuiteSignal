# P3 — Web product and public verification experience

Status: `complete`

## Objective

Deliver an accessible, recovery-aware application whose primary journey uses the
real G6 Sepolia manifest and makes the privacy boundary understandable without a
mock, private database, custodial service, or privileged backend.

## Prerequisites

- P2 is complete and G6 is passed.
- SDK, event, manifest, verifier, and read-model schemas are stable.
- Browser wallets remain user-controlled and no secret enters the repository.

## Completed work-item register

| ID     | Delivered outcome                                                         | Primary checks                                                        | Intended commit family                         |
| ------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------- |
| WEB-01 | Browser-only application, provider, wallet, and network shell             | provider, account, chain, reconnect, and route tests                  | `feat: add application and wallet shell`       |
| WEB-02 | Landing, market onboarding, privacy copy, and direct navigation           | source, navigation, keyboard, and production-build checks             | `feat: improve product landing and navigation` |
| WEB-03 | Confidential collateral preparation and encrypted forecast flow           | decimal, duplicate, rejection, retry, receipt, and reload tests       | `feat: add encrypted signal journey`           |
| WEB-04 | Chain-derived market state and public lifecycle controls                  | deadline, eligibility, direct-read, degraded-state, and reorg checks  | `feat: add public lifecycle timeline`          |
| WEB-05 | Owner-only position, score, payout, claim, refund, and recovery UI        | account mismatch, masked state, terminal-action, and duplicate checks | `feat: add private position and settlement`    |
| WEB-06 | Manifest-bound verification presentation                                  | wrong-chain, stale-manifest, runtime, and binding checks              | `feat: add public verification view`           |
| WEB-07 | Accessibility, responsiveness, transaction locking, and feedback          | web suite, reduced motion, keyboard, responsive, and console checks   | `test: harden accessible recovery ux`          |
| WEB-08 | Production deployment and read verification                               | production build, route reads, manifest checks, and deployment health | `build: verify production web deployment`      |
| WEB-09 | Complete participant cockpit with faucet, wrap, reveal, and balances      | web tests, production build, offline gate, and clean diff             | `feat: complete the participant web journey`   |
| WEB-10 | Browser-created verified markets and shareable participant entry          | factory-binding mutations, market discovery, build, and web tests     | `feat: add a permissionless market creator`    |
| WEB-11 | Global verified-market discovery and second-participant handoff           | registry scan, immutable verification, retry, and route tests         | `feat: add verified participant links`         |
| WEB-12 | Permissionless lifecycle, proof, settlement, and recovery controls        | action eligibility, hover prerequisites, receipt, and refresh tests   | `feat: add permissionless lifecycle actions`   |
| WEB-13 | Task-oriented top-level navigation and integrated market workspace        | route, source, responsive, and offline checks                         | `feat: simplify task navigation`               |
| WEB-14 | Sticky navigation, selected market, and independent market-list scrolling | scroll, responsive, source, and build checks                          | `feat: pin task navigation`                    |
| WEB-15 | Bounded market presets and longer commit windows                          | policy, deadline, share verification, web, and build tests            | `feat: customize user-created markets`         |
| WEB-16 | Draft recovery, registry resilience, deadline safety, and final UX fixes  | focused web tests, browser inspection, build, and typecheck           | `fix: harden audited web ux states`            |

## Product boundaries

- The application is a static browser build and has no application backend.
- The active Sepolia release manifest is the only canonical address source.
- Confidential values are encrypted locally and never enter URLs, logs, analytics,
  indexer records, relayer payloads, screenshots, or committed evidence.
- Wallet approvals and writes remain explicit user actions.
- Indexer, relayer, and RPC failures degrade convenience only; direct contract paths
  and permissionless recovery remain available.
- User-created markets are factory-verified before display and are never promoted to
  the canonical protocol deployment.

## Verification

- `npm run test:web`
- `npm run build:web`
- `npm run typecheck`
- `npm run lint`
- `npm run check:offline`
- `npm run check:sepolia:read`
- `git diff --check`

The deployed product is available at <https://quitesignal.vercel.app>. Public
protocol correctness and recovery evidence remain anchored to the passed G0–G6
ledger; product checks cover browser behavior and presentation without extending
the protocol privacy claims.

## Privacy, custody, and recovery impact

P3 introduces no backend custody, decrypt authority, result writer, or privileged
lifecycle actor. Collateral remains in the documented confidential protocol states.
Any failed browser action preserves the latest confirmed chain state, shows a
retryable result, and refreshes eligibility before another write.

## Completion decision

P3 is complete: the product routes, wallet workflows, market discovery, confidential
asset preparation, forecast flow, owner position, lifecycle controls, payout
explanation, accessibility behavior, and production deployment are present and
covered by the recorded product checks.
