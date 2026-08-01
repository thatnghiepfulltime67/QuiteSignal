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

| ID                   | Outcome                          | Primary artifacts                                                                                       | Required checks                                                                                   | Intended commit                                     |
| -------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| WEB-01               | Application/provider shell       | Routes, providers, error boundaries, manifest loader                                                    | wrong chain, no wallet, provider discovery/reconnect                                              | `feat: add application and wallet shell`            |
| WEB-02               | Market/privacy onboarding        | Market list/detail, privacy legend, trust/limitation copy                                               | public/private copy audit, empty/loading/error                                                    | `feat: add market privacy onboarding`               |
| WEB-03               | Sealed signal flow               | Probability/stake form, encrypt, approve, commit progress                                               | decimal boundaries, reject/retry/replacement/reload                                               | `feat: add encrypted signal journey`                |
| WEB-04               | Public lifecycle view            | Epoch timeline, aggregate, adapter execution, resolution                                                | event/reorg refresh, direct-RPC fallback                                                          | `feat: add public lifecycle timeline`               |
| WEB-05               | Owner position/terminal flow     | Owner decrypt, score materialize, claim/refund/recovery                                                 | account mismatch, ACL failure, duplicate, pending states                                          | `feat: add private position and settlement`         |
| WEB-06               | Verification experience          | Manifest/code hash/invariant/evidence view                                                              | stale manifest, wrong chain, verifier failure                                                     | `feat: add public verification view`                |
| WEB-07               | Accessibility/resilience         | Keyboard, screen reader, mobile, offline/RPC/gateway states                                             | automated a11y, console/log scan, responsive matrix                                               | `test: harden accessible recovery ux`               |
| WEB-08               | Real browser lifecycle           | Live browser e2e and sanitized result report                                                            | primary success plus one refund/recovery path                                                     | `test: prove live web user journey`                 |
| WEB-03-UI-01         | Poster-system visual refresh     | Revised design system, responsive banded application presentation, visual assertions                    | token/source audit, responsive build and interaction checks                                       | `feat: refresh web visual system`                   |
| WEB-02-LANDING-01    | Product landing and navigation   | Complete product narrative, task-oriented navigation, route guidance, accessibility improvements        | route/source assertions, keyboard/navigation checks, production build                             | `feat: improve product landing and navigation`      |
| WEB-02-NAV-02        | Two-level product navigation     | Overview plus a task-described Workspace menu                                                           | source/navigation tests, production build, typecheck, clean diff                                  | `feat: clarify workspace navigation`                |
| WEB-02-NAV-03        | Persistent workspace subnav      | Workspace defaults to Market and exposes its functions in a secondary navigation bar                    | source/navigation tests, production build, typecheck, clean diff                                  | `feat: add persistent workspace navigation`         |
| WEB-08-DEPLOYMENT-02 | Revision command preparation     | Explicit append-only revision invocation and operator runbook                                           | static command policy test, formatter, typecheck, clean diff                                      | `build: prepare explicit release revision commands` |
| WEB-08-EVIDENCE-03   | Browser evidence verifier        | Public-only G7 browser evidence schema and independent receipt/manifest validation                      | parser mutation tests, verifier tests, typecheck, clean diff                                      | `test: add browser evidence verifier`               |
| WEB-09               | Complete participant cockpit     | Live readiness, test-asset faucet/wrap, guarded signal journey, owner/recovery cockpit                  | web tests, production build, offline gate, clean diff                                             | `feat: complete the participant web journey`        |
| WEB-10               | Permissionless self-test pool    | Browser-created adapter/pool, session route, public binding checks, full participant handoff            | deployment mutation tests, web tests, production build, offline gate                              | `feat: add a permissionless self-test market`       |
| WEB-11               | Shared self-test entry           | Factory-verified public join route for a second participant                                             | mutation tests, web tests, production build, offline gate                                         | `feat: add verified self-test participant links`    |
| WEB-12               | Permissionless lifecycle cockpit | Wallet-gated public lifecycle and recovery actions, including aggregate proof finalization              | state/action tests, web tests, production build, offline gate                                     | `feat: add permissionless lifecycle actions`        |
| WEB-13               | Direct task navigation           | Header task routes, isolated lifecycle view, unified controls, landing-integrated guide                 | route/source tests, responsive build, offline gate                                                | `feat: simplify task navigation`                    |
| WEB-14               | Persistent task navigation       | Sticky task bar with opaque scroll surface and mobile-safe wrapping                                     | source test, responsive build, offline gate                                                       | `feat: pin task navigation`                         |
| WEB-15               | Bounded custom self-test         | Preset condition, commit window, and participant gate with manifest-bound share verification            | self-test tests, web tests, build, offline gate                                                   | `feat: customize self-test markets`                 |
| WEB-16               | UI resilience and draft recovery | Preserve Create drafts, decouple optional registry reads, and close audited accessibility/deadline gaps | focused web tests, responsive browser inspection, production build, typecheck, `git diff --check` | `fix: harden audited web ux states`                 |

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

## WEB-02-LANDING-01 work-item record

ID: `WEB-02-LANDING-01`

Status: `complete`

Outcome: Turn the root route into a complete, independently written product landing
experience, then organize the application around clear public exploration, learning,
verification, and owner tasks.

Output files: landing and route markup in `apps/web/src/main.ts`, responsive
navigation and interaction styling in `apps/web/src/styles.css`, focused
source/navigation assertions, and this record.

Acceptance criteria: The landing page describes the live product, lifecycle,
privacy boundary, recovery posture, verification boundary, network, and safe first
actions without implying anonymity, guaranteed execution, or transaction finality.
Persistent navigation exposes the home, market, explainer, verification, and private
position tasks with a visible current route, an accessible skip link, and useful
mobile behaviour. The result remains typographic, banded, flat, and within the
closed DESIGN.md palette; it adds no third-party asset, storage, analytics, backend,
wallet authority, or confidential-data path.

Privacy/custody impact: Presentation and public route organization only. It does not
read a private value, create a Nox input, request a signature, retain any browser
data, or alter funds/recovery behavior.

Funds location/recovery impact: No funds move. All guidance names the existing
on-chain recovery posture and requires public verification before a wallet action.

Checks: focused navigation/landing source tests, `npm run test:web`, production web
build, root typecheck, and `git diff --check`.

Evidence location: source/test output only. This presentation work cannot claim a
browser wallet journey or G7.

Intended commit: `feat: improve product landing and navigation`.

Rollback/failure action: Revert only the route presentation and styling. Retain the
canonical manifest boundary and never replace live product facts with a mock.

Completion evidence: The root route now provides a complete product explanation,
privacy/recovery limits, lifecycle guidance, release facts, FAQs, and safe market or
verification calls to action. `/how-it-works` adds task-oriented route guidance, and
the persistent header provides explicit overview, market, explainer, verification,
and position destinations with a current-route indicator, Sepolia label, and keyboard
skip link. `T-WEB-02-LANDING-01`, all 22 web tests, root typecheck, production Vite
build, targeted Prettier checks, and `git diff --check` pass. The content is
independently written and presentation-only; it does not create G7 evidence.

## WEB-02-NAV-02 work-item record

ID: `WEB-02-NAV-02`

Status: `complete`

Prerequisite gates: G6 passed. This is a presentation-only P3 slice and cannot claim
G7 browser-wallet evidence.

Outcome: Replace the crowded primary navigation with two clear entry points:
`Overview` and a named `Workspace` menu that explains each available product task
before navigation.

Output files: `apps/web/src/main.ts`, `apps/web/src/styles.css`, focused navigation
and accessibility tests, and this work-item record.

Acceptance criteria: The primary bar exposes only Overview and Workspace. Workspace
has an explicit expand/collapse control, exposes Market, Guide, Verify, and Position
with a one-sentence purpose for each, marks its active task context, remains keyboard
accessible, and keeps every menu/action target at least 44px. It must not add a
wallet request, storage, backend call, tracker, route mock, or confidential-data
path.

Negative cases: The menu must not hide the current task, trap keyboard focus, imply
that a wallet is required for public exploration, or treat owner-only functions as
public facts.

Privacy/custody impact: None. Labels describe existing public/owner boundaries only;
no wallet/provider state or confidential input is read or persisted.

