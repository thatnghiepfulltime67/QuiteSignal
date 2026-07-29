# QuietSignal

QuietSignal is a confidential participation layer for open prediction markets.
Users submit an encrypted forecast and conviction; the system reveals only a
sufficiently large aggregate that the market can consume. Individual position,
size, and personal score remain decryptable only by the wallet owner.

This is a greenfield build. The product brief, privacy model, protocol spec,
architecture, and roadmap are indexed in [`INDEX.md`](INDEX.md).

## Status

The repository currently contains design documentation only. No contract,
frontend, or deployment is considered complete until the roadmap and acceptance
criteria are implemented and verified.

## Principles

1. Privacy claims must never exceed the available evidence.
2. The public market remains composable; privacy lives in the adapter layer.
3. Every module has a clear boundary, independent tests, and documented failure modes.
4. A real Sepolia end-to-end flow is the standard for release verification.
