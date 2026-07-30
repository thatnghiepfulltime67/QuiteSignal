import './styles.css';
import { parsePublicManifest, type PublicManifest } from './manifest.js';
import { presentMarket } from './market.js';
import { validateSignalDraft } from './signal.js';
import { presentLifecycle } from './lifecycle.js';
import { readPublicEpoch, submitSignalIntent } from './wallet.js';

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
  const content =
    isSignalRoute && market
      ? `<section class="signal-card"><p class="eyebrow compute">{ encrypted locally }</p><h1>Prepare your signal</h1><p>Probability and collateral stay in this browser until Nox encrypts them.</p><form id="signal-form"><label>Collateral <input name="stake" inputmode="decimal" autocomplete="off" placeholder="1.00" required /></label><label>Probability (basis points) <input name="probability" inputmode="numeric" autocomplete="off" placeholder="7500" required /></label><p class="sealed">COMPUTE · Validation moves no funds. Encryption and wallet approval are separate.</p><button class="primary" type="submit">Validate before encryption</button><p id="signal-status" class="muted" role="status">No funds moved.</p></form></section>`
      : isMarketRoute && market
        ? `<section class="market"><p class="eyebrow public">{ public market }</p><h1>${market.condition}</h1><div class="facts"><p><b>Network</b>${market.chainLabel}</p><p><b>Cohort gate</b>${market.cohortGate}</p><p><b>Pool</b>${market.poolAddress}</p></div><div class="boundary"><p class="public"><b>PUBLIC</b> ${market.publicNotice}</p><p class="private"><b>PRIVATE</b> ${market.privateNotice}</p><p class="muted">This cohort gate does not provide anonymity or Sybil resistance.</p></div><section class="timeline"><p class="eyebrow public">{ public lifecycle }</p><p id="lifecycle-status" role="status">${lifecycleMessage}</p><button class="wallet" id="refresh-lifecycle">Refresh public state</button></section><a class="primary" href="/pool/${market.poolAddress}/signal">Prepare encrypted signal</a></section>`
        : `<section class="hero"><p class="eyebrow">{ confidential forecasts }</p><h1>Quiet signals.<br />Public proof.</h1><p>Signals are encrypted locally. Wallet activity, timing, and the eventual aggregate are public.</p><a class="primary" href="/markets">View market</a></section>`;
  root.innerHTML = `<main class="shell"><header><a class="wordmark" href="/markets">QuietSignal</a><button class="wallet" id="wallet">${walletState}</button></header><nav aria-label="Primary"><a href="/markets">Market</a><a href="${manifest ? `/pool/${manifest.poolAddress}` : '/markets'}">Public facts</a></nav><section class="legend" aria-label="Privacy legend"><span>PRIVATE · owner-only</span><span>COMPUTE · encrypted work</span><span>PUBLIC · chain facts</span><span>PENDING · waiting</span></section>${content}<section class="panel"><p class="eyebrow public">{ canonical Sepolia deployment }</p><p>${message ?? (manifest ? `Verified deployment block ${manifest.deployedAtBlock}` : 'Loading verified manifest…')}</p></section></main>`;
  document.querySelector<HTMLButtonElement>('#wallet')?.addEventListener('click', connectWallet);
  document
    .querySelector<HTMLButtonElement>('#refresh-lifecycle')
    ?.addEventListener('click', refreshLifecycle);
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
        if (status) status.textContent = 'Encrypting locally and requesting one signal intent…';
        const result = await submitSignalIntent(window.ethereum, manifest.poolAddress, values);
        event.currentTarget.reset();
        if (status)
          status.textContent = `Signal intent submitted: ${result.transactionHash.slice(0, 10)}…. Collateral callback and finalization are still required.`;
      } catch (error) {
        if (status)
          status.textContent = `${error instanceof Error ? error.message : 'Unable to prepare signal.'} Inspect wallet activity before retrying.`;
      }
    });
}

async function refreshLifecycle(): Promise<void> {
  if (!window.ethereum || !manifest) {
    lifecycleMessage =
      'Direct public read unavailable. Connect a Sepolia wallet, then retry; no funds moved.';
    render();
    return;
  }
  lifecycleMessage = 'Refreshing direct public pool state…';
  render();
  try {
    const epoch = await readPublicEpoch(window.ethereum, manifest.poolAddress);
    const view = presentLifecycle(epoch.state);
    lifecycleMessage = `${view.label}: ${view.explanation} Participants: ${epoch.participantCount}. ${view.recovery}`;
  } catch {
    lifecycleMessage =
      'Direct public read failed. Retry safely or verify the pool through a public explorer.';
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
  render('Reconnect to review the current public market.');
});
window.ethereum?.on('chainChanged', () => {
  walletState = 'Network changed';
  render('Reconnect after selecting Ethereum Sepolia.');
});
loadManifest()
  .then(() => render())
  .catch(() =>
    render('The canonical manifest could not be validated. Do not continue until it is available.'),
  );