Funds location/recovery impact: None. Navigation cannot submit a transaction; its
recovery copy continues to direct users to the documented on-chain path.

Checks: focused source/navigation tests, `npm run test:web`, production web build,
root typecheck, targeted Prettier validation, and `git diff --check`.

Evidence location: source/test output only. This work item cannot satisfy G7.

Intended commit: `feat: clarify workspace navigation`.

Rollback/failure action: Revert only the navigation presentation. Do not restore a
route-only hidden menu by adding a wallet dependency, backend navigation service, or
stored session state.

Completion evidence: The top-level bar now contains only Overview and Workspace.
Workspace identifies the active task context and opens four 44px-plus task cards for
Market, Guide, Verify, and owner-only Position, each with its purpose and privacy
boundary. `T-WEB-02-LANDING-01` checks the two-level source contract and its task
labels; `T-WEB-07-TARGETS-01` checks the shared top-level target contract. All 27 web
tests, production Vite build, root typecheck, targeted Prettier validation, and `git
diff --check` pass. No wallet, storage, backend, or chain behaviour changed.

## WEB-02-NAV-03 work-item record

ID: `WEB-02-NAV-03`

Status: `complete`

Prerequisite gates: G6 passed. This presentation-only P3 slice cannot claim G7.

Outcome: Make Workspace a direct Market entry point and present its functions in a
visible secondary navigation bar instead of a transient overlay menu.

Output files: `apps/web/src/main.ts`, `apps/web/src/styles.css`, focused navigation
tests, and this work-item record.

Acceptance criteria: The primary navigation has Overview and a Workspace link to
`/markets`. Every Workspace route renders a visible secondary bar for Market, Guide,
Verify, and Position; Market is current after entering Workspace. The current task is
announced semantically, all controls remain at least 44px, and narrow layouts keep
the bar readable without horizontal overflow.

Privacy/custody impact: None. This changes only in-memory route presentation and
does not request a wallet, store data, or introduce a service.

Funds location/recovery impact: None. The subnavigation has no transaction action;
existing recovery guidance remains contract-directed.

Checks: focused navigation tests, `npm run test:web`, production web build, root
typecheck, targeted Prettier validation, and `git diff --check`.

Evidence location: source/test output only; this cannot satisfy G7.

Intended commit: `feat: add persistent workspace navigation`.

Rollback/failure action: Revert only the navigation presentation. Do not substitute
hidden routes, wallet gating, or a retained client session.

Completion evidence: Workspace is now a direct `/markets` link. On every Workspace
route, the secondary navigation stays visible below the primary bar and highlights
Market, Guide, Verify, or Position with the current page; entering Workspace starts
on Market. `T-WEB-02-LANDING-01` and `T-WEB-07-TARGETS-01` cover the route/target
contracts. All 27 web tests, production Vite build, root typecheck, targeted
Prettier validation, and `git diff --check` pass. No wallet, storage, backend, or
chain behaviour changed.

## WEB-03-UX-02 work-item record

ID: `WEB-03-UX-02`

Status: `complete`

Outcome: Make the high-intent market, signal, owner, and verification routes easier
to scan and safer to act on by exposing task sequence, wallet boundary, recovery
guidance, and next-action choices in the UI.

Output files: task-route markup in `apps/web/src/main.ts`, route-specific responsive
styles in `apps/web/src/styles.css`, focused UI source assertions, and this record.

Acceptance criteria: The market explains the safe reading-to-signalling path; the
signal form shows local validation, browser encryption, and wallet approval as
separate steps; the owner view explains its masked default; and verification gives a
clear independent-check boundary. Each addition remains honest about transaction
finality and recovery, preserves semantic labels and live regions, and makes no
private read, request, or storage change.

Privacy/custody impact: Presentation only. It neither reveals a value nor changes
the wallet, Nox, chain, recovery, or evidence paths.

Funds location/recovery impact: No funds move. Copy reinforces that the public pool
lifecycle and contract selectors, not the page, determine the next recovery action.

Checks: focused UI source assertions, `npm run test:web`, production web build, root
typecheck, and `git diff --check`.

Evidence location: source/test output only; this work is not G7 evidence.

Intended commit: `feat: clarify high-intent product journeys`.

Rollback/failure action: Revert only the contextual UI. Do not change transaction
or recovery behavior to compensate for a presentation issue.

Completion evidence: The market now presents an explicit read → verify → signal
path; signal entry separates local validation, browser encryption, and wallet
approval; the owner route explains its masked default and explicit terminal actions;
and verification directs users to the independent check boundary. `T-WEB-03-UX-02`,
all 23 web tests, root typecheck, production Vite build, targeted Prettier checks,
and `git diff --check` pass. The slice has no wallet or chain write and does not
claim G7 evidence.

## WEB-01-UX-03 work-item record

ID: `WEB-01-UX-03`

Status: `complete`

Outcome: Replace the blank pre-manifest interval and generic failure rendering with
explicit release loading and unavailable states that preserve public education but
prevent a wallet-action path before canonical manifest validation.

Output files: application state/markup in `apps/web/src/main.ts`, corresponding
poster-system status styles in `apps/web/src/styles.css`, focused assertions, and
this record.

Acceptance criteria: The first render announces a non-writing verification/loading
state; a manifest failure gives a clear stop action and no market, signal, owner, or
verification CTA; and a validated manifest restores the normal route experience.
States remain keyboard readable and do not introduce storage, analytics, a service,
or a wallet request.

Privacy/custody impact: Presentation-only state derived from the existing manifest
fetch. No confidential value, wallet account, key, signature, or transaction payload
is read or retained.

Funds location/recovery impact: No funds move. The unavailable state explicitly
prevents a new action until the canonical public release can be read again.

Checks: focused source assertions, `npm run test:web`, production web build, root
typecheck, and `git diff --check`.

Evidence location: source/test output only; this work is not G7 evidence.

Intended commit: `feat: clarify release loading states`.

Rollback/failure action: Revert only the status presentation. Never make an
unvalidated fallback manifest or stored deployment address available to restore a CTA.

Completion evidence: Initial render now announces canonical release verification;
the wallet control is disabled until a validated manifest exists; and unavailable
state blocks route actions with a clear reload/verify instruction. `T-WEB-01-UX-03`,
all 24 web tests, root typecheck, production Vite build, targeted Prettier checks,
and `git diff --check` pass. No stored fallback or wallet/chain action was added.

## WEB-01-WALLET-UX-04 work-item record

ID: `WEB-01-WALLET-UX-04`

Status: `complete`

Outcome: Make the browser-wallet boundary explicit by discovering compatible
providers, allowing the participant to choose one, and presenting connected,
wrong-network, unavailable, and application-disconnected states without storing a
provider identity or invoking a transaction.

Output files: wallet-provider discovery and header menu in `apps/web/src/main.ts`,
flat responsive menu styling in `apps/web/src/styles.css`, focused source assertions,
and this record.

Acceptance criteria: Browser provider discovery is opt-in and in-memory only; the
wallet menu identifies its request as a connection rather than a transaction; each
provider is bound once for account/network change reset; selected provider failures
state a safe retry; and the app offers no key import, signer, relay, or private-data
path. A no-provider state explains the next safe action.

Privacy/custody impact: Provider metadata and the selected provider object exist in
memory for the active page only. The UI does not persist account/provider data,
receive a private key, or delegate signing/custody.

Funds location/recovery impact: Connecting or disconnecting changes no contract
state. All actual asset movement remains behind later explicit wallet approvals and
the documented pool recovery paths.

Checks: focused source assertions, `npm run test:web`, production web build, root
typecheck, and `git diff --check`.

Evidence location: source/test output only; provider discovery is not a G7 wallet
journey.

Intended commit: `feat: clarify browser wallet selection`.

Rollback/failure action: Revert only the discovery/menu presentation. Never restore
a single implicit wallet connection by adding a private signer or stored account.

Completion evidence: The header now opens an in-memory provider picker, requests
browser discovery only when the user opens or refreshes it, escapes provider labels,
and binds account/network reset once for each selected provider. It clearly labels
connection as a non-transaction request and can clear the app’s active provider
without claiming to revoke wallet permissions. `T-WEB-01-WALLET-UX-04`, all 25 web
tests, root typecheck, production Vite build, targeted Prettier checks, and `git diff
--check` pass. No credential, storage, relay, or signer path was added.

