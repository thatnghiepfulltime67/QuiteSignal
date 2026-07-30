import './styles.css';
import { parsePublicManifest, type PublicManifest } from './manifest.js';
import { presentMarket } from './market.js';
import { validateSignalDraft } from './signal.js';
import { presentVerification } from './verification.js';
import { presentLifecycle } from './lifecycle.js';
import { parseActiveRelease } from './release.js';
import {
  decryptOwnerPosition,
  finalizePendingSignal,
  readPublicEpoch,
  SignalJourneyError,
  submitOwnerTerminalAction,
  submitSignalJourney,
} from './wallet.js';

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: 'accountsChanged' | 'chainChanged', listener: () => void): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

let manifest: PublicManifest | undefined;
let releaseId = 'unselected';
let walletState = 'No wallet detected';
let lifecycleMessage = 'Connect a Sepolia wallet to refresh public pool state.';
let ownerMessage = 'Owner values are masked. Reveal requires your connected owner wallet.';
let ownerActions = '';

async function loadManifest(): Promise<void> {
  const pointerResponse = await fetch('/active-release.json');
  const release = parseActiveRelease(await pointerResponse.json());
  const response = await fetch(release.manifestPath);
  manifest = parsePublicManifest(await response.json());
  releaseId = release.releaseId;
}

function navigationLink(path: string, label: string, active: boolean): string {
  return `<a href="${path}"${active ? ' aria-current="page"' : ''}>${label}</a>`;
}

