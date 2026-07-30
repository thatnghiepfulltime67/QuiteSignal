import './styles.css';
import { parsePublicManifest, type PublicManifest } from './manifest.js';
import { presentMarket } from './market.js';
import { validateSignalDraft } from './signal.js';
import { presentVerification } from './verification.js';
import { presentLifecycle } from './lifecycle.js';
import {
  decryptOwnerPosition,
  finalizePendingSignal,
  readPublicEpoch,
  SignalJourneyError,
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
let walletState = 'No wallet detected';
let lifecycleMessage = 'Connect a Sepolia wallet to refresh public pool state.';
let ownerMessage = 'Owner values are masked. Reveal requires your connected owner wallet.';

async function loadManifest(): Promise<void> {
  const response = await fetch('/quiet-signal.json');
  manifest = parsePublicManifest(await response.json());
}

function render(message?: string): void {
  const root = document.querySelector<HTMLDivElement>('#app');
  if (!root) return;
  const market = manifest ? presentMarket(manifest) : undefined;
  const isMarketRoute =
    location.pathname.startsWith('/markets') || location.pathname.startsWith('/pool/');
  const isSignalRoute = location.pathname.endsWith('/signal');
  const isPositionRoute = location.pathname === '/position';
  const verifyAddress = location.pathname.startsWith('/verify/')
    ? location.pathname.slice('/verify/'.length)
    : undefined;
  const content =
    verifyAddress && manifest
      ? (() => {
          try {
            const view = presentVerification(manifest, verifyAddress);
            return `<section class="band petal-band verification"><div class="band-inner"><p class="eyebrow public">{ public verification }</p><h1>Verify this pool</h1><div class="facts"><p><b>Chain</b>${view.chain}</p><p><b>Manifest</b>${view.manifest}</p><p><b>Evidence</b>${view.evidence}</p></div><div class="panel"><p class="muted">The independent verifier command is the source of invariant conclusions.</p></div></div></section>`;
          } catch (error) {
            return `<section class="band plum-band verification"><div class="band-inner"><p class="eyebrow private">{ verification blocked }</p><h1>Pool mismatch</h1><p>${error instanceof Error ? error.message : 'The verification request is invalid.'}</p></div></section>`;
          }
        })()
      : isPositionRoute && market
        ? `<section class="band blush-band signal-card owner"><div class="band-inner"><p class="eyebrow private">{ owner only }</p><h1>Your private position</h1><div class="panel"><p role="status">${ownerMessage}</p><button class="primary" id="reveal-owner">Reveal with owner wallet</button><p class="muted">No claim or refund is submitted automatically.</p></div></div></section>`
        : isSignalRoute && market
          ? `<section class="band plum-band signal-card"><div class="band-inner"><p class="eyebrow compute">{ encrypted locally }</p><h1>Prepare your signal</h1><p>Probability and collateral stay in this browser until Nox encrypts them.</p><form id="signal-form"><label>Collateral <input name="stake" inputmode="decimal" autocomplete="off" placeholder="1.00" required /></label><label>Probability (basis points) <input name="probability" inputmode="numeric" autocomplete="off" placeholder="7500" required /></label><p class="sealed">COMPUTE · Validation moves no funds. Encryption and wallet approval are separate.</p><button class="primary" type="submit">Encrypt and submit signal</button><button class="secondary" id="retry-finalize" type="button" hidden>Retry pending finalization</button><p id="signal-status" class="muted" role="status">No funds moved.</p></form></div></section>`
          : isMarketRoute && market
            ? `<section class="band blush-band market"><div class="band-inner"><p class="eyebrow public">{ public market }</p><h1>${market.condition}</h1><div class="facts"><p><b>Network</b>${market.chainLabel}</p><p><b>Cohort gate</b>${market.cohortGate}</p><p><b>Pool</b>${market.poolAddress}</p></div><div class="boundary"><p class="public"><b>PUBLIC</b> ${market.publicNotice}</p><p class="private"><b>PRIVATE</b> ${market.privateNotice}</p><p class="muted">This cohort gate does not provide anonymity or Sybil resistance.</p></div><section class="timeline"><p class="eyebrow public">{ public lifecycle }</p><p id="lifecycle-status" role="status">${lifecycleMessage}</p><button class="wallet" id="refresh-lifecycle">Refresh public state</button></section><a class="primary" href="/pool/${market.poolAddress}/signal">Prepare encrypted signal</a></div></section>`
            : `<section class="band cocoa-band hero"><div class="band-inner"><p class="eyebrow">{ confidential forecasts }</p><h1>Quiet signals.<br />Public proof.</h1><p>Signals are encrypted locally. Wallet activity, timing, and the eventual aggregate are public.</p><a class="primary" href="/markets">View market</a></div></section>`;
  root.innerHTML = `<main class="app-shell"><header class="site-header"><a class="wordmark" href="/markets">QuietSignal</a><button class="wallet" id="wallet">${walletState}</button></header><nav class="site-nav" aria-label="Primary"><a href="/markets">Market</a><a href="${manifest ? `/pool/${manifest.poolAddress}` : '/markets'}">Public facts</a></nav><section class="legend" aria-label="Privacy legend"><span>PRIVATE · owner-only</span><span>COMPUTE · encrypted work</span><span>PUBLIC · chain facts</span><span>PENDING · waiting</span></section>${content}<section class="deployment-band"><div><p class="eyebrow">{ canonical Sepolia deployment }</p><p>${message ?? (manifest ? `Verified deployment block ${manifest.deployedAtBlock}` : 'Loading verified manifest…')}</p></div></section></main>`;
  document.querySelector<HTMLButtonElement>('#wallet')?.addEventListener('click', connectWallet);
  document
    .querySelector<HTMLButtonElement>('#refresh-lifecycle')
    ?.addEventListener('click', refreshLifecycle);
  document
    .querySelector<HTMLButtonElement>('#reveal-owner')
    ?.addEventListener('click', revealOwner);
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
  render('Reconnect to review the current public market.');
});
window.ethereum?.on('chainChanged', () => {
  walletState = 'Network changed';
  ownerMessage = 'Owner values are masked. Reveal requires your connected owner wallet.';
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
