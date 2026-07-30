# P3 — Web product and public verification experience

Status: `in_progress`

## Objective

Deliver an accessible, recovery-aware application whose primary journey uses the
real G6 Sepolia manifest and makes the privacy boundary understandable without
depending on a mock, private database, or privileged backend.

## Prerequisites

- P2 is complete and G6 is passed.
- SDK, event contract, manifest, verifier, and read-model schemas are stable.
- A funded but disposable user-test strategy is documented without committed secrets.

## Work-item register

| ID           | Outcome                      | Primary artifacts                                                                    | Required checks                                             | Intended commit                             |
| ------------ | ---------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------- |
| WEB-01       | Application/provider shell   | Routes, providers, error boundaries, manifest loader                                 | wrong chain, no wallet, provider discovery/reconnect        | `feat: add application and wallet shell`    |
| WEB-02       | Market/privacy onboarding    | Market list/detail, privacy legend, trust/limitation copy                            | public/private copy audit, empty/loading/error              | `feat: add market privacy onboarding`       |
| WEB-03       | Sealed signal flow           | Probability/stake form, encrypt, approve, commit progress                            | decimal boundaries, reject/retry/replacement/reload         | `feat: add encrypted signal journey`        |
| WEB-04       | Public lifecycle view        | Epoch timeline, aggregate, adapter execution, resolution                             | event/reorg refresh, direct-RPC fallback                    | `feat: add public lifecycle timeline`       |
| WEB-05       | Owner position/terminal flow | Owner decrypt, score materialize, claim/refund/recovery                              | account mismatch, ACL failure, duplicate, pending states    | `feat: add private position and settlement` |
| WEB-06       | Verification experience      | Manifest/code hash/invariant/evidence view                                           | stale manifest, wrong chain, verifier failure               | `feat: add public verification view`        |
| WEB-07       | Accessibility/resilience     | Keyboard, screen reader, mobile, offline/RPC/gateway states                          | automated a11y, console/log scan, responsive matrix         | `test: harden accessible recovery ux`       |
| WEB-08       | Real browser lifecycle       | Live browser e2e and sanitized result report                                         | primary success plus one refund/recovery path               | `test: prove live web user journey`         |
| WEB-03-UI-01 | Poster-system visual refresh | Revised design system, responsive banded application presentation, visual assertions | token/source audit, responsive build and interaction checks | `feat: refresh web visual system`           |

## WEB-01 work-item record

ID: `WEB-01`

Status: `complete`

Outcome: Establish the browser-only application shell, canonical-manifest boundary,
and wallet/network state boundary for the real Sepolia product flow.

Output files: `apps/web/` workspace source, build configuration and package metadata,
focused shell tests, root web scripts, dependency lockfile, this record, the
dependency/source register, risk register, and decision log.

Architecture decision: Use a small Vite-built TypeScript single-page application
with browser-standard DOM APIs and EIP-1193 wallet discovery. This deliberately
avoids an application server, a UI framework, a runtime demo fixture, an analytics
SDK, and a wallet-custody dependency. The canonical deployment manifest remains the
single source of addresses and is loaded from the repository asset rather than copied
into source constants. Route names retain the documented public meaning while their
implementation may adapt to the SPA router boundary.

Acceptance criteria: The shell renders the DESIGN.md dark/cream semantic system,
privacy legend, accessible navigation, and an explicit network/wallet status. It
validates a public canonical-manifest asset before displaying pool facts, handles no
provider, disconnected, connecting, wrong-chain, connected, account-change, and
chain-change states, and offers a recovery-safe reconnect action. It contains no
confidential input field, signer persistence, backend request, private store,
fixture/demo import, handwritten address, or transaction action.

Privacy/custody impact: The browser reads only public manifest and wallet state.
It does not instantiate Nox, collect a signal, request an owner decrypt, log wallet
events, persist an account, or transmit any wallet or confidential data to a service.
Wallet connection remains an explicit user action.