function landingContent(market?: ReturnType<typeof presentMarket>): string {
  const marketLink = market ? `/pool/${market.poolAddress}` : '/markets';
  const verifyLink = market ? `/verify/${market.poolAddress}` : '/markets';
  return `<section class="band cocoa-band hero landing-hero"><div class="band-inner"><p class="eyebrow">{ confidential forecasting on Sepolia }</p><h1>Quiet signals.<br />Public proof.</h1><p>Forecast a public condition without publishing your probability or collateral amount. Coordination stays inspectable; confidential computation stays in the protocol.</p><div class="hero-actions"><a class="primary" href="${marketLink}">Explore the active market</a><a class="text-action" href="/how-it-works">How it works <span aria-hidden="true">↓</span></a></div><p class="hero-note">Live testnet product · Wallet optional for exploration · No anonymity claim</p></div></section><section class="band petal-band landing-intro"><div class="band-inner landing-heading"><p class="eyebrow">{ the product in one minute }</p><h2>A forecasting market that reveals only what the lifecycle needs.</h2><p>QuietSignal makes one clear trade: your wallet activity and the final aggregate are public; your submitted forecast and confidential collateral stay protected until the contract permits their use.</p></div><div class="band-inner editorial-grid" aria-label="Product principles"><article><span>01</span><h3>Public coordination</h3><p>Condition, deadline, cohort threshold, lifecycle state, and settlement facts can be checked on Ethereum Sepolia.</p></article><article><span>02</span><h3>Private signal</h3><p>Your probability and collateral are encrypted in your browser with Nox. The application does not keep a plaintext shadow record.</p></article><article><span>03</span><h3>Permissionless recovery</h3><p>Timeout and recovery paths are contract-defined. A stalled interface never becomes the authority over funds.</p></article></div></section><section class="band plum-band landing-flow"><div class="band-inner landing-heading"><p class="eyebrow compute">{ one verifiable lifecycle }</p><h2>Read → signal → aggregate → settle.</h2><p>Every step says what is public, what is encrypted, and when a wallet approval is actually needed.</p></div><ol class="band-inner flow-list"><li><strong>01 / EXPLORE</strong><span>Inspect the live condition, public cohort rule, release facts, and current lifecycle without connecting a wallet.</span></li><li><strong>02 / SIGNAL</strong><span>Choose a probability and collateral amount. Nox encrypts both locally before the wallet receives the real transaction request.</span></li><li><strong>03 / VERIFY</strong><span>Public chain state records acceptance, timing, and the aggregate lifecycle. The independent verifier remains the source of invariant conclusions.</span></li><li><strong>04 / RESOLVE</strong><span>After the documented condition and time windows, the protocol resolves or exposes a permissionless recovery route. No application transfer is required.</span></li></ol></section><section class="band blush-band landing-boundaries"><div class="band-inner landing-heading"><p class="eyebrow">{ know the boundary }</p><h2>Clear privacy promises are part of the product.</h2></div><div class="band-inner boundary-columns"><article><p class="eyebrow public">{ public }</p><h3>Coordination can be inspected.</h3><p>Wallet addresses, transaction timing, the market condition, the public lifecycle, and eventual aggregate facts are observable on-chain.</p></article><article><p class="eyebrow private">{ private }</p><h3>Your signal is not a public form value.</h3><p>Forecast probability, collateral amount, confidential handles, and proofs are not displayed by this application or routed through an app backend.</p></article><article><p class="eyebrow compute">{ recovery }</p><h3>Funds never depend on this page.</h3><p>When an operation is pending or terminal, use the public lifecycle and the contract’s claim, refund, or permissionless recovery path.</p></article></div></section><section class="band cocoa-band landing-release"><div class="band-inner release-layout"><div><p class="eyebrow">{ release facts }</p><h2>Built to be checked, not merely trusted.</h2></div><dl><div><dt>NETWORK</dt><dd>Ethereum Sepolia</dd></div><div><dt>CONFIDENTIAL COMPUTE</dt><dd>Nox in the browser and contract flow</dd></div><div><dt>ACTIVE RELEASE</dt><dd>${releaseId}</dd></div><div><dt>PUBLIC VERIFICATION</dt><dd>Manifest-bound runtime and lifecycle checks</dd></div></dl></div></section><section class="band petal-band landing-faq"><div class="band-inner landing-heading"><p class="eyebrow">{ before you start }</p><h2>Questions a careful participant should ask.</h2></div><div class="band-inner faq-list"><details><summary>Do I need a wallet to explore?</summary><p>No. Market facts, lifecycle state, and the verification view are public. A wallet is needed only for an explicit signal or owner-only action.</p></details><details><summary>Are signals anonymous?</summary><p>No. QuietSignal protects forecast and collateral values, not wallet addresses, transaction timing, or the public transaction graph.</p></details><details><summary>What happens if a browser step fails?</summary><p>Read the public pool lifecycle before retrying. The contract’s pending, claim, refund, and permissionless recovery rules—not the browser—determine the safe next action.</p></details><details><summary>Where do I verify the deployment?</summary><p>Open the verification view for the active pool. It reports manifest facts and directs you to the independent verifier for invariant conclusions.</p></details></div></section><section class="band cocoa-band landing-cta"><div class="band-inner"><p class="eyebrow">{ choose a safe first action }</p><h2>Inspect first. Connect only when you are ready.</h2><p>Start with the live market and its public state, then verify the active deployment before asking a wallet to sign.</p><div class="hero-actions"><a class="primary" href="${marketLink}">Open the market</a><a class="secondary light-secondary" href="${verifyLink}">Verify the release</a></div></div></section>`;
}

