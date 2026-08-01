# QuietSignal local two-wallet E2E demo runbook

This runbook covers the complete user-controlled QuietSignal journey in the local web
application against Ethereum Sepolia. It uses two independent wallets, real Nox
encryption, real contract transactions, and chain-derived state. It does not use a
mock branch or alter the system clock.

The primary journey is:

**Connect → create market → prepare collateral → submit two encrypted forecasts →
close → request proof → finalize aggregate → settle → reveal → materialize score →
claim**

The recovery journey is:

**Submit one encrypted forecast → reach deadline → close below threshold → refund**

## 1. Recording safety

- Never record a private key, seed phrase, wallet export, environment file, RPC
  credential, or backup screen.
- Use only disposable Sepolia wallets. QSFC and QSCC are valueless test assets;
  Sepolia ETH is still required for gas.
- Show a wallet popup only after checking the intended action and contract. Close the
  popup after confirmation so the application remains readable.
- A public market URL may be shown. Never expose raw encrypted handles, Nox proofs,
  signatures, confidential calldata, or low-level owner data.
- While the operation notification is visible, do not refresh or start another
  action. The browser locks competing controls until the wallet request or receipt
  reaches a terminal result.
- A slow RPC or pending transaction is not success. Continue only after the receipt is
  confirmed and the application has refreshed the authoritative state.

## 2. Prerequisites

Prepare two independent browser profiles:

- **Browser A / Wallet A:** market creator and first participant.
- **Browser B / Wallet B:** second participant and independent shared-link reader.

Both wallets must:

1. Be unlocked and connected to Ethereum Sepolia.
2. Hold enough Sepolia ETH for creation, faucet, approval, wrapping, forecast, and
   lifecycle transactions.
3. Be disposable test accounts without valuable assets or personal history.

QuietSignal never imports a wallet. It receives the selected account through the
normal EIP-1193 connection flow.

Before recording, close personal tabs, hide unrelated bookmarks, and disable unrelated
desktop notifications.

## 3. Start the local application

From the repository root:

```sh
npm run dev:web -- --host 127.0.0.1
```

Open <http://localhost:5173/> in both browser profiles. Keep the terminal outside the
recording frame so environment values cannot be exposed.

### Opening shot

Show:

- the QuietSignal Overview page;
- the `PRIVATE`, `COMPUTE`, `PUBLIC`, and `PENDING` privacy legend;
- the persistent Markets, Portfolio, and Create navigation;
- the Sepolia network indicator.

Open Markets before connecting a wallet. Confirm that the canonical pool and published
verified pools render from public state. The collapsed filter should initially read
`Filter: All pools`. Open it briefly to show the condition, participant-gate, and
commit-window filters, then close it.

This opening sequence is read-only and must not request a wallet transaction.

## 4. Create a real market with Wallet A

Use a new market so the immutable deadline is clear and the journey does not depend on
an already closed pool.

1. In Browser A, select **Connect wallet**.
2. Choose Wallet A and switch to Sepolia if requested.
3. Open **Create**.
4. Select:
   - comparison: **ETH/USD ≥ threshold**;
   - threshold: **2000**;
   - commit window: **15 minutes**;
   - participant gate: **2**.
5. Select **Create verified market**.
6. Confirm the immutable adapter deployment.
7. Wait for the adapter receipt.
8. Confirm pool creation through the manifest-bound factory.
9. Wait for the pool receipt and verification readback.
10. Show the success notification, pool address, condition, deadline, and gate.

Use the five-minute window only if both wallets already hold enough QSCC. Fifteen
minutes is safer when collateral must be minted and wrapped during the recording.

The resulting participant link contains public configuration only. It must not contain
an account, forecast, stake, private key, encrypted handle, or proof.

## 5. Verify the shared market with Wallet B

1. Open the public participant link in Browser B.
2. Wait for the factory mapping and immutable configuration checks.
3. Confirm that link verification requests no signature or transaction.
4. Connect Wallet B on Sepolia.
5. Open Markets and select the new pool.
6. If it is not visible yet, use the compact Markets refresh control.

Factory discovery reads public events and contract state only. It must not send a
transaction.

Show the same public condition, deadline, pool address, and `At least 2 participants`
rule in Browser B. This demonstrates that the market is public Sepolia state rather
than browser-local application data.

## 6. Prepare collateral for both wallets

Perform these steps in Browser A, then repeat them in Browser B:

1. Open **Portfolio**.
2. Enter **2** in Amount.
3. Select **Mint QSFC**, confirm the faucet transaction, and wait for its receipt.
4. Select **Wrap QSCC**.
5. If the allowance is insufficient:
   - confirm the exact-amount approval;
   - wait for the approval receipt;
   - confirm the wrap transaction;
   - wait for the wrap receipt.
6. Select **Reveal QSCC** to display the private balance for the current browser
   session.
7. Optionally use the compact balance refresh control to show the final state.

The final Portfolio view should distinguish:

- public Sepolia ETH used for gas;
- public valueless QSFC;
- session-revealed private QSCC;
- the wrapper allowance.

Wrap at least 2 QSCC for each wallet so both can submit a 1.00 QSCC forecast. Never put
the private QSCC balance in a URL, terminal, log, or browser store.

## 7. Submit two encrypted forecasts

In both browsers, return to Markets, select the new pool, refresh its public state, and
confirm that the forecast panel says the commit window is open.

### Wallet A

1. Enter collateral **1.00**.
2. Enter probability **70**.
3. Select **Encrypt and submit forecast**.
4. Follow each explicit wallet request.
5. Wait for every required receipt.
6. Show the confirmed notification.
7. Confirm that the button becomes **Forecast already submitted**.

### Wallet B

