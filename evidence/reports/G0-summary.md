# G0 toolchain lock summary

Status: `passed`

Work item `FND-01` pinned the npm workspace toolchain at source commit
`6f562e2f6811aa5ab117f3163480a40b4750f755`. Two clean installs, strict
TypeScript compilation, formatting, secret scanning, dependency metadata checks,
and Ethereum Sepolia read preflight passed.

The read preflight confirmed chain `11155111` and runtime code at the pinned
NoxCompute address. No Sepolia write occurred; the spend ledger has zero entries
and zero gas spend.

The original Hardhat dependency graph had two high-severity npm advisory findings
and no critical finding. R-16 records the mitigation; the current dependency scan
reports zero vulnerabilities. This result does not prove confidential computation, ACL, asset, proof,
or adapter behavior; FND-02 through FND-06 remain required.

Reproduce with Node `24.18.0`, npm `11.16.0`, `npm ci` twice,
`npm run check:offline`, `npm run check:sepolia:read`, and
`npm run scan:dependencies`.
