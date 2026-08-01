# Deployment

## Sepolia contracts

Contract deployment is append-only and guarded. From a clean checkout:

```sh
npm ci
npm run doctor
npm run deploy:sepolia:plan -- --release=DEP-<next-id>
```

Review the immutable feed, wrapper, adapter, factory, deadline, gas estimate, and
remaining ledger allowance. A write requires a separate explicit confirmation:

```sh
CONFIRM_SEPOLIA_WRITE=yes npm run deploy:sepolia:write -- --release=DEP-<same-id>
```

Never overwrite an existing manifest or reuse an address. Verify a completed
deployment with `npm run verify:protocol:sepolia -- --manifest=<manifest>` and
publish only the sanitized manifest under `deployments/sepolia/`.

## Vercel frontend

The production project is `quitesignal` and the public alias is
<https://quitesignal.vercel.app>. The repository's `vercel.json` builds the web
workspace and rewrites deep links to the SPA entry point. A CLI deployment from a
clean source archive is used when Git author/team metadata is not available to the
Vercel team:

```sh
npm ci
npm run build:web
vercel deploy . --project quitesignal --prod --yes
```

The deployment must point at the committed app source and the canonical public
manifest. Check `/`, `/markets`, `/portfolio`, `/self-test`, and `/position` after
each release; a direct route must return the SPA rather than a platform 404. Do not
put private keys, RPC credentials, or confidential values in Vercel environment
variables.
