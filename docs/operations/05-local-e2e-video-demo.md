# QuietSignal local E2E video-demo runbook

This runbook records the real two-wallet Ethereum Sepolia journey in the local
QuietSignal web app. It is written for a screen recording, not for injecting keys or
simulating chain state.

The main recording proves the successful path:

`connect → create market → prepare collateral → submit two forecasts → close →
request proof → finalize aggregate → settle → reveal → score → claim`

An optional second recording proves the insufficient-cohort recovery path:

`one forecast → deadline → close → refundable → owner refund`

## Safety and recording rules

- Never show a private key, seed phrase, wallet export, `.env` file, terminal secret,
  or wallet backup screen.
- Use only disposable Sepolia wallets. The QSFC faucet and QSCC wrapper are test-only
  and valueless; native Sepolia ETH is still required for gas.
- Record wallet popups only after the requested transaction and recipient are visible.
  Close the popup after confirmation so the next step is clear.
- Keep the browser address bar visible when showing a public market URL, but do not
  record confidential input, decrypted position bytes, Nox proof bytes, or wallet
  signatures.
- The page disables competing controls during a wallet request or receipt wait. Do not
  refresh or click another action while the upper-right operation toast is pending.
- A public read or receipt delay is a retry state, not a reason to claim success. Wait
  for the confirmed toast and the refreshed public state.

## Before recording

Prepare two separate browser profiles or windows:

- **Browser A / Wallet A** — market creator and first participant.
- **Browser B / Wallet B** — second participant and independent viewer.

Both wallets should already be:

1. switched to Ethereum Sepolia;
2. funded with enough Sepolia ETH for deployment, faucet/wrapper, signal, and
   lifecycle transactions; and
3. unlocked in the browser extension.

Do not import either wallet into the application. The app must receive the account only
through the wallet's normal EIP-1193 connection.

## Start the local web app

From the repository root:

```bash
npm run dev:web -- --host 127.0.0.1
```

Open <http://localhost:5173/> in both browser profiles. Keep the terminal outside the
recording frame or crop it so no environment values are visible.

### Opening shot

Record the landing page briefly:

- QuietSignal overview and the privacy legend (`PRIVATE`, `COMPUTE`, `PUBLIC`,
  `PENDING`);
- the sticky navigation: `Markets`, `Portfolio`, and `Create`; and
- the `Sepolia` network indicator.

Then open `Markets`. Before a wallet is connected, the page should show the canonical
pool and the published verified pools. The compact filter is closed and reads
`Filter: All pools`; click it once to show the available condition, participant-gate,
and window filters, then close it again. This is a read-only step.

## Part 1 — Create one real market with Wallet A

Use a fresh market for the successful path so its deadline is known and the recording
does not depend on an already closed pool.

1. In Browser A, click `Connect wallet`, choose Wallet A, and confirm Sepolia if the
   wallet asks to switch networks.
2. Open `Create`.
3. Select a simple public configuration:
   - comparison: `ETH/USD ≥ threshold`;
   - threshold: `2000`;
   - commit window: `15 minutes` (use `5 minutes` only if both collateral balances are
     already prepared); and
   - participant gate: `2`.
4. Click `Create verified market`.
5. Approve the immutable adapter deployment in Wallet A and wait for its receipt.
6. Approve the factory pool creation in Wallet A and wait for its receipt.
7. Capture the success toast, the public pool address, condition, deadline, and
   participant gate. Do not record any wallet signature details.

The page should say that the market is verified and offer a public second-participant
link. Copy or open that link for Browser B. The link contains only public market
configuration; it contains no account, stake, probability, key, handle, or proof.

## Part 2 — Verify the shared market with Wallet B

1. In Browser B, open the shared market link from Part 1.
2. Let the page finish the wallet-free factory/configuration verification. It should
   not request a signature just to verify the link.
3. Connect Wallet B on Sepolia.
4. Open `Markets` and select the created pool. If it is not immediately in the list,
   click the small refresh icon beside `Markets`; the factory discovery is public-read
   only and does not submit a transaction.
5. Show the same condition, deadline, pool address, and `At least 2 participants`
   facts in Browser B. This demonstrates that the market is not limited to Wallet A's
   browser memory.

## Part 3 — Prepare test collateral in both wallets

Perform the following sequence once in Browser A and once in Browser B. Keep the
selected created pool unchanged while moving between `Portfolio` and `Markets`.

1. Open `Portfolio`.
2. In `Amount`, enter `2` QSFC. This leaves room for a `1.00` QSCC forecast stake.
3. Click `Mint QSFC`, confirm the faucet transaction, and wait for the success toast.
4. Click `Wrap QSCC`.
   - If allowance is insufficient, the app requests an exact QSFC approval first.
   - Confirm the approval transaction and wait for its receipt.
   - Confirm the wrap transaction and wait for its receipt.
5. Click `Reveal QSCC` if you want the recording to show the owner-only balance read.
   The balance is displayed only for the current browser session.
6. Click the compact balance refresh icon if you want to show the final public QSFC,
   private QSCC, allowance, and Sepolia gas rows.

The Portfolio header should show public ETH/QSFC and masked or explicitly revealed QSCC.
No confidential balance should appear in the URL, browser storage, terminal, or video
overlay.

## Part 4 — Submit two encrypted forecasts

Before recording the transaction sequence, return both browsers to `Markets`, select the
created pool, and click the Market refresh icon. The forecast panel should say the pool
is accepting signals.

### Wallet A

1. Enter collateral `1.00`.
2. Enter probability `70` (the user-facing percentage; the browser converts it to
   protocol basis points locally).