## WEB-04-DEADLINE-01 work-item record

ID: `WEB-04-DEADLINE-01`

Status: `complete`

Outcome: Make public lifecycle copy fail closed when the immutable commit deadline
has passed but a permissionless close transaction has not yet advanced the on-chain
state from OPEN.

Output files: direct public epoch/block reader in `apps/web/src/wallet.ts`,
deadline-aware lifecycle presenter in `apps/web/src/lifecycle.ts`, route copy in
`apps/web/src/main.ts`, focused tests, and this record.

Acceptance criteria: The browser reads both the immutable public deadline and a
Sepolia block timestamp; OPEN is presented as accepting signals only before that
timestamp; an elapsed deadline names the safe no-signal/permissionless-close state;
and unknown values fail closed. No local clock, indexer cache, wallet call, or
transaction is used for that conclusion.

Privacy/custody impact: Reads public contract and block data only. No owner value,
Nox input, wallet request, storage, or service data is introduced.

Funds location/recovery impact: Read-only. The elapsed-deadline copy directs users
to the existing permissionless close path and prevents an unsafe new signal attempt.

Checks: lifecycle mutation tests, `npm run test:web`, production web build, root
typecheck, and `git diff --check`.

Evidence location: source/test output and a later real Sepolia browser read; this
work does not claim G7.

Intended commit: `fix: prevent signals after public deadline`.

Rollback/failure action: Revert only the presenter/read expansion. Never substitute
a local-clock estimate or an application-controlled close action.

Completion evidence: `readPublicEpoch` now reads the epoch deadline and the observed
Sepolia block timestamp together. `presentLifecycle` represents elapsed OPEN epochs
as `Commit deadline reached`, tells users not to submit, and names the existing
permissionless close path. `T-WEB-04-DEADLINE-01`, all 26 web tests, root typecheck,
production Vite build, targeted Prettier checks, and `git diff --check` pass. No
wallet or chain write was performed. A production browser with no wallet provider
then refreshed DEP-02 directly from Sepolia at block `11384280`, rendered `Commit
deadline reached`, and emitted no console/exception event; its sanitized report is
`evidence/sepolia/G7/WEB-04-DEADLINE-DEP-02.json`.

## WEB-07-TARGETS-01 work-item record

ID: `WEB-07-TARGETS-01`

Status: `complete`

Outcome: Enforce usable interaction target sizes across route navigation and utility
actions, then verify the production browser at the required viewport and
reduced-motion settings without persisting visual media.

Output files: target-size styles in `apps/web/src/styles.css`, source assertions,
sanitized browser audit, and this record.

Acceptance criteria: Navigation links, text actions, release links, FAQ summaries,
and utility controls have a 44px minimum interaction height; keyboard focus reaches
the skip link; reduced motion disables decorative animation; and the primary public
routes have no horizontal overflow at 360px, 768px, 1280px, and 1440px. The audit
uses the production build, active public manifest, and direct Sepolia reads only.

Privacy/custody impact: No new data access or persistence. Browser checks carry no
wallet provider, confidential input, proof, key, or transaction request.

Funds location/recovery impact: No funds move. This slice affects only route
interaction presentation and preserves all recovery copy/actions.

Checks: focused source assertions, production browser audit, `npm run test:web`,
production web build, root typecheck, and `git diff --check`.

Evidence location: `evidence/sepolia/G7/WEB-07-*.json`; read-only evidence does not
satisfy G7 wallet requirements.

Intended commit: `test: audit accessible production navigation`.

Rollback/failure action: Revert only interaction styling/audit artifacts. Never add
a browser automation wallet, mock deployment, or stored viewport state.

Completion evidence: All named navigation and utility targets now carry the 44px
minimum size contract. The production browser read-only audit against active DEP-02
at block `11384300` found no horizontal overflow or undersized visible action at
360px, 768px, 1280px, or 1440px; its keyboard focus reached the skip link; the
deadline-safe lifecycle rendered; reduced-motion decoration duration was `0.001ms`;
and no console/exception event appeared. The sanitized no-screenshot report is
`evidence/sepolia/G7/WEB-07-RESPONSIVE-DEP-02.json`. `T-WEB-07-TARGETS-01`, all 27
web tests, root typecheck, production Vite build, targeted Prettier checks, and `git
diff --check` pass. This remains read-only evidence, not G7 wallet evidence.

## WEB-03 work-item record

ID: `WEB-03`

Status: `blocked`

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

Status: `blocked`

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

Status: `blocked`

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

Status: `blocked`

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

Status: `blocked`

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

Status: `blocked`

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

Blocker note: At Sepolia block `11384140`, DEP-02 remained OPEN with zero
participants and 492 seconds before its commit deadline. The production browser
read-only run is complete, but no user-approved externally unlocked EIP-1193 test
wallet is available for the required signal and recovery writes. Importing the
ignored deployment key into a browser, injecting a signing shim, or relaying wallet
requests through a local service would violate WEB-08's privacy/custody boundary.
No transaction was sent and no G7 claim is made. R-25 records this release blocker;
the next permitted action is the documented external-wallet run against a fresh open
release when such approval is available.

Current readiness note: DEP-02 has since passed its commit deadline. At Sepolia block
`11384319`, the explicit `DEP-03` command completed a read-only plan with a guarded
maximum cost of `13708638480017808` wei against `459756084534477420` wei remaining
in the committed ledger. It created no contract, manifest, ledger entry, or
active-release change. A fresh revision must be planned and deployed only once an
externally unlocked EIP-1193 Sepolia wallet is ready to complete the named browser
journey before the new pool deadline.

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

## WEB-08-DEPLOYMENT-02 work-item record

ID: `WEB-08-DEPLOYMENT-02`

Status: `complete`

Outcome: Prepare the next append-only Sepolia release command path without creating
a deployment, so the eventual browser-wallet run can use a fresh explicit release
ID rather than a stale shortcut.

Output files: protocol workspace command metadata, a pure static command-policy
test, the Sepolia deployment runbook, and this work-item record.

Acceptance criteria: The standard planner and sender accept a caller-supplied
`--release=DEP-<integer>` argument, no script embeds an old release ID, and the
runbook makes the read-only plan, guarded sender, verification, and promotion order
unambiguous. This preparation must not send a transaction, edit an existing manifest,
or change the active-release pointer.

Privacy/custody impact: None. The change only documents and validates command-line
argument forwarding; it adds no signer, browser provider, storage, backend, or
confidential input path.

Funds location/recovery impact: None. The slice performs no Sepolia write. A later
revision command remains guarded by the existing clean-tree, confirmation, budget,
and create-only manifest checks; an operator can simply leave the active release
unchanged if planning or verification fails.

Checks: `npm run --workspace @quitesignal/protocol test:deployment-plan`, root
typecheck, targeted Prettier validation, and `git diff --check`.

Evidence location: source/test output only. Any future revision requires its own
immutable manifest, spend-ledger entries, independent verification, and browser
evidence; this work item cannot satisfy G7.

Intended commit: `build: prepare explicit release revision commands`.

Rollback/failure action: Revert only the command metadata, static test, and runbook.
Do not send a replacement deployment, overwrite an immutable manifest, or move the
active-release pointer.

Completion evidence: The root command forwards caller arguments into the protocol
workspace; the protocol scripts no longer encode a prior release ID. `T-DEP-02-01`
locks both command boundaries and rejects a release identifier in every protocol
deployment command. The runbook specifies the exact read-only plan and guarded sender
sequence for a future explicit revision. No Sepolia transaction, manifest change, or
active-release promotion occurred.

## WEB-08-EVIDENCE-03 work-item record

ID: `WEB-08-EVIDENCE-03`

Status: `complete`

Prerequisite gates: G6 passed. This work prepares G7 evidence handling only and
cannot claim a browser journey without a real external-wallet run.

Outcome: Add a public-only evidence schema and independent verifier that can prove
the recorded browser receipt sequence belongs to verified Sepolia release manifests
while rejecting confidential/browser-sensitive fields.

Output files: verifier parser and read-only CLI, focused mutation tests, root command
metadata, the Sepolia browser runbook, this record, and the verification matrix.

