# G3 aggregate proof and recovery summary

Status: `passed`

G3 passed with three independently terminal Ethereum Sepolia slices. FND-05A
proved below-threshold closure with no aggregate public-decrypt access and one
owner-only refund. FND-05B proved the threshold ACL boundary and permissionless
pre-unwrap timeout cancellation followed by both owner refunds. FND-05C proved
the context-bound aggregate proof, rejection of wrong-context, substituted, replay,
and early-recovery attempts, then delayed permissionless unwrap finalization,
measured rewrap, and two one-time confidential refunds.

The corrected FND-05C fixture is
`0x927a2dcb37d6605364a2385fccb1dfc1aa63f41c`; its recovery spike is
`0x5625f911df84ec43740b036095559e1a9b83a07a`. The combined terminal read verifier
checked all three source artifacts, 47 receipt statuses and spend entries
(including the fourteen corrected FND-05C lifecycle receipts), historical runtime
hashes and corrected runtime templates/bindings, the two-member `Refundable`
state, YES/NO-only aggregate ACL, aggregate conservation, zero public spike balance
after rewrap, confidential pool custody, and removal of the local secondary
recovery record. It is read-only and passed at Sepolia block `11380652`.

The artifacts are `evidence/offline/G3/FND-05-BELOW-K.json`,
`evidence/sepolia/G3/FND-05-BELOW-K.json`,
`evidence/offline/G3/FND-05-TIMEOUT.json`,
`evidence/sepolia/G3/FND-05-TIMEOUT.json`,
`evidence/offline/G3/FND-05-RECOVERY.json`,
`evidence/sepolia/G3/FND-05-RECOVERY.json`, and the combined
`evidence/{offline,sepolia}/G3/FND-05.json` records. They contain no plaintext
owner input, raw handle, proof, calldata, signature, key, or RPC value.

G4 is now the next required gate: select and verify one unchanged public-protocol
adapter. No adapter claim is made by G3.