1. Enter collateral **1.00**.
2. Enter probability **30**.
3. Select **Encrypt and submit forecast**.
4. Follow each explicit wallet request.
5. Wait for every required receipt.
6. Refresh the public lifecycle.
7. Show that the participant count is **2**.

The displayed values are user percentages. The browser converts them to integer basis
points before Nox encryption. Do not open developer tools or expose plaintext values,
encrypted handles, proofs, or confidential calldata during this sequence.

## 8. Show lifecycle prerequisites before the deadline

Open Lifecycle for the selected pool. Controls that are not yet eligible remain visible
but disabled. Hover or focus each disabled control to show its prerequisite:

- **Close window:** waits for the immutable deadline.
- **Request proof:** waits for close with `participantCount ≥ kMin`.
- **Finalize aggregate:** waits for a proof request and valid Nox attestations.
- **Settle from price feed:** waits for aggregate finalization and the observation
  boundary.
- **Expire pending:** applies only to a timed-out pending commit.
- **Refund before resolution:** applies only after aggregate-request timeout.
- **Refund after grace:** applies only after resolution grace expires.

Do not attempt a disabled action. Its adjacent copy and keyboard-accessible tooltip
already explain why the contract will reject it.

## 9. Close the commit window

Wait for the displayed deadline; do not change the machine clock.

1. Refresh Lifecycle.
2. With two finalized participants, confirm that **Close window** is eligible.
3. Submit it from either connected wallet.
4. Confirm the transaction and wait for its receipt.
5. Refresh public state.
6. Show **Aggregate pending**.

If a `k=2` pool has only one participant, close moves directly to `Refundable`. In that
case, skip aggregate proof and settlement and follow the recovery journey below.

## 10. Request and finalize the aggregate

After a successful threshold close:

1. Wait for **Request proof** to become eligible.
2. Submit it and wait for the confirmed receipt.
3. Select **Finalize aggregate**.
4. Let the browser request the two transient Nox public attestations.
5. Confirm the finalize transaction and wait for the receipt.
6. Refresh public state.
7. Show **Resolution pending** and the public YES/NO aggregate.

Do not copy or display aggregate handles or proof bytes. Only the permitted aggregate,
public lifecycle label, and confirmed transaction result belong in the recording.

## 11. Settle from the immutable price feed

The observation boundary is later than the commit deadline. Wait until **Settle from
price feed** becomes eligible, then:

1. Refresh public state.
2. Submit settlement.
3. Confirm the wallet transaction.
4. Wait for the receipt and refresh again.
5. Show **Settled**, the observed public price, Chainlink round, aggregate, and
   resulting outcome.

The user does not choose the outcome. The contract reads the immutable Chainlink
adapter. If the feed is stale or invalid, or the winning aggregate is zero, show the
safe retry/recovery state and do not claim settlement.

## 12. Reveal owner results, materialize score, and claim

Repeat this sequence for Wallet A and Wallet B. Each browser must use the wallet that
submitted that position.

1. Select the pool in Markets.
2. Open **Your position**.
3. Select **Reveal with owner wallet**.
4. Approve the owner-only authorization/read if requested.
5. Show the human-readable collateral, forecast, and position state.
6. Show the expected payout card and exact floor-division formula.
7. Select **Materialize score** and wait for its receipt.
8. Reveal again if required to display the owner-only score.
9. Select **Claim payout** and wait for its receipt.
10. Show the refreshed QSCC balance and **Claimed** terminal status.

Opening the position does not automatically claim or refund. Switching accounts or
chains must immediately mask the owner view before the other wallet is recorded.

## 13. Recovery journey: below-threshold refund

Use a separate fresh pool so the successful settlement market remains intact:

1. Wallet A creates a market with a five-minute commit window and gate `2`.
2. Wallet A submits one encrypted forecast; Wallet B does not participate.
3. Wait for the immutable deadline and refresh Lifecycle.
4. Submit **Close window** and wait for the receipt.
5. Show `Refundable` and confirm that aggregate/settlement actions are unavailable.
6. In Wallet A, reveal the owner position.
7. Select **Request refund** and wait for the receipt.
8. Show the refreshed confidential balance and **Refunded** terminal status.

This branch demonstrates that a below-threshold cohort never exposes aggregate proof
or settlement actions.

## 14. Recommended four-minute edit

Use jump cuts and a visible `Waiting for immutable deadline` title card. Never change
the clock or edit a pending transaction to look confirmed.

Recommended order:

1. Overview, privacy boundary, and navigation.
2. Wallet A creates a market.
3. Wallet B verifies the shared public market.
4. Both wallets prepare collateral.
5. Wallet A submits 70%; Wallet B submits 30%.
6. The participant count reaches two.
7. Close, request proof, and finalize aggregate.
8. Settle from the price feed.
9. Reveal owner result, materialize score, and claim.
10. Briefly show the separate below-threshold refund terminal state if time permits.

Long wallet waits, duplicate setup, and the full recovery journey can be accelerated or
placed in a separate chapter, but every displayed success must come from a real
confirmed Sepolia operation.

## 15. Final review checklist

Before exporting the video, verify that it shows:

- Ethereum Sepolia and the QuietSignal application;
- two independent wallets using the same public pool;
- the public pool address, condition, gate, and deadline;
- two confirmed encrypted forecast journeys;
- participant count `2` in the success market;
- close, proof request, aggregate finalization, and settlement in order;
- owner data revealed only by the matching wallet;
- score materialization and payout claim;
- the exact payout formula and confirmed terminal status;
- the below-threshold refundable path if included;
- no private key, seed phrase, environment value, raw handle, proof, signature, or
  confidential calldata.

Keep the final competition video at or below four minutes. The public repository URL,
production URL, Sepolia network, and `@iEx_ec` submission tag should appear in the
published video description or accompanying X post.
