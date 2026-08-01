# Setup

## Requirements

- Node `v24.18.0` and npm `11.16.0` (see `.nvmrc`).
- A Sepolia RPC endpoint for read checks.
- A disposable Sepolia wallet only when running a named write case.
- Git and a clean checkout.

## Install

```sh
nvm install
nvm use
npm ci
cp .env.example .env
```

For UI-only work, `SEPOLIA_RPC_URL` may remain empty because the app uses the
published public manifest. For protocol or read verification, set it to a
Sepolia endpoint. Never commit `.env` or a private key.

## Preflight

```sh
npm run doctor
npm run budget:status
npm run check:sepolia:read
```

The doctor checks the exact runtime, pinned Nox mapping, Sepolia chain id, live
Nox bytecode, and the committed spend ledger. A failed preflight blocks writes.
Wallet safety and spend rules are defined in [`setup-sepolia.md`](setup-sepolia.md).

## Development server

```sh
npm run dev:web
```

This starts the Vite browser app. Use a Sepolia wallet for any transaction and
keep confidential fields out of logs, screenshots, browser storage, and analytics.