Acceptance criteria: The verifier accepts only Ethereum Sepolia, explicit release
identifiers, verified manifest-bound pool and collateral addresses, unique successful
receipt hashes, an external EIP-1193 wallet declaration, and a zero-error/no-artifact
browser summary. It rejects raw calldata, plaintext, handles, proofs, signatures,
keys, RPC configuration, wallet-provider simulation, non-Sepolia, stale manifest,
wrong recipient, failed receipt, or non-permissionless recovery evidence. It never
generates, signs, or submits a transaction.

Negative cases: malformed schema, forbidden field/name, duplicate receipt, bad hash,
wrong release/pool/collateral binding, wrong transaction selector/recipient, failed
receipt, and an owner-only refund used as recovery evidence must fail closed.

Privacy/custody impact: The verifier reads public manifests and transaction receipts
only. Its evidence schema permits no form values, calldata, raw encrypted material,
proof, signature, secret, wallet credential, or RPC URL. It has no wallet provider,
storage, browser automation, signer, relayer, or transaction-write capability.

Funds location/recovery impact: None. It observes already-submitted public receipts.
A rejected evidence record leaves all on-chain funds and release pointers unchanged;
the operator follows the contract's documented recovery path rather than retrying
from verifier output.

Checks: verifier parser mutation tests, `npm run test:verifier`, root typecheck,
targeted Prettier validation, and `git diff --check`.

Evidence location: future create-only records at `evidence/sepolia/G7/WEB-08-*.json`.
This slice emits no G7 evidence and performs no Sepolia write.

Intended commit: `test: add browser evidence verifier`.

Rollback/failure action: Revert only the verifier/parser/runbook surface. Do not
replace rejected evidence with a mock wallet, local chain, simulated provider, or
browser-held key.

Completion evidence: `T-VERIFIER-WEB-08-01` accepts a public-only G7 record only
when its primary and recovery actions bind to immutable manifests and the required
receipt selectors. `T-VERIFIER-WEB-08-02` rejects an extra sensitive field, simulated
provider declaration, duplicate receipt, and owner-only refund selector. The
read-only verifier never writes to Sepolia or prints transaction input. This is
evidence infrastructure, not a browser run or G7 claim.

Status normalization: WEB-03 through WEB-07 retain their implemented source and
offline completion evidence, but their remaining live-browser acceptance criteria
are blocked by WEB-08, G7, and R-25. WEB-08 is blocked directly by R-25. They are not
active engineering slices while WEB-09 completes the dependency-independent local
participant experience.

## WEB-09 work-item record

ID: `WEB-09`

Status: `complete`

Prerequisite gates: G6 passed. Existing manifest, browser wallet, confidential-input,
public-reader, and owner-action boundaries are available. G7 remains blocked by R-25
and is not claimed by this slice.

Outcome: Deliver one coherent local participant experience that detects whether the
canonical Sepolia market is actionable, guides a user-controlled wallet through
obtaining valueless test collateral and wrapping it confidentially, gates signal
submission on real readiness, and exposes clear owner, terminal, and recovery next
actions without a mock state or application-held secret.

Output files: `apps/web/src/` participant-domain, rendering, wallet, and style files;
focused `apps/web/test/` coverage; the web package metadata only if required; this
work-item record; the decision log; and the risk register.

Acceptance criteria: The application presents the single canonical MVP market with
its chain-derived state, immutable deadline, condition, participant count, and
actionability. A connected Sepolia wallet can mint the manifest-bound valueless test
ERC-20, approve only the selected wrapping amount, wrap it 1:1 into confidential
collateral, refresh public and owner-authorized balances, and proceed to signal only
when the market is open and collateral is sufficient. Every wallet request is an
explicit step with receipt confirmation, disabled duplicate submission, progress,
failure, retry, and safe-next-action copy. Expired or terminal markets never expose
an enabled signal action. Owner reveal and terminal controls remain session-only and
state-aware. The UI includes a concise self-test checklist, truthful single-market
scope, responsive navigation, visible focus, reduced motion, and no dead link or
mock-data branch.

Negative cases: Reject malformed or mismatched underlying/wrapper manifest bindings,
wrong chain, no account, invalid amount, zero amount, insufficient confidential
collateral, expired market, pending wallet request, reverted/dropped receipt, and
denied owner ACL. Never continue from a failed mint/approve/wrap step, resubmit a
possibly pending signal blindly, label a receipt as protocol finality prematurely,
or expose raw confidential handles/proofs.

Privacy/custody impact: The faucet mints a public, valueless Sepolia test ERC-20 to
the explicitly connected account. Approval is limited to the user-selected amount;
wrapping transfers that public test amount into the immutable manifest-bound wrapper
and creates owner-authorized confidential collateral. Balance decryption occurs only
after an explicit owner action and remains in memory. There is no backend, relayer,
analytics, persistent account, plaintext signal store, app signer, or alternate ACL.

Funds location/recovery impact: Before mint, no test asset exists. After mint it is
public ERC-20 in the user's wallet; after approval it remains there until wrap; after
wrap it is confidential collateral owned by the user; after a confirmed callback it
is held by the pool under the documented pending/terminal recovery rules. Failures
always re-read public state before a retry. The faucet has no value claim and cannot
mint native Sepolia gas.

Commands/checks: focused web tests, `npm run test:web`, production web build, root
typecheck, `npm run check:offline`, targeted browser inspection at 360/768/1280/1440,
secret/dependency source scans, and `git diff --check`. No local chain or simulated
wallet output may be used as contract/privacy evidence.

Evidence path: source/test output and sanitized local browser inspection only. A
future externally unlocked wallet run must create the named G7 artifacts under
`evidence/sepolia/G7/`; WEB-09 cannot substitute for or claim G7.

Intended commit: `feat: complete the participant web journey`.

Rollback/failure action: Revert the participant cockpit and retain the immutable
contracts and manifest history. Never compensate with mock balances, a hidden faucet
signer, imported deployment key, persisted confidential values, or an unverified
pool. If the active release is expired, keep transaction actions disabled and follow
ADR-023 for a later explicitly budgeted append-only release.

Completion evidence: Commit `8469db5` adds a manifest-bound, user-controlled QSFC
test faucet flow, exact wrapper approval, confidential 1:1 wrapping, owner-only
asset-state refresh, wallet network switching, chain-derived market actionability,
signal preflight, and state-aware terminal controls. `T-WEB-09-01` through
`T-WEB-09-05` cover market closure, asset readiness, strict amount parsing,
faucet/wrapper binding, exact approval, and insufficient-collateral blocking. With
Node `v24.18.0` and npm `11.16.0`, `npm run test:web`, `npm run build:web`, and
`npm run check:offline` pass; the latter covers formatting, typecheck, Solidity
compile, verifier/SDK/automation/indexer tests, and secret scanning. A production
local build was inspected against the DEP-02 Sepolia manifest at desktop and 390px
width, with the chain-derived elapsed-deadline path safely disabling signal
submission. G7 remains unclaimed and blocked by R-25: an externally unlocked wallet
and a fresh, operator-published open release are still required for real browser
signal/recovery receipts.

## WEB-10 work-item record

ID: `WEB-10`

Status: `complete`

Prerequisite gates: G6 passed. WEB-09 provides the manifest-bound wallet, test-asset,
signal, owner, lifecycle, and recovery surfaces. G7 remains blocked for the canonical
release under R-25 and is not claimed by this item.

Outcome: Let a user-controlled Sepolia wallet create a fresh, immutable test market
through the verified canonical factory, so the local application can exercise a real
OPEN epoch without importing a deployer key, relying on a backend, or changing the
canonical active-release pointer.

Output files: `apps/web/src/` self-test launch, route, manifest, and
presentation modules; focused `apps/web/test/` coverage; this work-item record; the
decision log; and the risk register.

Acceptance criteria: The launcher derives the factory, wrapper, feed, threshold, and
factory runtime commitment from the validated manifest. It re-reads the current
Sepolia block, creates a unique salt in the browser, deploys only a standard immutable
resolution adapter with a future observation boundary, then creates exactly one
factory pool with a fresh 25-minute commit window, k=2, the canonical wrapper, and
bounded timeout/grace values. It waits for each receipt, verifies the factory and
created pool configuration, exposes the resulting public pool only in browser memory,
and hands it to the existing real asset, signal, lifecycle, position, and recovery
surfaces. A page reload clears the session market rather than persisting account or
private data; the displayed pool address remains public and independently inspectable.

