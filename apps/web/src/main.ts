import './styles.css';
import { parsePublicManifest, type PublicManifest } from './manifest.js';
import { presentMarket } from './market.js';

interface Eip1193Provider {
  request(args: { method: string }): Promise<unknown>;
  on(event: 'accountsChanged' | 'chainChanged', listener: () => void): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

let manifest: PublicManifest | undefined;
let walletState = 'No wallet detected';

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
  const content =
    isMarketRoute && market
      ? `<section class="market"><p class="eyebrow public">{ public market }</p><h1>${market.condition}</h1><div class="facts"><p><b>Network</b>${market.chainLabel}</p><p><b>Cohort gate</b>${market.cohortGate}</p><p><b>Pool</b>${market.poolAddress}</p></div><div class="boundary"><p class="public"><b>PUBLIC</b> ${market.publicNotice}</p><p class="private"><b>PRIVATE</b> ${market.privateNotice}</p><p class="muted">This cohort gate does not provide anonymity or Sybil resistance.</p></div><a class="primary" href="/pool/${market.poolAddress}/signal">Prepare encrypted signal</a></section>`
      : `<section class="hero"><p class="eyebrow">{ confidential forecasts }</p><h1>Quiet signals.<br />Public proof.</h1><p>Signals are encrypted locally. Wallet activity, timing, and the eventual aggregate are public.</p><a class="primary" href="/markets">View market</a></section>`;
  root.innerHTML = `<main class="shell"><header><a class="wordmark" href="/markets">QuietSignal</a><button class="wallet" id="wallet">${walletState}</button></header><nav aria-label="Primary"><a href="/markets">Market</a><a href="${manifest ? `/pool/${manifest.poolAddress}` : '/markets'}">Public facts</a></nav><section class="legend" aria-label="Privacy legend"><span>PRIVATE · owner-only</span><span>COMPUTE · encrypted work</span><span>PUBLIC · chain facts</span><span>PENDING · waiting</span></section>${content}<section class="panel"><p class="eyebrow public">{ canonical Sepolia deployment }</p><p>${message ?? (manifest ? `Verified deployment block ${manifest.deployedAtBlock}` : 'Loading verified manifest…')}</p></section></main>`;
  document.querySelector<HTMLButtonElement>('#wallet')?.addEventListener('click', connectWallet);
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