Funds location/recovery impact: WEB-01 cannot sign or submit a transaction and
therefore cannot move funds. Provider or RPC loss leaves the user with a clear,
retry-safe reconnect action; direct on-chain recovery remains outside this shell.

Checks: focused TypeScript manifest/wallet-state tests, production web build,
`npm run test:web`, `npm run typecheck`, `npm run check:offline`, dependency scan,
and `git diff --check`.

Evidence location: source/test output only. WEB-01 cannot claim browser lifecycle
or G7 evidence; later WEB-08 must exercise a real Sepolia user journey.

Intended commit: `feat: add application and wallet shell`.

Rollback/failure action: Remove the isolated web workspace and its build dependency.
Do not replace a failed manifest or wallet boundary with hard-coded addresses, a
trusted backend, a demo mode, or a stored wallet/session record.

Completion evidence: This slice adds the browser-native Vite shell, a
canonical-manifest parser, and two focused `T-WEB-01-*` tests for accepted Sepolia
and rejected malformed/network-mismatched manifests. The production build uses the
repository's `deployments/sepolia/quiet-signal.json` as its public asset rather than
copying addresses into source. The shell displays the DESIGN.md semantic legend and
explicit provider/network/reconnect states, but it cannot submit a transaction.

## WEB-02 work-item record

ID: `WEB-02`

Status: `complete`

Outcome: Turn the canonical public manifest into an honest market overview and
privacy onboarding surface with no mock market facts or private-data implication.

Output files: web manifest presenter/route source and focused tests, DESIGN.md-aligned
styles, this record, and traceability updates if public copy changes.

Acceptance criteria: `/markets` and the canonical pool route render the immutable
condition, Sepolia chain, k-threshold status, and public/private/compute boundary
from the validated manifest only. Loading, malformed manifest, and empty-pool states
explain the next safe action. Copy explicitly says wallets and timing are public,
does not imply anonymity or Sybil resistance, and links only to public verification
or the later signal route.

Privacy/custody impact: This slice renders public manifest facts only. It neither
collects a signal nor displays owner data, and does not add storage, analytics,
backend requests, transaction calls, or address constants.

Funds location/recovery impact: No funds move. If the manifest is unavailable, the
screen blocks the signal path and directs the user to verify the public deployment.

Checks: focused presenter tests, `npm run test:web`, production web build,
`npm run typecheck`, and `git diff --check`.

Evidence location: source/test output only; this onboarding slice cannot claim G7.

Intended commit: `feat: add market privacy onboarding`.

Rollback/failure action: Revert only the presentation layer; retain the canonical
manifest boundary and do not replace unavailable chain facts with a fixture.

Completion evidence: This slice adds a manifest-bound market presenter and the
`/markets` plus canonical-pool presentation routes. `T-WEB-02-01` binds the view to
the passed Sepolia manifest shape; `T-WEB-02-02` rejects anonymity/Sybil-resistance
claims in presenter copy. The production build and typecheck pass. The signal link
is descriptive only until WEB-03 supplies the real encrypted transaction flow.

## WEB-03 work-item record

ID: `WEB-03`

Status: `in_progress`

Outcome: Provide the browser-local sealed signal journey using the production Nox
SDK and the protocol's real two-step commit/collateral callback lifecycle.

Output files: browser wallet/Nox adapter, sealed-signal form and state machine,
privacy/logging tests, package dependency declarations, this record, and any
required dependency decision/risk updates.

Acceptance criteria: The form validates decimal stake and probability bounds before
any encryption, creates both inputs locally with one fresh pool-bound request ID,
and clears plaintext after encryption or cancel. It uses the connected Sepolia
wallet and the SDK's sealed/prepared transaction boundary; no raw handle, proof,
plaintext, account, or transaction payload enters URLs, logs, storage, analytics,
or a service request. The UI distinguishes submitted signal intent from the later
confidential collateral callback/finalization and never calls either complete until
its public receipt/state confirms it. Every error states whether funds moved and
whether a retry is safe.