Negative cases: Reject wrong chain/account, missing or runtime-mismatched factory,
missing feed/wrapper code, unexpected factory return, expired or unsafe derived
deadline, failed/replaced deployment receipt, incorrect pool binding, duplicate
action, and configuration mismatch after either receipt. Local or simulated-chain
output is never evidence. Never alter the canonical pointer or manifest, deploy a
token/wrapper/factory duplicate, accept a
caller-selected resolution outcome, send assets, hold a signer, or treat a self-test
pool as canonical G7 evidence.

Privacy/custody impact: The launcher uses a user wallet only for two explicit public
contract deployments. It receives no probability, stake, encrypted input, private
key, or Nox handle. The adapter has no asset or Nox access; the factory holds no
assets; the later existing signal path remains browser-local and user-owned.

Funds location/recovery impact: Launch writes consume only user-approved Sepolia gas.
Before a later signal, test collateral remains in the owner wrapper balance. Once a
signal is confirmed, the new immutable pool has the same documented custody and
permissionless recovery rules as the canonical product. A launch failure stops at the
last confirmed public receipt and does not mutate or replace existing releases.

Commands/checks: focused launcher and source-boundary tests, `npm run test:web`,
production web build, root typecheck, `npm run check:offline`, sanitized local browser
inspection, `npm run check:sepolia:read`, and `git diff --check`. No user launch is
performed by development automation; local or simulated-chain output is not evidence.

Evidence path: source/test output and sanitized browser inspection only. Any user
launch receipt is public but outside the canonical evidence ledger until independently
verified under a dedicated release/evidence record.

Intended commit: `feat: add a permissionless self-test market`.

Rollback/failure action: Remove the self-test launcher and session route while
retaining canonical Web-09 functions. Do not replace it with a stored key, relayer,
mock pool, static address, automatic deployment, or mutation of the active-release
pointer.

Completion evidence: The browser validates the manifest-bound factory runtime,
wrapper, and feed before requesting the first user-approved transaction. It deploys
one adapter, rereads every immutable adapter input and the feed runtime binding, then
creates and rereads one factory pool. Internal SPA navigation keeps this public pool in
memory through its asset, signal, lifecycle, and owner routes; a browser reload clears
it. `T-WEB-10-01` through `T-WEB-10-03`, all 35 web tests, production build,
`npm run check:offline`, `npm run check:sepolia:read`, and sanitized desktop/mobile
browser inspections pass. No launch transaction was sent during development, and this
completion is not G7 evidence.

## WEB-11 work-item record

ID: `WEB-11`

Status: `complete`

Prerequisite gates: WEB-10 is complete. G7 remains blocked for the canonical
release under R-25 and is not claimed by this item.

Outcome: Let a second user independently open a public self-test-pool link and use
the existing real participant journey, so the k=2 cohort is possible across browser
sessions without a backend, static pool registry, or shared wallet.

Output files: `apps/web/src/` self-test validation and route modules, focused
`apps/web/test/` coverage, this work-item record, the decision log, and the risk
register.

Acceptance criteria: `/self-test/join/:pool` accepts only a syntactically valid
Sepolia address and establishes session context only after public reads prove the
pool's `poolId` maps back to the manifest-bound factory, its immutable wrapper,
timeouts, k=2 gate, adapter feed/runtime hash/comparison/threshold, and observation
boundary match the fixed self-test policy, and the address is not the canonical pool.
The route requests no wallet permission
until a participant selects an existing explicit action. It displays an inspectable
public pool address, never persists it or treats it as a canonical release, and makes
the existing asset, signal, lifecycle, owner, claim/refund, and recovery screens use
the verified pool. Invalid, foreign, mismatched, unavailable, or stale pools fail
closed without a transaction.

Privacy/custody impact: The join route reads public on-chain code, configuration,
and lifecycle only. It does not collect, persist, or transmit wallet accounts,
signals, balances, handles, proofs, or keys. Later wallet actions retain their
existing explicit user approval and contract-defined custody/recovery behavior.

Funds location/recovery impact: Joining is read-only. It cannot create a pool or
move collateral. A failed validation leaves the user on a safe, transaction-free
state; a verified pool retains the immutable protocol recovery path.

Commands/checks: focused route/validation tests, `npm run test:web`, production web
build, root typecheck, `npm run check:offline`, sanitized browser inspection,
`npm run check:sepolia:read`, and `git diff --check`. No user transaction is sent by
development automation and local/simulated output is not evidence.

Evidence path: source/test output and sanitized browser inspection only. A joined
pool is not a release record or G7 evidence.

Intended commit: `feat: add verified self-test participant links`.

Rollback/failure action: Remove only the public join route and retain the existing
local launcher. Do not add a backend registry, stored wallet, unverified address
parameter, automatic wallet request, or mutable canonical pointer.

Completion evidence: `/self-test/join/:pool` now establishes session context only
after reading the pool's `poolId`, matching it to the manifest-bound factory, and
checking its wrapper, fixed timeout/k policy, adapter condition, feed runtime binding,
and observation boundary. It explicitly rejects the canonical pool and unknown-code
addresses before any wallet action. `T-WEB-11-01` and `T-WEB-11-02`, all 37 web
tests, production build, direct Sepolia rejection checks for canonical and
unknown-code addresses, `npm run check:offline`, `npm run check:sepolia:read`, and
sanitized desktop/mobile browser inspections pass. No user transaction was sent and
this is not G7 evidence.

## WEB-13 work-item record

ID: `WEB-13`

Status: `complete`

Prerequisite gates: WEB-09 through WEB-12 are complete. This information-architecture
slice cannot claim G7.

Outcome: Replace the nested Workspace navigation with a clear, direct task bar and
move the permissionless lifecycle cockpit out of Market, so users can move between
market facts, collateral, signal, lifecycle, owner position, verification, and
self-test without a crowded one-page workflow.

Output files: `apps/web/src/main.ts`, `apps/web/src/styles.css`, focused web route
and visual-source tests, this work-item record, the decision log, and relevant risk
or design traceability updates.

Acceptance criteria: The persistent header exposes direct, labelled routes for
Overview, Market, Assets, Signal, Lifecycle, Position, Verify, and Test. The Guide is
absorbed into the landing page; legacy guide links safely return to Overview rather
than leaving an unmaintained task surface. Market contains only immutable market facts
and the next contextual links. Lifecycle contains public state, all eligible
permissionless actions, recovery copy, and refresh. Position remains owner-only.
Canonical and session-bound self-test routes preserve the selected pool context.
Every button uses one legible control system with consistent sizing, contrast,
keyboard focus, disabled states, and responsive wrapping; no navigation or action
submits a transaction without an explicit user click.

Privacy/custody impact: Route and visual reorganization only. No new data is read,
stored, logged, or transmitted. Existing wallet, Nox, owner-decrypt, proof, asset,
and lifecycle action boundaries remain unchanged.

Funds location/recovery impact: Navigation cannot move funds. Lifecycle action
controls retain their prior explicit wallet/receipt gates and recovery copy; separating
them from Market must not hide a terminal or refund path.

Commands/checks: focused route/source tests, `npm run test:web`, production build,
root typecheck, `npm run check:offline`, sanitized desktop/mobile browser inspection,
and `git diff --check`.

Evidence path: source/test output and sanitized browser inspection only. This
presentation slice is not G7 evidence.

Completion evidence (2026-07-31): `npm run test:web` passed 39 tests; `npm run
build:web` and root `npm run typecheck` passed; `npm run check:offline` passed;
`git diff --check` passed. Sanitized desktop inspection of the dedicated Lifecycle
route and mobile inspection of Overview confirmed readable, wrapping task navigation,
separate lifecycle controls, and the single Orchid action treatment. No transaction
was requested or sent.

Intended commit: `feat: simplify task navigation`.

Rollback/failure action: Restore the prior route links only; do not substitute an
overlay, hidden menu, backend router, stored navigation state, or transaction shortcut.

## WEB-14 work-item record

ID: `WEB-14`

Status: `complete`

Prerequisite gates: WEB-13 is complete. This presentation-only slice cannot claim G7.