function explainerContent(market?: ReturnType<typeof presentMarket>): string {
  const marketLink = market ? `/pool/${market.poolAddress}` : '/markets';
  const verifyLink = market ? `/verify/${market.poolAddress}` : '/markets';
  return `<section class="band petal-band explainer-hero"><div class="band-inner"><p class="eyebrow">{ how QuietSignal works }</p><h1>Make a signal without turning it into a public number.</h1><p>Use this guide to understand the information boundary and safe actions before a wallet approval.</p></div></section><section class="band plum-band explainer-sequence"><div class="band-inner landing-heading"><p class="eyebrow compute">{ the participant journey }</p><h2>Four moments, each with a different trust boundary.</h2></div><div class="band-inner sequence-grid"><article><span>01</span><h3>Check the market</h3><p>Read the condition, deadline, cohort rule, and public lifecycle from the active deployment. This step is wallet-free.</p></article><article><span>02</span><h3>Prepare locally</h3><p>Enter a probability and collateral amount only when you choose to signal. Nox encryption is browser-local.</p></article><article><span>03</span><h3>Approve explicitly</h3><p>Your browser wallet shows each on-chain request. The page waits for receipts and never labels a pending request as completed.</p></article><article><span>04</span><h3>Follow public state</h3><p>Use the lifecycle and independent verification facts to determine aggregation, settlement, claim, refund, or recovery next steps.</p></article></div></section><section class="band blush-band explainer-actions"><div class="band-inner"><p class="eyebrow">{ route guide }</p><h2>Use the smallest surface that answers your question.</h2><div class="action-guide"><a href="${marketLink}"><span>PUBLIC</span><strong>Market</strong><p>Condition, cohort rule, public lifecycle, and signal entry.</p></a><a href="${verifyLink}"><span>PUBLIC</span><strong>Verify</strong><p>Manifest-bound deployment facts and the independent verification boundary.</p></a><a href="/position"><span>PRIVATE</span><strong>Position</strong><p>Owner-only reveal, score, claim, and refund controls after a wallet connection.</p></a></div></div></section><section class="band cocoa-band landing-cta"><div class="band-inner"><p class="eyebrow">{ ready to inspect }</p><h2>Start from the live public state.</h2><div class="hero-actions"><a class="primary" href="${marketLink}">Explore the market</a><a class="secondary light-secondary" href="${verifyLink}">Verify the release</a></div></div></section>`;
}