Privacy/custody impact: Plaintext exists only in the active browser form and Nox
call. The app does not persist it or hold a key. Wallet approval and the callback
transfer remain explicit user wallet actions; the browser never delegates custody.

Funds location/recovery impact: Before submission funds remain with the owner.
After a signal intent, the UI reads the public pending state before suggesting a
retry; after callback, recovery follows the pool's permissionless pending timeout
or terminal path, never an app-controlled transfer.

Checks: SDK/browser boundary tests, form validation and plaintext-clear tests,
production build, `npm run test:web`, `npm run check:offline`, and later named
Sepolia browser evidence only after the real flow is wired.

Evidence location: source/test output now; sanitized Sepolia browser evidence later
under G7. This work item cannot pass G7 without the real user-held wallet path.

Intended commit: `feat: add encrypted signal journey`.

Rollback/failure action: Remove only the web signal layer; retain the user-owned
on-chain pending/recovery path. Never substitute manual calldata, mock encryption,
durable browser plaintext, or a service signer.

## WEB-03-CALLBACK-01 work-item record

ID: `WEB-03-CALLBACK-01`

Status: `complete`

Outcome: Complete the browser-local, real Sepolia signal journey after a successful
intent by encrypting fresh collateral input for the immutable collateral wrapper,
submitting its callback, reading the public acceptance handle, and finalizing only
with a Nox public-decryption proof.

Output files: public-manifest parser and tests, frozen pool/collateral ABI surface
and SDK compatibility tests, browser wallet/Nox adapter, sealed-signal progress UI,
this work-item record, and the WEB-03 state/recovery copy.

Acceptance criteria: The browser uses the canonical manifest and runtime public
config to prove the wrapper binding, creates separate pool-bound and wrapper-bound
encrypted inputs, and uses no manual confidential calldata. It waits for each public
receipt before reporting the next stage, treats an unavailable callback proof as
pending rather than success, and clears form plaintext once it leaves the active
submit scope. It neither stores inputs nor renders raw handles/proofs.

Privacy/custody impact: Stake and probability remain only in the live form/Nox
operation. The browser requests the user's wallet for each on-chain action but has no
key, service, storage, analytics, or alternate authority. The public acceptance proof
is used directly as calldata and is never rendered or persisted.

Funds location/recovery impact: Before callback, collateral remains in the owner
wrapper balance. After callback, the immutable pool holds the pending confidential
transfer until permissionless finalization, rejection, or timeout recovery. A failed
or cancelled browser stage must instruct the owner to re-read public pending state;
it must not resubmit blindly or move funds itself.

Checks: canonical-wrapper parser tests, frozen ABI/artifact comparison, source
privacy tests, form/progress state tests, `npm run test:web`, `npm run test:sdk`,
production build, root typecheck, `npm run check:offline`, and later real Sepolia
browser evidence under WEB-08 only.

Evidence location: source/test output for this implementation slice. Sanitized real
browser receipts and recovery evidence remain required at
`evidence/sepolia/G7/WEB-08-*.json`; this work item cannot pass G7.

Intended commit: `feat: complete confidential collateral callback`.

Rollback/failure action: Remove only the browser callback orchestration. Preserve the
immutable pool's pending timeout/rejection mechanism and do not replace it with a
service signer, stored plaintext, manually copied proof, or mock acceptance result.

Completion evidence: The public manifest now validates the immutable collateral
address; the browser rejects a mismatch with the runtime pool config before a write.
The SDK ABI is compared with compiled pool and collateral artifacts. `T-WEB-03-03`
asserts separate pool and wrapper encryption boundaries, while `T-WEB-03-04` asserts
receipt waits, plaintext form clearing, and the no-plaintext finalization retry.
`npm run test:web` passed 16 tests, `npm run test:sdk` passed 12 tests, root
typecheck and the production web build passed, and `npm run check:offline` passed
format/lint/compile/verifier/SDK/automation/indexer/secret checks. No Nox or browser
write was run offline and this implementation evidence is not a G7 claim.

