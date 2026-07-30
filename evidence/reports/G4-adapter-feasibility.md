# G4 public-protocol adapter feasibility

Status: blocked

G4 requires one unchanged public conditional-market target on Ethereum Sepolia
with source and license provenance, an auditable live address and runtime, bounded
aggregate execution, deterministic resolution and redemption, and no adapter
custody between calls. Every minimum is mandatory; a target that misses one cannot
be used as a substitute or simulated locally.

| Candidate                 | Public-source finding                                                                                                                                                                                                       | Sepolia finding                                                                                                                                                           | Mandatory result                                                                                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gnosis Conditional Tokens | The official repository documents LGPL-3.0 source and deployments only on Ethereum mainnet, xDai, and deprecated Rinkeby.                                                                                                   | No official Ethereum Sepolia deployment is documented.                                                                                                                    | Rejected: the Sepolia availability minimum fails.                                                                                                                                              |
| Uniswap v3                | The official deployment index lists supported chains and advises verifying addresses per chain. It does not list Ethereum Sepolia for v3. The protocol is an exchange, not a conditional market with resolution/redemption. | No qualifying public Sepolia target can provide binary resolution and redemption.                                                                                         | Rejected: Sepolia availability and deterministic conditional-market settlement fail.                                                                                                           |
| UMA Optimistic Oracle V3  | Official documentation supports an optimistic-oracle flow and a separate prediction-market example. The official network guidance classifies Sepolia as testnet-only with no DVM.                                           | The live public contract at 0xfd9e2642a170add10f53ee14a93fcf2f31924944 has the recorded runtime hash, a 7,200-second default liveness period, and a public bond currency. | Rejected: it is an oracle rather than a complete market target; disputed resolution is not deterministic on Sepolia; it cannot perform aggregate market execution with a price-slippage bound. |

The direct command npm run assess:g4:sepolia reproduced the UMA candidate's public
runtime hash and view configuration without a signer or write. Its sanitized output
is recorded in evidence/sepolia/G4/FND-06-TARGET-DISCOVERY.json.

The candidate assessment is based on the official [Gnosis Conditional Tokens
repository](https://github.com/gnosis/conditional-tokens-contracts), the official
[Uniswap v3 deployment index](https://developers.uniswap.org/docs/protocols/v3/deployments),
and UMA's official [Optimistic Oracle quick start](https://docs.uma.xyz/developers/optimistic-oracle/getting-started)
and [prediction-market documentation](https://docs.uma.xyz/developers/optimistic-oracle-v3/prediction-market).
The lack of a Sepolia DVM is an inference from UMA's official network guidance;
this repository does not treat the oracle's undisputed testnet path as equivalent to
deterministic adversarial resolution.

No adapter, market clone, mock resolver, trusted service, or product contract was
created. G4 and P0 remain blocked. To resume, the scope must change explicitly to
allow a qualifying unchanged target on a different supported network, or a
source-proven fully resolved public conditional market must become available on
Ethereum Sepolia. Either choice changes the current acceptance boundary and needs a
new decision record before implementation.
