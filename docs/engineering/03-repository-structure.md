# Repository structure (greenfield)

```text
.
├── apps/
│   ├── web/                 # Next.js UI; wallet + client-side Nox encryption
│   ├── relayer/             # permissionless lifecycle worker, no secret inputs
│   └── indexer/             # event consumer and rebuildable read model
├── contracts/
│   ├── core/                # QuietSignalPool, factory, access control
│   ├── adapters/            # public-market adapter implementations
│   ├── interfaces/          # stable ABI boundaries
│   └── test/                # contract fixtures and protocol test helpers
├── packages/
│   ├── domain/              # schemas, state machine, errors, policy
│   ├── nox-client/          # encrypt/decrypt/proof/ACL helpers
│   ├── verifier/            # independent invariant recomputation
│   └── config/              # chain and deployment manifests
├── docs/                    # product, architecture, engineering, operations
├── scripts/                 # deploy, seed, verify, readiness checks
├── deployments/             # public addresses and ABI hashes
└── test/                    # cross-module and end-to-end tests
```

## Dependency rules

- `contracts` imports only interfaces and audited libraries.
- `domain` has no RPC, wallet, or framework dependency.
- `nox-client` is used by `web` and the test harness, never by the indexer to
  decrypt owner data.
- `relayer` submits transactions but cannot receive user plaintext.
- `verifier` is independent from contract implementation helpers.

## Quality gates

Pull requests must pass formatting, strict TypeScript, Solidity compile, unit and
invariant tests, static secret scan, dependency/license scan, frontend a11y, local
e2e through the official Nox Hardhat integration stack, and a Sepolia smoke test
on release tags.