## WEB-03-UI-01 work-item record

ID: `WEB-03-UI-01`

Status: `complete`

Outcome: Replace the earlier visual baseline with the authoritative cocoa/orchid
poster system and apply it consistently to every existing public and private route,
without changing the protocol or wallet trust boundary.

Output files: `DESIGN.md`, `apps/web/src/styles.css`, route markup in
`apps/web/src/main.ts`, focused visual-source assertions, this work-item record, and
the relevant accessibility/responsive evidence notes.

Acceptance criteria: Every primary route uses purposeful full-bleed colour bands,
flat controls, tight readable typography, geometric decoration, visible focus, and
reduced-motion behaviour. It contains no shadow, gradient, stock image, remote font,
or visual treatment that misstates protocol finality. Existing private/public copy,
wallet authority, accessibility semantics, and recovery wording remain intact.

Privacy/custody impact: Presentation-only. It does not add a service, storage,
analytics, fonts fetched at runtime, wallet request, protocol call, or confidential
data path.

Funds location/recovery impact: No funds move and no recovery state changes. Failed
rendering remains safely retryable through the existing public route and wallet flow.

Checks: visual token/source assertions, production web build, `npm run test:web`,
typecheck, responsive manual inspection at the documented breakpoints, and
`git diff --check`.

Evidence location: source/test output only; this presentation slice cannot claim
G7 browser-lifecycle evidence.

Intended commit: `feat: refresh web visual system`.

Rollback/failure action: Revert only the presentation implementation while retaining
the updated design specification. Do not add a visual dependency, remote asset, mock
route, or alternate protocol state to compensate for a rendering failure.

Completion evidence: `T-WEB-03-UI-01` confirms every route has the closed
cocoa/orchid palette and required colour bands and rejects shadows, gradients, and
remote asset URLs. `T-WEB-03-UI-02` confirms account and chain events re-mask the
owner-only message. `npm run test:web` passed 14 tests, the production Vite build and
root typecheck passed, and local non-evidence inspection at 1440px and 390px found
the hero, market facts, privacy boundary, controls, and single-column responsive
layout legible. This does not constitute browser lifecycle evidence or a G7 claim.

## WEB-04 work-item record

ID: `WEB-04`

Status: `in_progress`

Outcome: Render a chain-derived public epoch timeline with clear aggregate,
verification, settlement, pending, and recovery states.

Output files: public RPC reader adapter, lifecycle presenter/timeline UI and tests,
this record, and status-copy updates.

Decision: ADR-022 permits one documented direct Ethereum Sepolia read transport for
manifest-bound public pool views when a browser wallet is absent. It is an
availability convenience, not protocol truth or a confidential-data service; its
metadata and outage risk are tracked as R-24.

Acceptance criteria: The view reads the canonical pool's public config/epoch over
Sepolia and maps every contract state to a labeled timeline. It never infers private
positions or a pending state as success. Aggregate totals are rendered only after
their public on-chain state exists. RPC/indexer failure uses a direct-read retry
state and does not block permissionless recovery or suggest a trusted service.

Privacy/custody impact: Only public pool/config/epoch values are read. The component
does not request an owner view, Nox operation, wallet signature, or private storage.

Funds location/recovery impact: This is read-only. Recovery states name the existing
permissionless on-chain path and never offer an app-controlled transfer.

Checks: state-mapping tests, public reader tests, production build, `npm run
test:web`, typecheck, and later Sepolia browser read evidence.

Evidence location: source/test output now; public browser-read evidence later under
G7.

Intended commit: `feat: add public lifecycle timeline`.

Rollback/failure action: Remove only the lifecycle presenter. Do not replace failed
RPC reads with static state or introduce indexer authority.

## WEB-05 work-item record

ID: `WEB-05`

Status: `in_progress`

