# Discord context extract

Source type: user-provided transcript

Reviewed: 2026-07-25

This is not an independently authenticated organizer record. It preserves only
messages relevant to competition requirements and technical feasibility.

## Ethereum Sepolia and package version

A participant reported that an older `Nox.sol` reverted on Ethereum Sepolia.
An account identified in the transcript as iExec staff replied that:

- Ethereum Sepolia (`11155111`) is supported.
- The current `@iexec-nox/nox-protocol-contracts` release was `0.2.4`.
- The current `Nox.sol` resolved Ethereum Sepolia to NoxCompute
  `0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF`.
- Builders should remain on Ethereum Sepolia rather than switch networks.

Installed package source and the live protocol address must be verified before deployment.

## Composability guidance

A participant asked whether a Nox-native protocol qualified or whether the path
must compose directly with an existing protocol. An account identified as iExec
staff replied that integrating Nox over existing open-source infrastructure was
the preferred approach, while genuinely innovative integrations might also qualify.

## Submission

An account identified as iExec DevRel warned builders to follow the DoraHacks
submission requirements. Missing the required X post may cause disqualification.

## Video guidance

An account identified as iExec staff stated that a real-person demo was preferred.
A clear, detailed, well-produced generated animation might be accepted.

## Community technical warning

A participant reported that a contract could mint confidential tokens but later
reuse of that balance reverted with `NotAllowed`; the token contract lacked access
to its own minted handle. The report is treated as an unconfirmed integration risk,
not a confirmed protocol defect. A cross-transaction handle/ACL feasibility test
is therefore mandatory before relying on this pattern.
