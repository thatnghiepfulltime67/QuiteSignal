# G1 FND-02 Sepolia preflight blocker (historical)

Status: `superseded`

The local configuration issue was resolved without disclosing the key. The
successful evidence is recorded in `evidence/offline/G1/FND-02.json`,
`evidence/sepolia/G1/FND-02.json`, and `evidence/reports/G1-summary.md`. The
following record is retained as the sanitized historical reproduction.

Historical status: `blocked`

The isolated encrypted-arithmetic harness compiles and its pure bigint model
passes offline. The required Ethereum Sepolia dry-run cannot create a signer:
the locally configured `SEPOLIA_PRIVATE_KEY` is present but fails local EVM key
encoding validation. No key value was read into output, evidence, or source.

No Sepolia transaction was submitted. The committed spend ledger has zero entries
and zero gas spend; no contract, confidential asset, or user collateral exists.

To resume, configure a valid, funded, throwaway Sepolia key directly in the
ignored local `.env` file. Do not share that key in chat, source, logs, or
evidence. Then run the dry-run command below before the confirmed write:

```text
npm run test:nox:sepolia -- FND-02 --dry-run
```

The confirmed command remains guarded by `CONFIRM_SEPOLIA_WRITE=yes`, source-tree
cleanliness, chain ID, and the 0.5 ETH spend ledger.
