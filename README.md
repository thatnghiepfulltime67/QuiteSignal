# QuietSignal

QuietSignal is a confidential participation layer for open prediction markets.
Users submit an encrypted forecast and conviction; the system reveals only a
sufficiently large aggregate that the market can consume. Individual position,
size, and personal score remain decryptable only by the wallet owner.

The product is a browser dApp backed by Ethereum Sepolia contracts and iExec Nox.
The public protocol remains unchanged; the adapter owns the boundary between public
resolution and confidential accounting.

## Try the deployed dApp

Open [quitesignal.vercel.app](https://quitesignal.vercel.app) with a Sepolia wallet.
The app does not use mock state for its primary routes. Wallet signing, encryption,
receipts, public lifecycle reads, and owner-only views are performed in the browser.

## Repository map

- [`Plan.md`](Plan.md) — execution source of truth and gate status.
- [`DESIGN.md`](DESIGN.md) — visual, responsive, accessibility, and motion rules.
- [`docs/setup.md`](docs/setup.md) — clean-install and Sepolia setup.
- [`docs/usage.md`](docs/usage.md) — user journeys and privacy boundary.
- [`docs/deployment.md`](docs/deployment.md) — contract and Vercel deployment procedure.
- [`docs/security.md`](docs/security.md) — threat model, limitations, and claim policy.
- [`docs/verification.md`](docs/verification.md) — verification matrix and evidence commands.
- [`feedback.md`](feedback.md) — competition submission feedback on iExec/Nox.

## Local development

```sh
nvm use
npm ci
cp .env.example .env
npm run doctor
npm run build:web
npm run dev:web
```

The local server is for UI development. Contract, Nox, ACL, confidential-asset,
lifecycle, recovery, and release evidence must use Ethereum Sepolia; never use a
local blockchain as protocol evidence.

## Verification quickstart

```sh
npm run format:check
npm run typecheck
npm run test:web
npm run test:verifier
npm run test:sdk
npm run test:automation
npm run test:indexer
npm run scan:secrets
npm run check:sepolia:read
```

The commands that submit transactions are separately named and guarded by the
Sepolia spend ledger. Read [`docs/verification.md`](docs/verification.md) and
[`docs/setup-sepolia.md`](docs/setup-sepolia.md) before running any write command.

## Principles

1. Privacy claims never exceed the available evidence.
2. The public market remains composable; privacy lives in the adapter layer.
3. No backend, relayer, or indexer is required for correctness or fund recovery.
4. A real Sepolia end-to-end flow is the standard for release verification.