Outcome: Keep the direct task bar available while users read long Market, Lifecycle,
or landing content, without obscuring content or changing route, wallet, or protocol
behavior.

Output files: `apps/web/src/styles.css`, focused responsive/source coverage,
`DESIGN.md`, and this work-item record.

Acceptance criteria: The task bar remains at the viewport top while its page scrolls,
uses an opaque surface and separator above content, preserves keyboard navigation and
current-route indication, and wraps without horizontal clipping at the mobile
viewport. It cannot cover the skip link or change a route's transaction behavior.

Privacy/custody and funds/recovery impact: None. This CSS-only change introduces no
new read, write, persistence, authority, or funds path.

Commands/checks: focused source test, `npm run test:web`, production build, root
typecheck, `npm run check:offline`, sanitized desktop/mobile scroll inspection, and
`git diff --check`.

Evidence path: source/test output and sanitized browser inspection only. This
presentation slice is not G7 evidence.

Completion evidence (2026-07-31): `npm run test:web` passed 39 tests; `npm run
build:web` and `npm run check:offline` passed; `git diff --check` passed. A sanitized
browser scroll check confirmed the task bar moves from desktop `top: 82` to `top: 0`
after a 1,400px scroll and from mobile `top: 72` to `top: 0`; the 390px viewport had
no horizontal overflow. No wallet request or transaction was made.

Intended commit: `feat: pin task navigation`.

Rollback/failure action: Remove the sticky positioning and restore normal task-bar
flow; do not substitute JavaScript scroll tracking or a persistent browser store.

## WEB-15 work-item record

ID: `WEB-15`

Status: `in_progress`

Prerequisite gates: WEB-10 through WEB-14 are complete. This user-created test-market
surface is separate from the canonical release and cannot claim G7.

Outcome: Let a creator enter bounded public self-test values for ETH/USD condition,
commit duration, and participant gate. Keep the manifest-bound factory,
feed, wrapper, timeout, recovery, and network rules fixed; make the selected public
configuration part of the shared join URL and verify the immutable pool/adapter facts
before a join route opens participant actions.

Output files: `apps/web/src/self-test.ts`, `apps/web/src/main.ts`,
`apps/web/src/styles.css`, focused self-test and route tests, this work-item record,
the decision log, `DESIGN.md`, and `vercel.json`.

Acceptance criteria: A creator can enter a positive ETH/USD threshold from $1 to
$1,000,000 (up to 8 feed decimals), a `greater-or-equal` or `less-than` comparison,
a 5-minute to 14-day commit window, and a 2–20 participant gate. The adapter and pool use
the selected immutable condition and cohort gate, with a bounded commit window. The
join link preserves the public selections; the second participant rejects
an invalid link, a non-factory pool, mismatched condition/gate, changed fixed timeout,
or invalid observation boundary without asking a wallet to sign. No selected value is
private, no value is persisted, and a custom self-test cannot be presented as the
canonical release.

Privacy/custody and funds/recovery impact: The public configuration is in a URL and
on-chain adapter/pool state only. No new confidential input, authority, custody,
persistence, asset flow, or recovery transition is introduced.

Commands/checks: focused self-test/route tests, `npm run test:web`, production build,
root typecheck, `npm run check:offline`, sanitized two-browser join inspection, and
`git diff --check`.

Evidence path: source/test output and sanitized browser inspection only. This
presentation slice is not G7 evidence.

Intended commit: `feat: customize self-test markets`.

Rollback/failure action: Restore the fixed self-test values and reject custom query
parameters; do not retain selected values in a browser store or bypass factory and
adapter verification.

Navigation extension: The same slice uses Overview, Markets, Portfolio, and Create.
Markets is the single selected-pool action surface; Portfolio retains wallet-level
collateral controls; Create deploys one pool at a time. The canonical pool and
session-verified self-test pools can be selected without an unverified address list or
durable browser storage. A direct shared URL remains a factory-verified second-participant
handoff, but Create does not expose an address-entry control.

Balance extension: The global header reads only connected-wallet public Sepolia ETH and
QSFC facts. It masks QSCC until an explicit Reveal click requests owner-only access;
the revealed value remains in memory for the current session only.

Market-centric extension: Replace the global Signal, Verify, Lifecycle, and Position
navigation with a verified Market directory and selected-pool panels. The directory
shows the canonical pool plus self-test pools created or verified in the current
browser session; it does not become an unverified address registry or a durable store.
Each selected-pool panel keeps the existing public/owner-only boundary, explicit wallet
confirmation, and chain-derived eligibility checks. Portfolio holds the compact
wallet-level asset controls, ETH/QSFC/QSCC balance summary, explicit QSCC reveal, and
links back to a selected pool position.

The Market directory lists the canonical pool and verified self-test pools available in
the current browser session or public registry. Selecting a pool updates the right-hand
detail column without navigation; the left list remains sticky during scrolling. Create
deploys one real verified market per explicit user action and never lists a pool before
verification.

Pooled-local extension output files: `ops/scripts/create-self-test-pools-sepolia.mts`,
`deployments/sepolia/verified-self-test-pools.json`, and `apps/web/src/main.ts` registry
loader. Checks: Node 24/NPM 11 Sepolia preflight, spend-budget validation, per-write
gas estimate, confirmed receipt, factory/config readback, and `git diff --check`.
Evidence: sanitized pool receipt summary plus append-only spend-ledger entries. Privacy
impact: registry records public addresses and public immutable configuration only;
private keys and all confidential data remain absent. Recovery: a failed deployment
stops the sequence, preserves already verified pools, and never changes canonical
release state. Intended commit: `feat: add verified local test pools`.

Interaction-safety extension: While any wallet connection, owner authorization,
signature request, or receipt wait is active, the browser disables every competing
button, input, selection, and navigation link. A compact upper-right live notification
reports pending, confirmed, or error state. The lock is browser-memory-only and is
released on either outcome; it neither persists nor changes custody, privacy, protocol
state, or recovery rules.

Lifecycle discoverability extension: The Lifecycle surface lists every
contract-defined permissionless action after a direct public state read. Only actions
eligible in that exact state are enabled; each unavailable action remains visibly
disabled and explains its public prerequisite in both adjacent copy and a keyboard-
accessible hover/focus tooltip. The transaction client still revalidates the selected
action immediately before any wallet request. The seven controls are grouped visually
into `Advance lifecycle` and `Recovery paths`; grouping does not combine transactions
or change contract state transitions.

Creator-history extension: Portfolio replaces its session-derived verified-pool list
with the pools created through this browser by the currently connected wallet. The
browser records the public pool address and public policy in memory only after its own
factory creation flow verifies immutable configuration. It stores neither the result
nor a wallet identifier after the current browser memory is reset, and it never infers
creator ownership from an arbitrary pool address.

Global-directory extension (`WEB-15-GLOBAL-01`): Markets discovers every compatible
pool emitted by the manifest-bound factory from its recorded Sepolia deployment block
through the explicitly connected EIP-1193 provider. Every event candidate must be
revalidated against the factory mapping, pool configuration, collateral wrapper,
resolution adapter, Chainlink feed, fixed timeout/recovery policy, and supported public
condition bounds before it is listed. The static verified registry remains a
wallet-free bootstrap, while the connected-wallet scan makes a newly created pool
visible to other accounts and browsers without a backend or browser persistence.

Output files: `apps/web/src/self-test.ts`, `apps/web/src/main.ts`, focused self-test and
resilience tests, this work-item record, the decision log, risk register, and source
register.

Acceptance criteria: A successful wallet connection and the Markets refresh control
scan `PoolCreated` logs in bounded block ranges; compatible pools appear once, remain
selectable in the two-column Market surface, and show their immutable deadline. A log
or arbitrary address alone is insufficient for listing. A failed scan preserves the
canonical market and already verified static/session pools, reports a retryable public
read failure, requests no signature, and moves no funds.

Privacy/custody impact: The wallet provider receives only public chain id, block, log,
bytecode, and contract-call queries after the user has connected it. No account is
included in discovery calls; no confidential value, signature, transaction, durable
store, backend, or indexer is introduced. Pool creation and every lifecycle action keep
their existing explicit wallet confirmations.