function render(message?: string): void {
  const root = document.querySelector<HTMLDivElement>('#app');
  if (!root) return;
  const market = manifest ? presentMarket(manifest) : undefined;
  const isMarketRoute =
    location.pathname.startsWith('/markets') || location.pathname.startsWith('/pool/');
  const isSignalRoute = location.pathname.endsWith('/signal');
  const isPositionRoute = location.pathname === '/position';
  const isExplainerRoute = location.pathname === '/how-it-works';
  const isHomeRoute = location.pathname === '/';
  const verifyAddress = location.pathname.startsWith('/verify/')
    ? location.pathname.slice('/verify/'.length)
    : undefined;
  const content =
    verifyAddress && manifest
      ? (() => {
          try {
            const view = presentVerification(manifest, verifyAddress);
            return `<section class="band petal-band verification"><div class="band-inner"><p class="eyebrow public">{ public verification }</p><h1>Verify this pool</h1><p class="route-lead">Check the active release before a wallet action. This view shows public manifest facts; it does not create an on-chain conclusion by itself.</p><div class="facts"><p><b>Chain</b>${view.chain}</p><p><b>Manifest</b>${view.manifest}</p><p><b>Evidence</b>${view.evidence}</p></div><div class="route-callout"><p class="eyebrow public">{ independent check }</p><p>The independent verifier command is the source of invariant conclusions. If a manifest, runtime, or pool binding differs, stop before a wallet action.</p><a class="text-action dark-action" href="/how-it-works">Read the participant guide <span aria-hidden="true">↗</span></a></div></div></section>`;
          } catch (error) {
            return `<section class="band plum-band verification"><div class="band-inner"><p class="eyebrow private">{ verification blocked }</p><h1>Pool mismatch</h1><p>${error instanceof Error ? error.message : 'The verification request is invalid.'}</p></div></section>`;
          }
        })()
      : isPositionRoute && market
        ? `<section class="band blush-band signal-card owner"><div class="band-inner"><p class="eyebrow private">{ owner only }</p><h1>Your private position</h1><p class="route-lead">This route is intentionally masked until the connected wallet proves it can view this position. Nothing is revealed or moved by opening the page.</p><div class="owner-guidance"><span>01 · Connect the owner wallet</span><span>02 · Reveal for this session</span><span>03 · Choose an explicit terminal action</span></div><div class="panel"><p role="status">${ownerMessage}</p><button class="primary" id="reveal-owner">Reveal with owner wallet</button>${ownerActions}<p class="muted">No claim or refund is submitted automatically. Re-read public pool state before retrying a pending action.</p></div></div></section>`
        : isSignalRoute && market
          ? `<section class="band plum-band signal-card"><div class="band-inner"><p class="eyebrow compute">{ encrypted locally }</p><h1>Prepare your signal</h1><p class="route-lead">Probability and collateral stay in this browser until Nox encrypts them. The process deliberately separates validation, encryption, and wallet approval.</p><ol class="journey-steps" aria-label="Signal journey steps"><li><strong>01</strong><span>Validate locally</span><small>No funds move.</small></li><li><strong>02</strong><span>Encrypt in browser</span><small>Separate pool and collateral inputs.</small></li><li><strong>03</strong><span>Confirm in wallet</span><small>Each receipt is awaited before the next stage.</small></li></ol><form id="signal-form"><label>Collateral <input name="stake" inputmode="decimal" autocomplete="off" placeholder="1.00" required /></label><label>Probability (basis points) <input name="probability" inputmode="numeric" autocomplete="off" placeholder="7500" required /></label><p class="sealed">COMPUTE · Validation moves no funds. Encryption and wallet approval are separate.</p><button class="primary" type="submit">Encrypt and submit signal</button><button class="secondary" id="retry-finalize" type="button" hidden>Retry pending finalization</button><p id="signal-status" class="muted" role="status">No funds moved.</p></form></div></section>`
          : isMarketRoute && market
            ? `<section class="band blush-band market"><div class="band-inner"><p class="eyebrow public">{ public market }</p><h1>${market.condition}</h1><p class="route-lead">Start by reading the public condition and lifecycle. Connect a wallet only after the market, release, and privacy boundary make sense to you.</p><div class="facts"><p><b>Network</b>${market.chainLabel}</p><p><b>Cohort gate</b>${market.cohortGate}</p><p><b>Pool</b>${market.poolAddress}</p></div><ol class="market-path" aria-label="Recommended market path"><li><strong>01</strong><span>Read the public state</span></li><li><strong>02</strong><span>Check the active release</span></li><li><strong>03</strong><span>Prepare an encrypted signal</span></li></ol><div class="boundary"><p class="public"><b>PUBLIC</b> ${market.publicNotice}</p><p class="private"><b>PRIVATE</b> ${market.privateNotice}</p><p class="muted">This cohort gate does not provide anonymity or Sybil resistance.</p></div><section class="timeline"><p class="eyebrow public">{ public lifecycle }</p><p id="lifecycle-status" role="status">${lifecycleMessage}</p><button class="wallet" id="refresh-lifecycle">Refresh public state</button></section><div class="route-actions"><a class="primary" href="/pool/${market.poolAddress}/signal">Prepare encrypted signal</a><a class="text-action dark-action" href="/verify/${market.poolAddress}">Verify this release <span aria-hidden="true">↗</span></a></div></div></section>`
            : isExplainerRoute
              ? explainerContent(market)
              : landingContent(market);
  const canonicalPoolPath = manifest ? `/pool/${manifest.poolAddress}` : '/markets';
  const canonicalVerifyPath = manifest ? `/verify/${manifest.poolAddress}` : '/markets';
  const navigation = [
    navigationLink('/', 'Overview', isHomeRoute),
    navigationLink('/markets', 'Market', isMarketRoute),
    navigationLink('/how-it-works', 'How it works', isExplainerRoute),
    navigationLink(canonicalVerifyPath, 'Verify', Boolean(verifyAddress)),
    navigationLink('/position', 'Position', isPositionRoute),
  ].join('');
  root.innerHTML = `<a class="skip-link" href="#main-content">Skip to content</a><main class="app-shell"><header class="site-header"><a class="wordmark" href="/" aria-label="QuietSignal overview">QuietSignal</a><div class="header-actions"><span class="network-status" aria-label="Network: Ethereum Sepolia">Sepolia</span><button class="wallet" id="wallet">${walletState}</button></div></header><nav class="site-nav" aria-label="Primary">${navigation}</nav><section class="legend" aria-label="Privacy legend"><span>PRIVATE · owner-only</span><span>COMPUTE · encrypted work</span><span>PUBLIC · chain facts</span><span>PENDING · waiting</span></section><div id="main-content" tabindex="-1">${content}</div><section class="deployment-band"><div><p class="eyebrow">{ active Sepolia release ${releaseId} }</p><p>${message ?? (manifest ? `Verified deployment block ${manifest.deployedAtBlock}` : 'Loading verified manifest…')}</p><a class="deployment-link" href="${canonicalPoolPath}">Read public lifecycle <span aria-hidden="true">↗</span></a></div></section></main>`;
  document.querySelector<HTMLButtonElement>('#wallet')?.addEventListener('click', connectWallet);
  document
    .querySelector<HTMLButtonElement>('#refresh-lifecycle')
    ?.addEventListener('click', refreshLifecycle);
  document
    .querySelector<HTMLButtonElement>('#reveal-owner')
    ?.addEventListener('click', revealOwner);
  document.querySelectorAll<HTMLButtonElement>('[data-owner-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.ethereum || !manifest) {
        ownerMessage = 'Connect the owner wallet on Sepolia, then retry. No funds moved.';
        render();
        return;
      }
      const action = button.dataset.ownerAction;
      if (action !== 'materializeScore' && action !== 'claim' && action !== 'refund') return;
      ownerMessage = `Requesting ${action} from the owner wallet. Check the wallet before approving.`;
      render();
      try {
        const transactionHash = await submitOwnerTerminalAction(
          window.ethereum,
          manifest.poolAddress,
          action,
        );
        ownerMessage = `${action} confirmed on Sepolia: ${transactionHash.slice(0, 10)}…. Refresh the owner position before another action.`;
      } catch (error) {
        ownerMessage =
          error instanceof Error
            ? error.message
            : 'Owner action is unavailable. Read public pool state before retrying.';
      }
      render();
    });
  });
  document
    .querySelector<HTMLButtonElement>('#retry-finalize')
    ?.addEventListener('click', async (event) => {
      const status = document.querySelector<HTMLParagraphElement>('#signal-status');
      try {
        if (!window.ethereum || !manifest) throw new Error('Connect a Sepolia wallet first.');
        if (status)
          status.textContent =
            'Checking the pending finalization. No new collateral transfer is requested.';
        const transactionHash = await finalizePendingSignal(
          window.ethereum,
          manifest.poolAddress,
          (progress) => {
            if (status) status.textContent = progress;
          },
        );
        event.currentTarget.hidden = true;
        if (status)
          status.textContent = `Pending signal finalized on Sepolia: ${transactionHash.slice(0, 10)}…. Public pool state is authoritative.`;
      } catch (error) {
        if (status)
          status.textContent =
            error instanceof Error
              ? error.message
              : 'Pending finalization is unavailable. Read public pool state before retrying.';
      }
    });
  document
    .querySelector<HTMLFormElement>('#signal-form')
    ?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const status = document.querySelector<HTMLParagraphElement>('#signal-status');
      try {
        const values = validateSignalDraft({
          stake: String(data.get('stake') ?? ''),
          probability: String(data.get('probability') ?? ''),
        });
        if (!window.ethereum || !manifest) throw new Error('Connect a Sepolia wallet first.');
        if (status) status.textContent = 'Valid inputs. No funds moved. Starting local encryption…';
        const result = await submitSignalJourney(
          window.ethereum,
          manifest.poolAddress,
          manifest.collateralAddress,
          values,
          (progress) => {
            if (status) status.textContent = progress;
          },
        );
        if (status)
          status.textContent = `Signal finalized on Sepolia: ${result.finalizeTransactionHash.slice(0, 10)}…. Public pool state is authoritative.`;
      } catch (error) {
        const retry = document.querySelector<HTMLButtonElement>('#retry-finalize');
        if (error instanceof SignalJourneyError && error.allowsFinalizationRetry && retry)
          retry.hidden = false;
        if (status)
          status.textContent =
            error instanceof Error ? error.message : 'Unable to submit the signal journey.';
      } finally {
        event.currentTarget.reset();
      }
    });
}