Outcome: Provide the connected-owner position and terminal-action experience without
exposing owner values, weakening ACL, or confusing claims with recovery refunds.

Output files: owner-state presenter, browser owner adapter/action UI and tests, this
record, and privacy/recovery copy updates.

Acceptance criteria: The position screen is masked by default and clears on account
or chain change. It distinguishes wrong owner, decrypt pending, viewer denied,
position ready, score materialization, claim, and refund. Each terminal action says
whether funds move, whether it is safe to retry, and which public pool state permits
it. The screen cannot render raw owner handles/proofs or persist decrypted values.

Privacy/custody impact: Owner values remain in browser memory after an explicit
connected-owner action. The UI has no service, analytics, durable cache, key, or
alternate viewer authority.

Funds location/recovery impact: Claim and refund remain user wallet transactions
against the immutable pool; the UI never moves assets itself. Failed/dropped actions
fall back to public pool state before retry.

Checks: owner-state/privacy-source tests, action-state tests, production build,
`npm run test:web`, typecheck, and named Sepolia browser owner/recovery evidence.

Evidence location: source/test output now; sanitized owner/recovery browser evidence
under G7 later.

Intended commit: `feat: add private position and settlement`.

Rollback/failure action: Remove the isolated owner presentation/action layer; do not
replace it with a backend decrypt service or a cached private position.

## WEB-05-TERMINAL-01 work-item record

ID: `WEB-05-TERMINAL-01`

Status: `complete`

Outcome: Bind the revealed-owner view to the compiled terminal ABI and expose only
explicit, wallet-gated score, claim, and refund requests with receipt confirmation.

Output files: frozen SDK ABI entries and artifact comparison, browser owner action
adapter, owner action controls, focused source checks, and this record.

Acceptance criteria: Owner controls appear only after explicit owner reveal, clear on
account/chain change, and submit `materializeScore`, `claim`, or `refund` only from
the connected Sepolia wallet. Each action waits for a public receipt and on any
failure directs the owner to read public state before retrying. The UI renders no raw
handle or proof and does not persist owner values.

Privacy/custody impact: The action adapter uses the existing wallet and public ABI
only. It adds no key, signer, backend, storage, raw confidential payload, or viewer
authority. Claim/refund movement remains entirely inside the immutable pool/wrapper
contracts and requires explicit user approval.

Funds location/recovery impact: Materializing a score moves no funds. Claim and
refund may move only the contract-authorized confidential output after a user wallet
approval and receipt; an unconfirmed action is never presented as final and public
pool state remains the recovery source.

Checks: compiled ABI comparison, owner action source test, `npm run test:sdk`,
`npm run test:web`, root typecheck, production web build, and later named browser
Sepolia owner/recovery evidence only.

Evidence location: source/test output only. This is not terminal or G7 evidence;
sanitized owner/recovery receipts remain required under WEB-08.

Intended commit: `feat: add owner terminal actions`.

Rollback/failure action: Remove only owner action controls and their adapter. Never
replace an unavailable action with backend signing, durable owner data, or a manual
proof/calldata flow.

Completion evidence: `T-SDK-03-01` compares the three terminal selectors to the
compiled pool artifact. `T-WEB-05-01` asserts that controls are wallet-gated, use the
frozen ABI, wait for receipts, and clear with owner state. SDK tests (12), web tests
(18), root typecheck, and production build passed. No terminal write was run offline
and no G7 claim is made.

## WEB-06 work-item record

ID: `WEB-06`

Status: `in_progress`

Outcome: Provide a public verification route that exposes canonical manifest facts,
runtime/evidence status, and clear failure handling without treating the web app as
the verifier of record.

Output files: verification presenter/route and tests, public evidence loader,
DESIGN.md verification panel styles, this record, and public-copy updates.