3. Click `Encrypt and submit forecast`.
4. Follow every wallet prompt and wait for each confirmed receipt.
5. Capture the success toast and the changed state `Forecast already submitted`.

### Wallet B

1. Enter collateral `1.00`.
2. Enter probability `30`.
3. Click `Encrypt and submit forecast`.
4. Follow every wallet prompt and wait for the confirmed receipts.
5. Capture the public participant count reaching `2` after a lifecycle refresh.

The two probabilities must never be shown as public plaintext in a URL, log, or
recorded developer console. The visible form values are local user input; the protocol
commit is encrypted before submission.

## Part 5 — Demonstrate the lifecycle controls

Open the selected pool's `Lifecycle` panel in either browser. The panel always shows
all contract-defined controls, but disabled controls expose their exact prerequisite
on hover or keyboard focus.

### Before the deadline

Record the disabled states and hover/focus explanations:

- `Close window` waits for the immutable deadline;
- `Request proof` waits for a successful close with `participantCount ≥ kMin`;
- `Finalize aggregate` waits for a proof request and valid public attestations;
- `Settle from price feed` waits for finalized aggregate and the observation boundary;
- each recovery action waits for its own pending/timeout state.

### After the commit deadline

Wait for the displayed deadline. Do not change the system clock. Refresh public state
with the small Lifecycle refresh icon. With two finalized participants, only
`Close window` should be enabled.

1. Click `Close window` from Wallet A or Wallet B.
2. Confirm the transaction and wait for the receipt.
3. Refresh public state and capture `Aggregate pending`.

If only one participant was finalized in a `k=2` pool, the same action instead moves
the pool directly to `Refundable`; skip the proof/settlement steps and use the optional
refund branch below.

### Request and finalize the aggregate

1. When `Request proof` becomes enabled, click it from either connected wallet.
2. Confirm the transaction and wait for the success toast.
3. Click `Finalize aggregate`.
4. The browser obtains the two transient Nox public attestations and requests the
   wallet transaction. Confirm it and wait for the receipt.
5. Refresh public state and capture `Resolution pending`.

Do not record or copy the aggregate handles, proof bytes, or any decrypted aggregate
value. Only the public lifecycle label and confirmed transaction result belong in the
video.

### Settle from the immutable price feed

The adapter's observation boundary is intentionally later than the commit deadline.
Wait until the UI enables `Settle from price feed`; this may require the configured
resolution grace interval. Refresh public state before submitting.

1. Click `Settle from price feed`.
2. Confirm the wallet transaction and wait for its receipt.
3. Refresh public state and capture `Settled` plus the public settlement facts.

The browser supplies no caller-selected outcome. The Chainlink adapter and contract
state are authoritative. If the feed is stale/invalid or the winning aggregate is zero,
the action remains unavailable or reverts safely; record the retry state rather than
claiming settlement.

## Part 6 — Reveal and complete both owner positions

Repeat the following in Browser A and Browser B, using the wallet that submitted that
position:

1. Open `Your position` for the selected pool.
2. Click `Reveal with owner wallet` and approve the owner-only authorization/read if
   requested.
3. Capture only the human-readable session state; never expose encrypted handles or
   proof material.
4. Click `Materialize score` and wait for the confirmed receipt.
5. Click `Claim payout` and wait for the confirmed receipt.
6. Refresh the owner position and capture `Claimed` (or the safe no-payout state if
   that participant did not win).

No claim is submitted automatically by opening the page. Account changes must mask the
position again before recording the next wallet.

## Optional Part 7 — Record the insufficient-cohort refund branch

Use a separate fresh pool so the successful settlement recording remains intact:

1. Wallet A creates another market with a `5-minute` window and gate `2`.
2. Prepare collateral for Wallet A only.
3. Submit one forecast from Wallet A; do not submit from Wallet B.
4. Wait for the deadline and refresh public state.
5. Click `Close window` and wait for the receipt.
6. Capture `Refundable`. The Lifecycle action buttons are now disabled because no
   further permissionless lifecycle transition is needed.
7. In `Your position`, click `Reveal with owner wallet`.
8. Click `Request refund`, confirm the owner transaction, and wait for the receipt.
9. Refresh and capture `Refunded`.

This branch demonstrates why a `k=2` pool with only one participant does not expose
`Request proof`, `Finalize aggregate`, or `Settle from price feed` after close.

## Suggested edit order for one polished video

1. Landing page and navigation (10–15 seconds).
2. Wallet A connection and Create form.
3. Adapter and pool receipts.
4. Wallet B shared-link verification and connection.
5. Portfolio collateral preparation in both wallets.
6. Wallet A and Wallet B encrypted forecasts.
7. Disabled lifecycle tooltips before deadline.
8. Deadline, close, aggregate proof, and settlement.
9. Owner reveal, score, and claim in both wallets.
10. Optional refund branch as a separate chapter or follow-up clip.

Use jump cuts or a visible “waiting for deadline” title card instead of changing the
clock or implying that a transaction finished before its receipt.

## Final evidence checklist

Record these public facts in a separate note after filming:

- local app URL and Git revision;
- Sepolia chain id;
- created pool address and immutable condition/gate/deadline;
- transaction hashes and confirmed block numbers for deployment, collateral, forecasts,
  lifecycle, settlement, claim, and refund steps;
- which browser/wallet performed each owner action; and
- any retry or RPC-degraded state that was shown.

Do not include seed phrases, private keys, wallet signatures, confidential plaintext,
Nox proof bytes, or raw owner handles in the video or evidence note. A user video alone
is a product demonstration; it should not be labelled G7 evidence unless the separate
sanitized evidence format and verifier requirements are also satisfied.