async function revealOwner(): Promise<void> {
  if (!window.ethereum || !manifest) {
    ownerMessage = 'Connect the owner wallet on Sepolia, then retry. No funds moved.';
    render();
    return;
  }
  ownerMessage = 'Requesting owner-only decrypt authorization…';
  render();
  try {
    const position = await decryptOwnerPosition(window.ethereum, manifest.poolAddress);
    ownerMessage = position.committed
      ? `Position revealed for this session. Score: ${position.scoreBps.toString()} bps. ${position.claimed ? 'Claimed.' : position.refunded ? 'Refunded.' : 'No terminal action submitted.'}`
      : 'This wallet has no committed position for the canonical pool.';
    ownerActions = position.committed
      ? `<div class="owner-actions"><button class="secondary" data-owner-action="materializeScore">Materialize score</button><button class="secondary" data-owner-action="claim">Claim payout</button><button class="secondary" data-owner-action="refund">Request refund</button></div>`
      : '';
  } catch {
    ownerMessage =
      'Viewer access was denied or unavailable. Verify the connected owner account, then retry safely.';
  }
  render();
}

async function refreshLifecycle(): Promise<void> {
  if (!manifest) {
    lifecycleMessage =
      'The canonical public pool is unavailable. Reload the manifest, then retry; no funds moved.';
    render();
    return;
  }
  lifecycleMessage = 'Refreshing direct Ethereum Sepolia public pool state…';
  render();
  try {
    const epoch = await readPublicEpoch(manifest.poolAddress);
    const view = presentLifecycle(epoch.state);
    lifecycleMessage = `${view.label}: ${view.explanation} Participants: ${epoch.participantCount}. ${view.recovery}`;
  } catch {
    lifecycleMessage =
      'Direct public read is degraded. Retry safely or verify the canonical pool through an independent public explorer.';
  }
  render();
}