Acceptance criteria: `/verify/:address` validates the canonical manifest address and
Sepolia chain before showing public deployment facts. It links the committed G6
evidence artifact and states that the independent verifier command—not the UI—is the
source of invariant conclusions. Missing, stale, wrong-chain, or wrong-address
inputs show failure copy and do not render a green status.

Privacy/custody impact: The route reads only committed public manifest/evidence
fields. It contains no wallet, owner data, Nox operation, service identity, or
confidential schema.

Funds location/recovery impact: Read-only; it cannot affect funds. A verification
failure directs users to public evidence and does not block on-chain recovery.

Checks: presenter mutation tests, production build, `npm run test:web`, typecheck,
and later browser evidence against the real G6 manifest.

Evidence location: source/test output now; G7 browser verification evidence later.

Intended commit: `feat: add public verification view`.

Rollback/failure action: Remove only the route/presenter. Never replace missing
evidence with a fixture or claim an unverified manifest is valid.

## WEB-07 work-item record

ID: `WEB-07`

Status: `in_progress`

Outcome: Harden the primary browser experience for keyboard, screen-reader, mobile,
reduced-motion, RPC/wallet/Nox failure, and confidential-data handling.

Output files: accessibility/resilience source improvements, browser/static checks,
responsive and privacy tests, this record, and verification-matrix updates.

Acceptance criteria: Every primary action has a visible focus state, semantic label,
44px target, and live status text; narrow layouts retain privacy/recovery content.
Reduced-motion disables nonessential motion. Source checks reject console, storage,
analytics, raw handle/proof, and private-value persistence paths. Wallet, RPC,
gateway, account, and chain failures state safe next actions without false finality.

Privacy/custody impact: No new data collection or state persistence is allowed.
Resilience must preserve browser-local plaintext/decrypt lifetime and user-held wallet
authority.

Funds location/recovery impact: UX failure states cannot alter funds. Every terminal
copy points to the existing on-chain claim/refund/recovery path.

Checks: accessibility/privacy source tests, responsive stylesheet assertions,
production build, `npm run test:web`, typecheck, and later manual/browser checks at
360/768/1280/1440px.

Evidence location: sanitized WEB-07 checks now and G7 browser evidence later.

Intended commit: `test: harden accessible recovery ux`.

Rollback/failure action: Revert only isolated UI hardening; never relax privacy
checks or use an inaccessible fallback state.

## WEB-08 work-item record

ID: `WEB-08`

Status: `in_progress`

Outcome: Produce sanitized, real-browser Ethereum Sepolia evidence for the primary
signal journey and one documented recovery path without a mock wallet or chain.

Output files: browser harness/configuration, the explicit test-wallet runbook in
`docs/setup-sepolia.md`, sanitized evidence writer, G7 evidence artifact, this
record, evidence ledger, and verification matrix updates.

Acceptance criteria: The browser starts from the production web build and canonical
manifest, connects a disposable Sepolia wallet, drives encryption and the real
two-step intent/collateral path, and records only public receipt/state facts. A
separate browser run observes or completes one permissionless recovery path. Browser
console has no unexpected error; traces/screenshots/logs are scanned for confidential
input, raw handles, proofs, private keys, signatures, and RPC configuration.

Privacy/custody impact: The browser harness never reads or commits a key. Wallet
authority remains external and explicit; any confidential plaintext stays within the
browser/Nox path and is excluded from artifacts. No service receives it.

Funds location/recovery impact: Every submitted test action is on Sepolia, budgeted,
receipt-recorded, and followed to documented public state. A failed browser stage
stops and uses only the pool's recovery function; no harness transfer or chain edit
is permitted.

Checks: browser tests on Ethereum Sepolia only, artifact sanitization, `npm run
test:web`, production build, `npm run check:offline`, and read-only evidence
verification.

Evidence location: `evidence/sepolia/G7/WEB-08-*.json`.

Intended commit: `test: prove live web user journey`.

Rollback/failure action: Do not mark G7/P3 complete. Preserve public receipts and
stop at the documented on-chain recovery state; never replace browser evidence with
a simulated provider or local chain.