Recovery/rollback: On provider or log-range failure, retain the static verified
registry and session-created entries and allow an explicit retry. Revert the discovery
reader and connection/refresh hooks to restore static-only listing without changing any
on-chain state.

Checks and evidence: focused deterministic discovery tests, `npm run test:web`,
`npm run typecheck`, `npm run build:web`, and `git diff --check`; sanitized read-only
Sepolia discovery output when an archive-capable connected provider is available. This
slice is not G7 evidence.

Intended commit: `feat: discover verified markets globally`.

Completion evidence (2026-08-01): `PoolCreated` discovery now scans bounded Sepolia
factory ranges through the connected EIP-1193 provider, validates every candidate's
factory mapping and immutable pool/adapter bindings, deduplicates it into the existing
Market directory, and preserves existing entries on failure. The Market refresh icon
and successful wallet connection invoke the same read-only sync. Focused discovery
tests, all 50 web tests, root typecheck, production web build, targeted Prettier, and
`git diff --check` passed. The broader offline gate remains environment-blocked at the
protocol Hardhat compile because this runner has Node 20.12.2 while Hardhat requires
Node 22.13+; no wallet request or Sepolia write was made by this slice.

Compact filter extension: The Market directory keeps `All pools` as its default and
places one client-only filter inside a collapsed native details control. It offers
condition direction, participant gate, and short/long commit-window choices without
changing the selected pool or reading any additional private state. The selected pool
remains visible while a filter is active so the right-hand action surface never loses
context.

Output files: `apps/web/src/main.ts`, `apps/web/src/styles.css`,
`apps/web/test/landing-navigation.test.ts`, and this work-item record.

Checks: focused web tests, production build, typecheck, targeted formatting, and
`git diff --check`. Intended commit: `feat: add compact market filters`.

Create-surface simplification extension: Replace the user-facing Test Lab name with
Create, remove the manual address-entry/join control and ten-market batch deployment,
and label the remaining action `Create verified market`. Keep the direct factory-verified
shared URL for a second participant because it is a safe, explicit handoff and does not
make the Market directory an unverified address registry.

Output files: `apps/web/src/main.ts`, `apps/web/src/styles.css`,
`apps/web/test/self-test.test.ts`, `apps/web/test/landing-navigation.test.ts`,
`apps/web/test/signal.test.ts`, this work-item record, and `DESIGN.md`.

Acceptance criteria: The primary navigation says Create; the Create route contains one
bounded deployment form and one `Create verified market` action. It contains neither a
manual pool-address field, a join button, nor a ten-market batch action. Existing shared
URLs still verify immutable factory and configuration facts before opening a market.

Privacy/custody and recovery impact: None. This removes optional local controls only;
the shared-URL verification boundary, pool state, asset custody, and recovery paths are
unchanged.

Commands/checks: `npm run typecheck`, `npm run test:web`, `npm run build:web`, and
`git diff --check`.

Evidence path: focused source tests and production build output. No wallet request or
Sepolia write is required for this presentation-only change.

Rollback/failure action: Restore only the removed Create controls and their matching
tests/styles; do not weaken direct shared-URL verification or add unverified pool
discovery.

Intended commit: `refactor: simplify market creation surface`.

Public-read resilience extension: Lifecycle reads continue to prefer the documented,
wallet-free Sepolia public RPC. When that read fails and the user has already connected
a Sepolia wallet, the browser retries the same public contract/block reads through that
wallet's EIP-1193 provider. The fallback asks for no signature, sends no transaction,
and is labelled in the lifecycle status. Lifecycle writes use the same fallback only
to revalidate public eligibility before their already-explicit wallet transaction.

Output files: `apps/web/src/wallet.ts`, `apps/web/src/main.ts`,
`apps/web/test/lifecycle.test.ts`, and this work-item record.

Acceptance criteria: A transient public-RPC failure does not degrade a connected
user's lifecycle view if their Sepolia wallet can serve the identical public reads.
Without either source, the existing fail-closed state remains. No fallback exposes
owner values, persists data, or changes the transaction/receipt requirements.

Privacy/custody and recovery impact: None. Both sources expose only public chain data;
the connected wallet remains user-controlled and receives no signing request from a
read fallback. Contract state and recovery eligibility are unchanged.

Commands/checks: `npm run typecheck`, `npm run test:web`, `npm run build:web`, direct
Sepolia lifecycle reads for the affected pool, and `git diff --check`.

Evidence path: source/test output plus a read-only Sepolia snapshot. No write is
required for this reliability change.

Rollback/failure action: Remove the provider fallback and retain the original
fail-closed public-RPC behavior; do not fall back to an application server, indexer,
or private data source.

Intended commit: `fix: recover lifecycle reads through wallet provider`.

Owner-commitment guard extension: Before enabling a forecast for a connected wallet,
the browser reads only that caller's `ownerPosition.committed` boolean through its
EIP-1193 provider. It never decrypts, renders, persists, or logs the opaque position
handles. A committed owner sees a disabled `Forecast already submitted` control; the
same guard is checked again immediately before encryption, and a confirmed finalization
locks the form in browser memory. The guard is refreshed after wallet connection and
public lifecycle refresh, so a later visit detects an existing forecast without an
explicit position reveal.

Output files: `apps/web/src/wallet.ts`, `apps/web/src/main.ts`,
`apps/web/test/signal.test.ts`, and this work-item record.

Acceptance criteria: A connected owner who has already committed cannot submit a second
forecast through the UI, both during the current session and after reconnecting/reloading.
The form names the reason and directs the user to the owner-only position panel. A wallet
that has not committed can submit while the immutable public commit window is open.

Privacy/custody and recovery impact: The added read is owner-bound and returns no
plaintext. It introduces no signature, transaction, persistence, private-key access,
custody, or recovery-state change. The contract remains the authoritative final guard
against a duplicate commit.

Commands/checks: `npm run typecheck`, `npm run test:web`, `npm run build:web`, direct
Sepolia read of the committed pool, and `git diff --check`.

Evidence path: source/test output and a read-only owner-bound call from a user-controlled
wallet. No new write is required.

Rollback/failure action: Remove the UI preflight while preserving the contract's
`AlreadyCommitted` guard; do not replace the owner-bound call with persisted browser
state or an application service.

Intended commit: `feat: guard duplicate forecast submissions`.

Selected-market refresh extension: Add a compact, icon-only refresh control beside
the Markets title. It refreshes only the currently selected pool through the same
public lifecycle reader as the Lifecycle panel; it never requests a signature or
submits a transaction.

Output files: `apps/web/src/main.ts`, `apps/web/src/styles.css`,
`apps/web/test/landing-navigation.test.ts`, `DESIGN.md`, and this work-item record.

Acceptance criteria: The Markets title has an accessible compact refresh control,
with a visible tooltip label, that updates the selected pool rather than treating the
click event as a pool address. Its state remains subject to the global interaction
lock.

Privacy/custody and recovery impact: None. The control invokes existing public reads
only and changes no protocol or wallet state.

Commands/checks: `npm run typecheck`, `npm run test:web`, `npm run build:web`, and
`git diff --check`.

Evidence path: focused source test and production build output. No wallet request or
Sepolia write is required.

Rollback/failure action: Remove the icon control and listener; retain the Lifecycle
refresh control and public-read behavior unchanged.

Intended commit: `feat: add selected market refresh control`.

Lifecycle-refresh simplification extension: Replace the repeated text `Refresh public
state` controls inside Lifecycle with one compact icon-only control beside the
`{ public lifecycle action }` label. Keep the accessible label, title, and existing
public-read handler so the control remains discoverable without taking a full action row.

Output files: `apps/web/src/main.ts`, `apps/web/src/styles.css`,
`apps/web/test/lifecycle.test.ts`, `DESIGN.md`, and this work-item record.

Acceptance criteria: Each Lifecycle surface has one small icon refresh control and no
duplicate text refresh button. The control refreshes the selected pool and does not
request a signature or submit a transaction.

Privacy/custody and recovery impact: None. This is a presentation-only reduction over
the existing public read.

Commands/checks: `npm run typecheck`, `npm run test:web`, `npm run build:web`, and
`git diff --check`.

Evidence path: source tests and production build output.

Rollback/failure action: Restore the text label while retaining the same read-only
handler if the icon-only control fails accessibility review.

