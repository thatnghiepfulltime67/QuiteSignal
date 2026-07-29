# Repository structure (greenfield)

The repository uses npm workspaces with three functional zones: user-facing apps,
long-running services, and reusable modules. Operational scripts remain outside the
workspace dependency graph.

```text
.
├── apps/
│   └── web/                         # wallet, client-side encryption, owner views
├── services/
│   ├── automation/                  # optional permissionless lifecycle worker
│   └── indexer/                     # rebuildable public event read model
├── modules/
│   ├── protocol/                    # Hardhat project, contracts, deploy, tests
│   ├── domain/                      # pure state machine, math, schemas, errors
│   ├── confidential-client/         # Nox encrypt/decrypt/proof/ACL helpers
│   ├── verifier/                    # independent chain-data verification
│   └── config/                      # chain facts, manifests, generated bindings
├── ops/
│   └── scripts/                     # doctor, deploy, evidence, release orchestration
├── deployments/sepolia/             # canonical public deployment manifest
├── evidence/                        # sanitized machine-readable gate evidence
├── docs/                            # product, architecture, engineering, operations, plans
├── AGENTS.md
├── Plan.md
├── package.json                     # npm workspaces and root command contract
└── package-lock.json                # exact transitive dependency lock
```

## Workspace declaration

The root `package.json` owns:

```json
{
  "workspaces": ["apps/*", "services/*", "modules/*"]
}
```

Exact scripts, engines, and dependency versions are G0 outputs.

## Dependency direction

```text
modules/domain
   ↑        ↑
protocol  confidential-client
   ↑        ↑
 verifier/config
   ↑        ↑
services/*  apps/web
```

- `modules/domain` has no RPC, wallet, framework, or Nox dependency.
- `modules/protocol` imports audited Solidity dependencies, not application code.
- `modules/confidential-client` depends on public ABIs/config and domain types, not UI.
- `modules/verifier` cannot import protocol accounting implementation helpers.
- Services consume public chain state and cannot depend on owner-decryption APIs.
- Web may consume clients/read models but cannot delegate confidential plaintext to services.
- `ops/scripts` orchestrates published package interfaces and cannot become runtime authority.

Circular workspace dependencies fail G0/CI. Cross-zone imports must use declared package
exports; deep relative imports across workspaces are forbidden.

## Quality gates

Pull requests must pass formatting, strict TypeScript, Solidity compile, offline
reference-model tests, secret/license/dependency scans, and frontend accessibility.
Contract/privacy gates pass only through the named Sepolia suites in the verification matrix.