async function connectWallet(): Promise<void> {
  if (!window.ethereum) {
    walletState = 'No wallet detected';
    render('Install an EIP-1193 wallet to connect. No funds can move from this screen.');
    return;
  }
  walletState = 'Connecting…';
  render();
  try {
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (chainId !== '0xaa36a7') {
      walletState = 'Switch to Sepolia';
      render('This product only works on Ethereum Sepolia.');
      return;
    }
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    walletState =
      Array.isArray(accounts) && typeof accounts[0] === 'string'
        ? `${accounts[0].slice(0, 6)}…${accounts[0].slice(-4)}`
        : 'Disconnected';
    render('Connected to Sepolia. No transaction has been requested.');
  } catch {
    walletState = 'Connection declined';
    render('Connection was not completed. Retrying is safe and does not move funds.');
  }
}

window.ethereum?.on('accountsChanged', () => {
  walletState = 'Account changed';
  ownerMessage = 'Owner values are masked. Reveal requires your connected owner wallet.';
  ownerActions = '';
  render('Reconnect to review the current public market.');
});
window.ethereum?.on('chainChanged', () => {
  walletState = 'Network changed';
  ownerMessage = 'Owner values are masked. Reveal requires your connected owner wallet.';
  ownerActions = '';
  render('Reconnect after selecting Ethereum Sepolia.');
});
loadManifest()
  .then(() => {
    render();
    void refreshLifecycle();
  })
  .catch(() =>
    render('The canonical manifest could not be validated. Do not continue until it is available.'),
  );
