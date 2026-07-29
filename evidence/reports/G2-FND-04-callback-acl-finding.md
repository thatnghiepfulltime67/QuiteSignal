# G2 FND-04 callback ACL finding

Status: `passed; final resolution recorded in G2 evidence`

The first FND-04 Sepolia run deployed an isolated public ERC-20 fixture, an
unchanged inherited Nox ERC20-to-ERC7984 wrapper, and two no-custody lifecycle
spikes. Deployment blocks were `11377909` through `11377913`; the mint, approval,
and first confidential wrap receipts completed through block `11377918`. Every
confirmed transaction is in the append-only Sepolia spend ledger.

The next encrypted `confidentialTransferAndCall` was stopped at read-only gas
simulation. The receiver attempted a Nox operation on the callback `amount` handle
and reverted with its `MissingTransientAccess` error. A separate read-only Sepolia
probe reproduced the rejection. No transfer callback transaction was sent.

The pinned wrapper has already updated the receiver's confidential balance before
the callback. ADR-012 therefore requires the isolated receiver to read that
recipient balance and derive the encrypted received delta rather than using the
unusable callback argument. This preserves live ACL semantics and introduces no
plaintext or trusted service.

The corrected balance-read harness then completed its happy-path lifecycle at blocks
`11377980` through `11377995`, including one-time return, unwrap, delayed rewrap,
replay rejection, and terminal read-only verification. That result is deliberately
not a G2 pass: F-005 identifies that recording the whole post-callback balance does
not bind the stake to the callback when an unrelated direct transfer already exists.

The next FND-04 slice registers a caller-bound encrypted expected stake and a
pre-callback balance snapshot. The callback must return encrypted equality between
the received delta and expected stake to the unchanged wrapper, which refunds a
mismatch in the same transaction. Only an amount-free equality boolean may be
public-decrypted to finalize acceptance. G2 remains incomplete until this hardened
wrap, accepted pull, rejected mismatch, one-time return, unwrap proof, balance
delta, delayed rewrap, and replay set all pass on Ethereum Sepolia.

The first intent-bound run deployed three new spikes at blocks `11378064` through
`11378067` and registered a caller-bound expected stake at block `11378069`. Its
callback gas simulation then exposed F-006: the unchanged wrapper consumes the
receiver's encrypted result after the callback, so the receiver must grant that
verified wrapper transient access to the result before returning it. No callback
transfer was sent. The next slice adds only this transaction-scoped ACL grant and
repeats the complete intent-bound lifecycle on Sepolia.

The next attempt passed the callback and acceptance proof, but its first return
simulation exposed F-007: the wrapper also needs transient access to the
receiver-held encrypted amount supplied to its transfer and unwrap operations. No
return transaction was sent. The next slice grants that access only immediately
before each unchanged wrapper operation and repeats the complete lifecycle. The
accepted valueless fixture collateral remains at the old direct spike
`0x5a6cd68e2ee9aef073e7f95354fa9d0b7d7cb210`; that immutable isolated harness
cannot add the newly required ACL, so it is not reused. This is an explicitly
documented test-fixture residue, not a product custody state.

The final intent-bound run passed at blocks `11378127` through `11378152`, and a
read-only verifier passed at block `11378163`. It proved matching intent acceptance,
atomic mismatch refund, amount-free acceptance proof, one-time return, unwrap,
proof-gated finalization, delayed rewrap, and terminal recovery. The detailed
sanitized record is `evidence/sepolia/G2/FND-04.json`; G2 is passed.
