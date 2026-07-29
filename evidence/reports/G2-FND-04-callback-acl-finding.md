# G2 FND-04 callback ACL finding

Status: `running; corrected lifecycle verification pending`

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
plaintext or trusted service. FND-04/G2 remain incomplete until the corrected
wrap, encrypted pull, one-time return, unwrap proof, balance-delta, delayed rewrap,
and replay checks all pass on Ethereum Sepolia.