Intended commit: `refactor: compact lifecycle refresh control`.

Production-routing extension: Deploy the Vite application through the existing
Vercel project with a catch-all SPA rewrite so every documented route remains
shareable and refresh-safe. The rewrite serves the same production `index.html` for
client routes while Vercel continues to serve existing static assets and public
release JSON files directly.

Output files: `vercel.json`, `apps/web/test/resilience.test.ts`, and this work-item
record.

Acceptance criteria: `/markets`, `/portfolio`, `/self-test`, `/position`, pool, and
verification URLs return the production application when opened directly or
refreshed. Existing assets, `active-release.json`, release manifests, and the public
self-test registry remain independently fetchable. The deployment is created by the
authorized Vercel CLI account without Git attribution until the repository author is
linked to the Vercel team.

Privacy/custody and recovery impact: None. Routing changes only static application
delivery and introduces no backend, signer, storage, confidential input, wallet
authority, or recovery transition.

Commands/checks: focused rewrite assertion, `npm run test:web`, root typecheck,
production build, Vercel production deploy, direct-route HTTP/browser inspection,
and `git diff --check`.

Evidence path: Vercel deployment status and public HTTP smoke checks only. This is
deployment evidence, not a substitute for the wallet-held G7 journey.

Rollback/failure action: Remove the catch-all rewrite and restore the previous
deployment; never replace client routing with a stateful application backend.

Intended commit: `fix: preserve application routes on vercel`.

## WEB-16 work-item record

ID: `WEB-16`

Status: `complete`

Prerequisite gates: WEB-01 through WEB-15 are implemented; this is a browser-only
resilience and accessibility correction slice and does not claim G7 evidence.

Outcome: Preserve user-entered Create-market drafts across renders and failed
preflights, keep optional public self-test registry reads from blocking the canonical
first render, and close the audited accessibility, deadline, formatting, and wallet
menu interaction gaps.

Output files: `apps/web/src/main.ts`, `apps/web/src/styles.css`, focused web tests,
this work-item record, and any affected visual-system documentation.

Acceptance criteria: The Create form renders from an explicit draft policy while a
new market is being configured; no-wallet, validation, RPC, and wallet failures retain
the draft; an optional registry cannot delay the canonical route or leave an infinite
loading state; registry failure is visible and retryable; primary controls meet text
contrast requirements; market durations and deadlines use human-readable units with
an explicit timezone; the 14-day preset is available; and the wallet menu supports
keyboard and outside-click dismissal without changing wallet authority or custody.

Negative cases: A registry failure must not fabricate a pool or replace canonical
market facts; a hung manifest/registry read must fail closed without enabling wallet
actions; invalid Create input must preserve the draft and identify the safe next step;
and no confidential value may enter URLs, storage, logs, or evidence.

Privacy/custody impact: Presentation and public-read timing only. No confidential
input, wallet credential, signer authority, storage, analytics, backend, or protocol
state transition is introduced.

Funds location/recovery impact: No transaction is created by this slice. Existing
wallet and contract recovery paths remain authoritative; failed UI preflights leave
funds unmoved and retain a retry-safe public state.

Commands/checks: focused web tests, `npm run test:web`, `npm run build:web`, root
typecheck, targeted formatting, responsive browser inspection at 360/768/1280/1440,
and `git diff --check`.

Evidence path: sanitized source/test output and read-only responsive inspection;
no Sepolia write is required.

Intended commit: `fix: harden audited web ux states`.

Rollback/failure action: Revert only the browser presentation/state corrections;
retain the manifest validation boundary, direct public reads, contract guards, and
wallet receipt requirements.

Completion evidence (2026-08-01): Commit `8628815` preserves Create drafts through
no-wallet and render-error paths, separates published registry pools from the Create
form, renders the canonical route before optional registry verification, bounds
manifest/registry reads with abortable retries, adds visible registry/release recovery,
uses accessible action contrast, adds human-readable durations/deadlines and the
14-day preset, and adds Escape/outside-click wallet-menu dismissal. Focused WEB-16
source tests, all 47 web tests, root typecheck, `npm run lint`, production build,
responsive headless checks at 360/768/1280/1440, and `git diff --check` passed. The
build still reports the pre-existing Node 20.12.2 versus Vite's 20.19+ requirement;
the artifact was generated successfully.

## WEB-12 work-item record

ID: `WEB-12`

Status: `complete`

Prerequisite gates: WEB-09 through WEB-11 are complete. G7 remains blocked for the
canonical release under R-25 and is not claimed by this item.

Outcome: Expose every contract-defined permissionless lifecycle action in the
browser, so any connected Sepolia wallet can advance a valid public epoch or invoke
its timeout recovery without a keeper, backend, private input, or opaque manual ABI
call.

Output files: `apps/web/src/` lifecycle action client/presentation modules, focused
`apps/web/test/` coverage, this work-item record, the decision log, and the risk
register.

Acceptance criteria: Direct public reads derive actions only from the immutable
pool state, current block timestamp, pending timeout, configured timeouts/grace, and
adapter observation boundary. The UI exposes only valid explicit-wallet actions:
expire a timed-out pending commit, close a passed deadline, request aggregate public
decryption, finalize an available aggregate with two Nox attestations, settle after
the observation boundary, and both contract-defined cancellation paths when eligible.
Each action is revalidated immediately before submit, awaits a successful receipt,
reports that no private value was read or stored, and refreshes public state. The
aggregate finalizer may request only the two public-decryption handles returned by
the pool after a request; it must never display, log, persist, or place a decrypted
value/proof in a URL. Invalid state, stale timing, missing request, unavailable proof,
revert, replacement, RPC loss, and wallet rejection fail closed without a claim of
finality.

Privacy/custody impact: Lifecycle state, timestamps, action kind, and final aggregate
facts are public. The browser does not receive owner signal, collateral, handle, key,
or score plaintext; aggregate proof bytes are transient transaction data only. Every
write remains explicit from the user's EIP-1193 wallet, and no application account,
relayer, or keeper receives authority or custody.

Funds location/recovery impact: Lifecycle writes move no user-selected collateral
outside the immutable pool/wrapper rules. Timed-out pending callbacks return through
the contract; below-k and stalled aggregate/feed paths enter the existing refundable
state, where each owner uses the existing owner-only refund action. Failed browser
actions leave chain state authoritative and direct the user to refresh before retry.

Commands/checks: focused state/action and source-boundary tests, `npm run test:web`,
production web build, root typecheck, `npm run check:offline`, sanitized browser
inspection, `npm run check:sepolia:read`, and `git diff --check`. No user transaction
is sent by development automation and local/simulated output is not evidence.

Evidence path: source/test output and sanitized browser inspection only. Real user
receipts remain required for G7.

Intended commit: `feat: add permissionless lifecycle actions`.

Rollback/failure action: Remove only the browser action controls and retain public
read/owner routes. Do not add a keeper, backend signer, relayer, stored proof,
automatic transaction, or alternate recovery state.

Completion evidence: The web now derives eligible permissionless actions from direct
Sepolia reads and revalidates them before a wallet request. It supports timed-out
pending-commit expiry, close, aggregate request/finalization, both refundable
timeouts, and immutable-adapter settlement; aggregate proof material is transient.
It also corrects the public `COMMIT_PENDING` label and recovery guidance. `T-WEB-12-01`
and `T-WEB-12-02`, all 39 web tests, a direct Sepolia lifecycle snapshot, production
build, `npm run check:offline`, `npm run check:sepolia:read`, and sanitized browser
inspection pass. No user transaction was sent and this is not G7 evidence.

## Primary route contract

Required routes or equivalent framework views:

- `/markets`: chain-derived available pools with explicit network state.
- `/pool/:address`: immutable market facts, deadline, k-status, public lifecycle.
- `/pool/:address/signal`: encrypted probability/stake journey.
- `/position`: connected-owner private decrypt, score, claim/refund status.
- `/verify/:address`: manifest, code hashes, public invariants, evidence references.
- `/self-test`: session-only user-wallet launch of a fresh public test pool.
- `/self-test/join/:pool`: factory-verified public entry to a shared self-test pool.
- `/self-test/assets`, `/self-test/signal`, `/self-test/position`: existing
  participant functions bound to that in-memory pool.

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