## WEB-08-READ-01 work-item record

ID: `WEB-08-READ-01`

Status: `complete`

Outcome: Exercise the active DEP-02 production build in a real browser without a
wallet provider, proving that manifest selection, public lifecycle reads,
verification, masked owner state, and the signal-entry boundary do not depend on a
mock chain or application data service.

Output files: sanitized browser-read report and this record.

Checks: Chrome opened the production Vite preview at `/markets`, refreshed the
direct Ethereum Sepolia lifecycle read, and visited the active verification, owner,
and signal routes. The browser emitted no console API or exception event. No trace
or screenshot was persisted, and the run recorded no confidential input, handle,
proof, signature, key, or RPC configuration.

Evidence location: `evidence/sepolia/G7/WEB-08-READ-DEP-02.json`.

Completion evidence: The report records a successful DEP-02 manifest load, OPEN
epoch read at block `11384129`, masked no-wallet owner state, non-writing signal
entry, and zero unexpected browser console/exception events. It is explicitly
read-only evidence, not a substitute for the real-wallet, recovery, or G7 journey.

## WEB-08-DEPLOYMENT-01 work-item record

ID: `WEB-08-DEPLOYMENT-01`

Status: `complete`

Outcome: Create an append-only, currently open Sepolia deployment revision and a
verified active-release manifest selection for the real browser journey, preserving
DEP-01/G6 history unchanged.

Output files: guarded revision planner/writer, immutable revision manifest, active
release pointer, manifest-selection validation/tests, this record, spend-ledger
entries, and sanitized deployment verification evidence.

Acceptance criteria: A revision has a unique explicit identifier, fresh deterministic
addresses, its own `create-only` manifest, budgeted guarded writes, receipt/runtime/
immutable-config verification, and a non-expired empty epoch. The active pointer can
reference only a verified revision manifest; it never changes DEP-01 and no browser
falls back to an unverified address or fixture.

Privacy/custody impact: Deployment/release selection contains public addresses,
hashes, and blocks only. It has no user input, owner value, key in artifacts,
privileged runtime role, or collateral custody.

Funds location/recovery impact: Revision deployment spends only guarded native gas
and creates an empty pool. Existing DEP-01 remains independently refundable and
recoverable. A failed revision stops before publishing an active pointer.

Checks: revision mutation/unit tests, read-only Sepolia plan, guarded write with
ledger verification, independent manifest verification, browser manifest-selection
tests including the shipped DEP-02 pointer, production web build, and `git diff
--check`.

Evidence location: immutable revision manifest and sanitized deployment evidence;
later G7 evidence uses that selected manifest only after verification.

Intended commit: `build: add append-only deployment revision`.

Rollback/failure action: Leave the existing active release untouched and retain any
public failed-stage receipts. Never overwrite DEP-01, an existing revision manifest,
or a verified pointer with an unverified deployment.

Execution note: DEP-02 completed its empty fixture, collateral wrapper, resolution
adapter, factory, and pool deployment at Sepolia blocks `11384060`, `11384061`,
`11384062`, `11384064`, and `11384065`. Its immutable manifest records all five
receipts and the append-only spend ledger records each native-gas cost. The
independent verifier passed at block `11384093`, including runtime hashes, factory
pool binding, collateral interface, adapter/feed configuration, zero adapter native
custody, and the empty OPEN epoch; its sanitized report is
`evidence/sepolia/G7/WEB-08-DEP-02-release-verification.json`. DEP-02 is verified
deployment evidence, but it is not G7 product-journey evidence until the active
pointer is promoted and the named browser cases complete.

## Primary route contract

Required routes or equivalent framework views:

- `/markets`: chain-derived available pools with explicit network state.
- `/pool/:address`: immutable market facts, deadline, k-status, public lifecycle.
- `/pool/:address/signal`: encrypted probability/stake journey.
- `/position`: connected-owner private decrypt, score, claim/refund status.
- `/verify/:address`: manifest, code hashes, public invariants, evidence references.

