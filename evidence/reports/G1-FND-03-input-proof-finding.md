# G1 FND-03 input-proof binding finding

Status: `resolved in the harness; full ACL verification pending`

The first FND-03 Sepolia run deployed three isolated no-custody contracts:

- ACL spike: `0x28a969018975fb40aed0bfa98f6d1c3023b6a7da` at block `11377738`;
- ACL negative-case spike: `0xe6acccbddd77c9bcd7e7286f837d70c4e9b77222` at block `11377740`;
- transient-recipient spike: `0x9ff509452e3acd6c01a9b1238214f94f75df86a3` at block `11377741`.

The deployment receipts are recorded in the append-only Sepolia spend ledger. No
asset, collateral, plaintext, handle, proof, calldata, signature, or wallet secret
was recorded by this run.

Before materialization, the read-only Sepolia gas simulation rejected the encrypted
input with Nox `InvalidProof`. The harness had encrypted the input using a test
owner account while the throwaway deployer submitted the importing application call.
The pinned Nox Compute implementation validates the proof owner against the
application caller. This is intended input binding, not an arithmetic or ACL
failure.

The corrected harness uses the throwaway deployer as both input encryptor and
transaction sender, and grants that account only viewer authority on the derived
handle. It will reuse the bytecode-matched deployed spikes after a clean-source and
budget preflight. FND-03 and G1 remain incomplete until the complete authority,
decryption-scope, persistence, transient-access, and negative-case suite passes on
Ethereum Sepolia.