Route naming may change only with synchronized acceptance tests and documentation.
Primary routes cannot import fixture, storybook, or runtime demo-mode modules.

## UX state matrix

| Surface           | Required states                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| Wallet/network    | no provider, disconnected, connecting, wrong chain, connected, account changed, chain changed               |
| Encryption        | idle, validating, gateway pending, ready, timeout, retryable error, fatal context mismatch                  |
| Transaction       | approval required, wallet pending, submitted, replaced, confirming, finalized, reverted, dropped            |
| Epoch             | open, deadline passed, below-k refundable, aggregate pending, unwrap pending, executed, settled, refundable |
| Owner data        | wrong owner, decrypt pending, viewer denied, position ready, score pending/ready, claimed/refunded          |
| External services | RPC degraded, gateway degraded, relayer absent, indexer rebuilding, direct-read fallback                    |

Every asynchronous state must state: what happened, whether funds moved, what remains
private, whether retry is safe, and the next user action.

## Privacy UX contract

- Before commit, show that probability/stake are confidential while wallet, timing,
  market, transaction, and eventual aggregate are public.
- Do not say anonymous, untraceable, private membership, or guaranteed Sybil resistance.
- Never render confidential inputs into URL, query string, server component, analytics,
  crash report, console log, persisted global store, or reusable public cache.
- Clear ephemeral form plaintext after encryption/commit completion or explicit cancel.
- Owner-decrypted values remain client-local and are masked on account/chain change.

## Accessibility and responsive contract

- All actions usable by keyboard with visible focus and logical order.
- Status changes announced with non-disruptive live regions.
- Form fields have programmatic labels, units, validation, and error association.
- Color is not the only carrier of privacy, state, success, or error information.
- Primary routes pass at 360px, 768px, 1280px, and 1440px viewports.
- Reduced motion is respected; progress does not depend on animation.
- Zero serious/critical automated a11y violations and manual keyboard path passes.

## Browser e2e register

| Case ID    | Journey                                                                               |
| ---------- | ------------------------------------------------------------------------------------- |
| E2E-WEB-01 | Connect → correct network → enter probability/stake → encrypt → approve → commit      |
| E2E-WEB-02 | Reload/reconnect → recover submitted transaction/position state                       |
| E2E-WEB-03 | Observe aggregate/execution/resolution from chain-derived events                      |
| E2E-WEB-04 | Owner decrypt → materialize score → claim confidential payout                         |
| E2E-WEB-05 | Below-k or recovered epoch → owner refund                                             |
| E2E-WEB-06 | Wrong owner cannot decrypt and sees precise non-overclaiming explanation              |
| E2E-WEB-07 | Indexer/relayer unavailable → direct reads and permissionless action remain available |
| E2E-WEB-08 | Verify route detects valid manifest and rejects stale/wrong-chain manifest            |

## Verification

- Strict typecheck, lint, unit/component, browser, accessibility, and responsive checks.
- Browser console has no unexpected error or unhandled rejection.
- Structured scan finds no confidential input in logs, storage, network calls to app
  servers, test artifacts, screenshots, or traces.
- WEB-08 runs against the real G6 deployment manifest, not seeded runtime fixtures.
- Read-model rebuild produces the same finalized public view.

## Exit checklist

- [ ] WEB-01 through WEB-08 are independently committed.
- [ ] All UX state matrix entries have implementation and tests.
- [ ] Primary route dependency scan proves no fixture/demo import.
- [ ] Public/private language matches the threat model and traceability matrix.
- [ ] G7 is passed with sanitized browser evidence.
- [ ] An unfamiliar tester completes success and recovery paths using documentation only.
- [ ] Worktree is clean and P4 prerequisites are recorded.

## Stop conditions

Stop if a primary journey requires server-side plaintext, private database truth,
runtime mock state, privileged automation, or a privacy claim broader than evidence.
