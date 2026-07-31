import './styles.css';
import { parsePublicManifest, type PublicManifest } from './manifest.js';
import { presentMarket } from './market.js';
import { validateSignalDraft } from './signal.js';
import { presentVerification } from './verification.js';
import { presentLifecycle } from './lifecycle.js';
import {
  formatTokenAmount,
  parseTestAssetAmount,
  presentAssetReadiness,
  presentMarketReadiness,
} from './participant.js';
import { parseActiveRelease } from './release.js';
import {
  approveTestAsset,
  decryptOwnerPosition,
  finalizePendingSignal,
  mintTestAsset,
  readTestAssetState,
  readPublicEpoch,
  readPublicLifecycleSnapshot,
  SignalJourneyError,
  submitPermissionlessLifecycleAction,
  submitOwnerTerminalAction,
  submitSignalJourney,
  wrapTestAsset,
  type TestAssetState,
} from './wallet.js';
import type {
  LifecycleActionPresentation,
  PermissionlessLifecycleAction,
} from './lifecycle-actions.js';
import {
  isSelfTestPoolAddress,
  launchSelfTestMarket,
  loadSelfTestMarket,
  type SelfTestMarket,
} from './self-test.js';

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: 'accountsChanged' | 'chainChanged', listener: () => void): void;
}

interface WalletCandidate {
  id: string;
  name: string;
  provider: Eip1193Provider;
}

interface Eip6963ProviderDetail {
  info: { name?: string; uuid?: string };
  provider: Eip1193Provider;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

let manifest: PublicManifest | undefined;
let releaseId = 'unselected';
let manifestPhase: 'loading' | 'ready' | 'unavailable' = 'loading';
let walletState = 'No wallet detected';
let walletMenuOpen = false;
let selectedWallet: Eip1193Provider | undefined;
const walletCandidates: WalletCandidate[] = [];
const boundWalletProviders = new WeakSet<Eip1193Provider>();
let lifecycleMessage = 'Connect a Sepolia wallet to refresh public pool state.';
let lifecycleActions: LifecycleActionPresentation[] = [];
let lifecycleActionMessage =
  'Refresh public state to see contract-eligible permissionless actions.';
let lifecycleActionBusy = false;
let marketActionable = false;
let marketReadinessMessage = 'Checking whether the canonical market is accepting signals.';
let marketCohortGate = 'Loading public cohort rule…';
let ownerMessage = 'Owner values are masked. Reveal requires your connected owner wallet.';
let ownerActions = '';
let assetState: TestAssetState | undefined;
let assetMessage =
  'Connect a Sepolia wallet, then explicitly refresh the asset state before minting or revealing confidential collateral.';
let assetAmount = '100';
let assetBusy = false;
let selfTestMarket: SelfTestMarket | undefined;
let selfTestBusy = false;
let selfTestMessage =
  'Create a fresh public test market only when you are ready to approve two Sepolia deployment transactions from your own wallet.';

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

function releaseStatusContent(): string {
  return manifestPhase === 'loading'
    ? `<section class="band cocoa-band release-status"><div class="band-inner"><p class="eyebrow compute">{ verifying active release }</p><h1>Checking the live deployment.</h1><p role="status">Loading the canonical Sepolia release and public manifest. No wallet action is available during this check.</p><div class="status-rule" aria-hidden="true"><span></span><span></span><span></span></div></div></section>`
    : `<section class="band petal-band release-status unavailable"><div class="band-inner"><p class="eyebrow private">{ release unavailable }</p><h1>Do not connect or submit yet.</h1><p role="alert">The active Sepolia release could not be validated from its canonical public manifest. Reload when the deployment record is available, then verify it before a wallet action.</p><a class="text-action dark-action" href="/">Read the product overview <span aria-hidden="true">↗</span></a></div></section>`;
}

function resetWalletContext(message: string): void {
  walletState = 'Reconnect wallet';
  ownerMessage = 'Owner values are masked. Reveal requires your connected owner wallet.';
  ownerActions = '';
  assetState = undefined;
  assetMessage =
    'Wallet context changed. Refresh the test-asset state before minting, approving, wrapping, or revealing a confidential balance.';
  render(message);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character] ?? character;
  });
}

function bindWalletEvents(provider: Eip1193Provider): void {
  if (boundWalletProviders.has(provider)) return;
  boundWalletProviders.add(provider);
  provider.on('accountsChanged', () =>
    resetWalletContext('Account changed. Reconnect to review the current public market.'),
  );
  provider.on('chainChanged', () =>
    resetWalletContext('Network changed. Reconnect after selecting Ethereum Sepolia.'),
  );
}

function registerWalletCandidate(detail: Eip6963ProviderDetail): void {
  if (!detail.provider || typeof detail.provider.request !== 'function') return;
  if (walletCandidates.some(({ provider }) => provider === detail.provider)) return;
  const id = detail.info.uuid ?? `provider-${walletCandidates.length + 1}`;
  walletCandidates.push({
    id,
    name: detail.info.name?.trim() || 'Browser wallet',
    provider: detail.provider,
  });
}

function availableWallets(): WalletCandidate[] {
  const candidates = [...walletCandidates];
  if (
    window.ethereum &&
    typeof window.ethereum.request === 'function' &&
    !candidates.some(({ provider }) => provider === window.ethereum)
  ) {
    candidates.push({ id: 'injected-provider', name: 'Browser wallet', provider: window.ethereum });
  }
  return candidates;
}

function activeWallet(): Eip1193Provider | undefined {
  return selectedWallet ?? window.ethereum;
}

function routedPoolAddress(): string | undefined {
  if (location.pathname === '/self-test' || location.pathname.startsWith('/self-test/'))
    return selfTestMarket?.poolAddress;
  return manifest?.poolAddress;
}

function selfTestJoinAddress(): string | undefined {
  const match = /^\/self-test\/join\/(0x[0-9a-f]{40})$/i.exec(location.pathname);
  return match?.[1];
}

function requestWalletDiscovery(): void {
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

function walletMenuContent(): string {
  if (!walletMenuOpen || !manifest) return '';
  const candidates = availableWallets();
  const menu = candidates.length
    ? `<div class="wallet-choice-list">${candidates
        .map(
          (candidate, index) =>
            `<button class="wallet-choice" type="button" data-wallet-index="${index}"><span>${escapeHtml(candidate.name)}</span><span aria-hidden="true">↗</span></button>`,
        )
        .join('')}</div>`
    : `<p class="wallet-empty">No compatible browser wallet was detected. Install or unlock one, then retry discovery. No funds can move from this page.</p>`;
  return `<section class="wallet-menu" aria-label="Wallet connection"><p class="eyebrow">{ choose a browser wallet }</p><p>Connecting lets this page request your public account and Sepolia network. It does not submit a transaction.</p>${menu}<div class="wallet-menu-actions"><button class="text-button" id="refresh-wallets" type="button">Refresh wallets</button>${selectedWallet ? '<button class="text-button" id="disconnect-wallet" type="button">Disconnect app</button>' : ''}</div></section>`;
}

function landingContent(market?: ReturnType<typeof presentMarket>): string {
  const marketLink = market ? `/pool/${market.poolAddress}` : '/markets';
  const verifyLink = market ? `/verify/${market.poolAddress}` : '/markets';
  return `<section class="band cocoa-band hero landing-hero"><div class="band-inner"><p class="eyebrow">{ confidential forecasting on Sepolia }</p><h1>Quiet signals.<br />Public proof.</h1><p>Forecast a public condition without publishing your probability or collateral amount. Coordination stays inspectable; confidential computation stays in the protocol.</p><div class="hero-actions"><a class="primary" href="${marketLink}">Explore the active market</a><a class="secondary" href="${verifyLink}">Verify the release</a></div><p class="hero-note">Live testnet product · Wallet optional for exploration · No anonymity claim</p></div></section><section class="band petal-band landing-intro"><div class="band-inner landing-heading"><p class="eyebrow">{ the product in one minute }</p><h2>A forecasting market that reveals only what the lifecycle needs.</h2><p>QuietSignal makes one clear trade: your wallet activity and the final aggregate are public; your submitted forecast and confidential collateral stay protected until the contract permits their use.</p></div><div class="band-inner editorial-grid" aria-label="Product principles"><article><span>01</span><h3>Public coordination</h3><p>Condition, deadline, cohort threshold, lifecycle state, and settlement facts can be checked on Ethereum Sepolia.</p></article><article><span>02</span><h3>Private signal</h3><p>Your probability and collateral are encrypted in your browser with Nox. The application does not keep a plaintext shadow record.</p></article><article><span>03</span><h3>Permissionless recovery</h3><p>Timeout and recovery paths are contract-defined. A stalled interface never becomes the authority over funds.</p></article></div></section><section class="band plum-band landing-flow" id="journey"><div class="band-inner landing-heading"><p class="eyebrow compute">{ one verifiable lifecycle }</p><h2>Read → signal → aggregate → settle.</h2><p>Every step says what is public, what is encrypted, and when a wallet approval is actually needed.</p></div><ol class="band-inner flow-list"><li><strong>01 / EXPLORE</strong><span>Inspect the live condition, public cohort rule, release facts, and current lifecycle without connecting a wallet.</span></li><li><strong>02 / SIGNAL</strong><span>Choose a probability and collateral amount. Nox encrypts both locally before the wallet receives the real transaction request.</span></li><li><strong>03 / VERIFY</strong><span>Public chain state records acceptance, timing, and the aggregate lifecycle. The independent verifier remains the source of invariant conclusions.</span></li><li><strong>04 / RESOLVE</strong><span>After the documented condition and time windows, the protocol resolves or exposes a permissionless recovery route. No application transfer is required.</span></li></ol></section><section class="band blush-band landing-boundaries"><div class="band-inner landing-heading"><p class="eyebrow">{ know the boundary }</p><h2>Clear privacy promises are part of the product.</h2></div><div class="band-inner boundary-columns"><article><p class="eyebrow public">{ public }</p><h3>Coordination can be inspected.</h3><p>Wallet addresses, transaction timing, the market condition, the public lifecycle, and eventual aggregate facts are observable on-chain.</p></article><article><p class="eyebrow private">{ private }</p><h3>Your signal is not a public form value.</h3><p>Forecast probability, collateral amount, confidential handles, and proofs are not displayed by this application or routed through an app backend.</p></article><article><p class="eyebrow compute">{ recovery }</p><h3>Funds never depend on this page.</h3><p>When an operation is pending or terminal, use the public lifecycle and the contract’s claim, refund, or permissionless recovery path.</p></article></div></section><section class="band cocoa-band landing-release"><div class="band-inner release-layout"><div><p class="eyebrow">{ release facts }</p><h2>Built to be checked, not merely trusted.</h2></div><dl><div><dt>NETWORK</dt><dd>Ethereum Sepolia</dd></div><div><dt>CONFIDENTIAL COMPUTE</dt><dd>Nox in the browser and contract flow</dd></div><div><dt>ACTIVE RELEASE</dt><dd>${releaseId}</dd></div><div><dt>PUBLIC VERIFICATION</dt><dd>Manifest-bound runtime and lifecycle checks</dd></div></dl></div></section><section class="band petal-band landing-faq"><div class="band-inner landing-heading"><p class="eyebrow">{ before you start }</p><h2>Questions a careful participant should ask.</h2></div><div class="band-inner faq-list"><details><summary>Do I need a wallet to explore?</summary><p>No. Market facts, lifecycle state, and the verification view are public. A wallet is needed only for an explicit signal or owner-only action.</p></details><details><summary>Are signals anonymous?</summary><p>No. QuietSignal protects forecast and collateral values, not wallet addresses, transaction timing, or the public transaction graph.</p></details><details><summary>What happens if a browser step fails?</summary><p>Read the public pool lifecycle before retrying. The contract’s pending, claim, refund, and permissionless recovery rules—not the browser—determine the safe next action.</p></details><details><summary>Where do I verify the deployment?</summary><p>Open the verification view for the active pool. It reports manifest facts and directs you to the independent verifier for invariant conclusions.</p></details></div></section><section class="band cocoa-band landing-cta"><div class="band-inner"><p class="eyebrow">{ choose a safe first action }</p><h2>Inspect first. Connect only when you are ready.</h2><p>Start with the live market and its public state, then verify the active deployment before asking a wallet to sign.</p><div class="hero-actions"><a class="primary" href="${marketLink}">Open the market</a><a class="secondary" href="${verifyLink}">Verify the release</a></div></div></section>`;
}

function explainerContent(market?: ReturnType<typeof presentMarket>): string {
  const marketLink = market ? `/pool/${market.poolAddress}` : '/markets';
  const verifyLink = market ? `/verify/${market.poolAddress}` : '/markets';
  return `<section class="band petal-band explainer-hero"><div class="band-inner"><p class="eyebrow">{ how QuietSignal works }</p><h1>Make a signal without turning it into a public number.</h1><p>Use this guide to understand the information boundary and safe actions before a wallet approval.</p></div></section><section class="band plum-band explainer-sequence"><div class="band-inner landing-heading"><p class="eyebrow compute">{ the participant journey }</p><h2>Four moments, each with a different trust boundary.</h2></div><div class="band-inner sequence-grid"><article><span>01</span><h3>Check the market</h3><p>Read the condition, deadline, cohort rule, and public lifecycle from the active deployment. This step is wallet-free.</p></article><article><span>02</span><h3>Prepare locally</h3><p>Enter a probability and collateral amount only when you choose to signal. Nox encryption is browser-local.</p></article><article><span>03</span><h3>Approve explicitly</h3><p>Your browser wallet shows each on-chain request. The page waits for receipts and never labels a pending request as completed.</p></article><article><span>04</span><h3>Follow public state</h3><p>Use the lifecycle and independent verification facts to determine aggregation, settlement, claim, refund, or recovery next steps.</p></article></div></section><section class="band blush-band explainer-actions"><div class="band-inner"><p class="eyebrow">{ route guide }</p><h2>Use the smallest surface that answers your question.</h2><div class="action-guide"><a href="${marketLink}"><span>PUBLIC</span><strong>Market</strong><p>Condition, cohort rule, public lifecycle, and signal entry.</p></a><a href="${verifyLink}"><span>PUBLIC</span><strong>Verify</strong><p>Manifest-bound deployment facts and the independent verification boundary.</p></a><a href="/position"><span>PRIVATE</span><strong>Position</strong><p>Owner-only reveal, score, claim, and refund controls after a wallet connection.</p></a></div></div></section><section class="band cocoa-band landing-cta"><div class="band-inner"><p class="eyebrow">{ ready to inspect }</p><h2>Start from the live public state.</h2><div class="hero-actions"><a class="primary" href="${marketLink}">Explore the market</a><a class="secondary light-secondary" href="${verifyLink}">Verify the release</a></div></div></section>`;
}

function assetSetupContent(market: ReturnType<typeof presentMarket>, selfTest = false): string {
  const readiness = assetState
    ? presentAssetReadiness(assetState)
    : {
        label: 'Asset state is not loaded',
        explanation:
          'Refresh with your connected wallet to read public test tokens and reveal your own confidential collateral for this session.',
      };
  const stateRows = assetState
    ? `<dl class="asset-facts"><div><dt>PUBLIC QSFC</dt><dd>${formatTokenAmount(assetState.publicBalance)}</dd></div><div><dt>WRAPPER ALLOWANCE</dt><dd>${formatTokenAmount(assetState.allowance)}</dd></div><div><dt>PRIVATE QSCC</dt><dd>${formatTokenAmount(assetState.confidentialBalance)}</dd></div><div><dt>SEPOLIA GAS</dt><dd>${formatTokenAmount(assetState.nativeBalance)} ETH</dd></div></dl>`
    : `<p class="muted">No owner balance has been read. This page does not store account or balance data between sessions.</p>`;
  const busy = assetBusy ? ' disabled' : '';
  const marketPath = selfTest ? '/self-test' : `/pool/${market.poolAddress}`;
  const signalPath = selfTest ? '/self-test/signal' : `/pool/${market.poolAddress}/signal`;
  return `<section class="band petal-band asset-hero"><div class="band-inner"><p class="eyebrow compute">{ test asset preparation }</p><h1>Prepare collateral you control.</h1><p class="route-lead">Mint a valueless Sepolia test token to your own wallet, then approve and wrap only the amount you choose. The wrapper creates confidential collateral; this page never holds an asset or a key.</p><div class="route-callout"><p class="eyebrow public">{ current setup state }</p><h2>${readiness.label}</h2><p>${readiness.explanation}</p></div></div></section><section class="band blush-band asset-workflow"><div class="band-inner"><div class="asset-intro"><p class="eyebrow">{ wallet-guided setup }</p><h2>Mint → approve → wrap.</h2><p>All four figures below belong only to the connected wallet. Public QSFC and allowance are public ERC-20 facts; QSCC is revealed only after your explicit refresh for this browser session.</p></div><div class="panel asset-panel"><label>Amount to prepare <input id="asset-amount" name="assetAmount" inputmode="decimal" autocomplete="off" value="${escapeHtml(assetAmount)}" /></label><p class="sealed">TESTNET ONLY · QSFC has no value. You still need Sepolia ETH for transaction gas.</p><div class="asset-actions"><button class="primary" type="button" data-asset-action="mint"${busy}>1 · Mint QSFC</button><button class="secondary" type="button" data-asset-action="approve"${busy}>2 · Approve exact amount</button><button class="secondary" type="button" data-asset-action="wrap"${busy}>3 · Wrap into QSCC</button><button class="text-button" type="button" data-asset-action="refresh"${busy}>Refresh owner asset state</button></div><p role="status" class="asset-status">${assetMessage}</p>${stateRows}</div><ol class="setup-checklist" aria-label="Self-test checklist"><li><strong>01</strong><span>Connect a wallet on Ethereum Sepolia with a small amount of test ETH.</span></li><li><strong>02</strong><span>Mint QSFC, then approve and wrap an amount you are comfortable testing with.</span></li><li><strong>03</strong><span>Return to the market. Signal submission becomes available only when the immutable commit window is open.</span></li><li><strong>04</strong><span>After a confirmed signal, use Position and public lifecycle views for owner and recovery actions.</span></li></ol><div class="route-actions"><a class="primary" href="${marketPath}">Back to the market</a><a class="text-action dark-action" href="${signalPath}">Open signal route <span aria-hidden="true">↗</span></a></div></div></section>`;
}

function lifecycleActionContent(): string {
  const busy = lifecycleActionBusy ? ' disabled' : '';
  const controls = lifecycleActions.length
    ? `<div class="lifecycle-action-list">${lifecycleActions
        .map(
          (item) =>
            `<div><button class="secondary" type="button" data-lifecycle-action="${item.action}"${busy}>${item.label}</button><p>${item.explanation}</p></div>`,
        )
        .join('')}</div>`
    : '<p class="muted">No permissionless lifecycle action is eligible in the latest public state.</p>';
  return `<section class="lifecycle-actions" aria-label="Permissionless lifecycle actions"><p class="eyebrow public">{ public lifecycle action }</p><p>These actions are contract-defined and wallet-gated. They never submit an owner claim or read a private signal.</p>${controls}<p class="muted" role="status">${lifecycleActionMessage}</p></section>`;
}

function lifecycleContent(market: ReturnType<typeof presentMarket>, selfTest = false): string {
  const pool = selfTest ? selfTestMarket?.poolAddress : market.poolAddress;
  const signalPath = selfTest ? '/self-test/signal' : `/pool/${market.poolAddress}/signal`;
  const positionPath = selfTest ? '/self-test/position' : '/position';
  if (!pool) {
    return `<section class="band petal-band asset-hero"><div class="band-inner"><p class="eyebrow public">{ public lifecycle }</p><h1>No self-test market is selected.</h1><p class="route-lead">Create or join a verified self-test market before reading its lifecycle or submitting a permissionless recovery action.</p><div class="route-actions"><a class="primary" href="/self-test">Open self-test setup</a></div></div></section>`;
  }
  return `<section class="band blush-band market"><div class="band-inner"><p class="eyebrow public">{ public lifecycle }</p><h1>${selfTest ? 'Self-test lifecycle' : 'Market lifecycle'}</h1><p class="route-lead">This route is the public operational record for ${pool}. It separates permissionless lifecycle and recovery controls from market reading and participant setup.</p><div class="facts"><p><b>Pool</b>${pool}</p><p><b>Network</b>${market.chainLabel}</p><p><b>Mode</b>${selfTest ? 'User-created self-test' : 'Canonical release'}</p></div><section class="timeline"><p id="lifecycle-status" role="status">${lifecycleMessage}</p><button class="wallet" id="refresh-lifecycle" type="button">Refresh public state</button></section>${lifecycleActionContent()}<div class="route-actions"><a class="primary" href="${signalPath}">Open signal route</a><a class="secondary" href="${positionPath}">Open position</a></div></div></section>`;
}

function selfTestContent(market: ReturnType<typeof presentMarket>): string {
  const busy = selfTestBusy ? ' disabled' : '';
  const joinAddress = selfTestJoinAddress();
  const sharePath = selfTestMarket ? `/self-test/join/${selfTestMarket.poolAddress}` : undefined;
  const active = selfTestMarket
    ? `<div class="route-callout"><p class="eyebrow public">{ self-test market ready }</p><h2>Fresh OPEN epoch created.</h2><p>Pool ${selfTestMarket.poolAddress} is a user-created public test market with a 25-minute commit window and a two-participant gate. It is not the canonical release or G7 evidence.</p><dl class="asset-facts self-test-facts"><div><dt>POOL</dt><dd>${selfTestMarket.poolAddress}</dd></div><div><dt>ADAPTER</dt><dd>${selfTestMarket.adapterAddress}</dd></div><div><dt>COMMIT WINDOW</dt><dd>Until ${new Date(Number(selfTestMarket.deadline) * 1000).toLocaleTimeString()}</dd></div><div><dt>COHORT</dt><dd>${selfTestMarket.participantGate} participants</dd></div></dl><div class="route-callout self-test-share"><p class="eyebrow public">{ second participant }</p><p>Share this public, read-only entry link with another Sepolia participant. Their browser verifies the factory and immutable configuration before any wallet action.</p><a class="text-action dark-action" href="${sharePath}">${sharePath} <span aria-hidden="true">↗</span></a></div><div class="route-actions"><a class="primary" href="/self-test/assets">Prepare test collateral</a><a class="secondary" href="/self-test/signal">Prepare self-test signal</a><a class="secondary" href="/self-test/lifecycle">Open lifecycle</a><a class="text-action dark-action" href="/self-test/position">Open self-test position <span aria-hidden="true">↗</span></a></div></div>`
    : `<div class="panel self-test-panel"><p class="eyebrow compute">{ user-wallet deployment }</p><h2>Create or join a real test market.</h2><p>This creates one immutable adapter and one pool through the canonical permissionless factory. It uses only your Sepolia gas; no collateral moves and no key leaves the wallet.</p><ul class="self-test-list"><li>Condition: ETH/USD ≥ $2,000.00</li><li>Commit window: 25 minutes</li><li>Cohort gate: 2 participants</li><li>Factory, wrapper, and feed: bound to the canonical manifest</li></ul><button class="primary" id="launch-self-test" type="button"${busy}>Create self-test market</button><div class="self-test-join"><label>Existing public self-test pool <input id="join-self-test-address" inputmode="text" autocomplete="off" spellcheck="false" placeholder="0x…" value="${joinAddress ? escapeHtml(joinAddress) : ''}" /></label><button class="secondary" id="join-self-test" type="button"${busy}>Verify and join pool</button></div><p role="status" class="asset-status">${selfTestMessage}</p></div>`;
  return `<section class="band petal-band asset-hero"><div class="band-inner"><p class="eyebrow compute">{ permissionless self-test }</p><h1>Make a fresh test window.</h1><p class="route-lead">The published market has expired. This browser can create one new, public, immutable Sepolia test market from your wallet without changing the canonical release.</p>${active}</div></section><section class="band blush-band asset-workflow"><div class="band-inner"><div class="asset-intro"><p class="eyebrow">{ what this does }</p><h2>Real contracts. Your wallet. No shortcut.</h2><p>The adapter has no asset custody. The factory has no owner. The new pool uses the existing valueless test collateral flow and the same permissionless recovery rules as the product.</p></div><ol class="setup-checklist"><li><strong>01</strong><span>Connect a Sepolia wallet with enough test ETH for two deployment transactions.</span></li><li><strong>02</strong><span>Create the market, then mint and wrap QSFC into confidential QSCC.</span></li><li><strong>03</strong><span>Use two wallets to submit signals before the immutable commit deadline.</span></li><li><strong>04</strong><span>Follow the public lifecycle, settlement, owner score, claim, or refund path.</span></li></ol></div></section>`;
}

function refreshSelfTestRoute(): void {
  const joinAddress = selfTestJoinAddress();
  if (
    joinAddress &&
    (!selfTestMarket || selfTestMarket.poolAddress.toLowerCase() !== joinAddress.toLowerCase())
  ) {
    void runSelfTestJoin(joinAddress, false);
  } else if (location.pathname.startsWith('/self-test/') && selfTestMarket) {
    void refreshLifecycle(selfTestMarket.poolAddress);
  }
}

function renderRoute(): void {
  render();
  if (location.pathname.endsWith('/lifecycle')) {
    const pool = routedPoolAddress();
    if (pool) void refreshLifecycle(pool);
    return;
  }
  refreshSelfTestRoute();
}

function handleInternalNavigation(event: MouseEvent): void {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey
  )
    return;
  const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
  if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
  const destination = new URL(anchor.href, window.location.href);
  if (destination.origin !== window.location.origin) return;
  const nextPath = `${destination.pathname}${destination.search}${destination.hash}`;
  const currentPath = `${location.pathname}${location.search}${location.hash}`;
  if (nextPath === currentPath) return;
  event.preventDefault();
  history.pushState({}, '', nextPath);
  renderRoute();
}

function render(message?: string): void {
  const root = document.querySelector<HTMLDivElement>('#app');
  if (!root) return;
  if (location.pathname === '/how-it-works') history.replaceState({}, '', '/');
  const market = manifest ? presentMarket(manifest, marketCohortGate) : undefined;
  const isSelfTestRoute = location.pathname.startsWith('/self-test');
  const isSignalRoute = location.pathname.endsWith('/signal');
  const isAssetRoute = location.pathname.endsWith('/assets');
  const isLifecycleRoute = location.pathname.endsWith('/lifecycle');
  const isMarketRoute =
    location.pathname.startsWith('/markets') ||
    (location.pathname.startsWith('/pool/') && !isSignalRoute && !isAssetRoute && !isLifecycleRoute);
  const isPositionRoute =
    location.pathname === '/position' || location.pathname === '/self-test/position';
  const isHomeRoute = location.pathname === '/';
  const verifyAddress = location.pathname.startsWith('/verify/')
    ? location.pathname.slice('/verify/'.length)
    : undefined;
  const content = !manifest
    ? releaseStatusContent()
    : verifyAddress
      ? (() => {
          try {
            const view = presentVerification(manifest, verifyAddress);
            return `<section class="band petal-band verification"><div class="band-inner"><p class="eyebrow public">{ public verification }</p><h1>Verify this pool</h1><p class="route-lead">Check the active release before a wallet action. This view shows public manifest facts; it does not create an on-chain conclusion by itself.</p><div class="facts"><p><b>Chain</b>${view.chain}</p><p><b>Manifest</b>${view.manifest}</p><p><b>Evidence</b>${view.evidence}</p></div><div class="route-callout"><p class="eyebrow public">{ independent check }</p><p>The independent verifier command is the source of invariant conclusions. If a manifest, runtime, or pool binding differs, stop before a wallet action.</p><a class="text-action dark-action" href="/">Read the product overview <span aria-hidden="true">↗</span></a></div></div></section>`;
          } catch (error) {
            return `<section class="band plum-band verification"><div class="band-inner"><p class="eyebrow private">{ verification blocked }</p><h1>Pool mismatch</h1><p>${error instanceof Error ? error.message : 'The verification request is invalid.'}</p></div></section>`;
          }
        })()
      : isPositionRoute && market
        ? `<section class="band blush-band signal-card owner"><div class="band-inner"><p class="eyebrow private">{ owner only }</p><h1>Your private position</h1><p class="route-lead">This route is intentionally masked until the connected wallet proves it can view this position. Nothing is revealed or moved by opening the page.</p><div class="owner-guidance"><span>01 · Connect the owner wallet</span><span>02 · Reveal for this session</span><span>03 · Choose an explicit terminal action</span></div><div class="panel"><p role="status">${ownerMessage}</p><button class="primary" id="reveal-owner">Reveal with owner wallet</button>${ownerActions}<p class="muted">No claim or refund is submitted automatically. Re-read public pool state before retrying a pending action.</p></div></div></section>`
        : isLifecycleRoute && market
          ? lifecycleContent(market, isSelfTestRoute)
          : (location.pathname === '/self-test' || Boolean(selfTestJoinAddress())) && market
          ? selfTestContent(market)
          : isAssetRoute && market
            ? assetSetupContent(market, isSelfTestRoute)
            : isSignalRoute && market
              ? (() => {
                  const signalPool = isSelfTestRoute
                    ? selfTestMarket?.poolAddress
                    : market.poolAddress;
                  const signalReady = marketActionable && Boolean(signalPool);
                  const assetPath = isSelfTestRoute
                    ? '/self-test/assets'
                    : `/pool/${market.poolAddress}/assets`;
                  return `<section class="band plum-band signal-card"><div class="band-inner"><p class="eyebrow compute">{ encrypted locally }</p><h1>Prepare your ${isSelfTestRoute ? 'self-test ' : ''}signal</h1><p class="route-lead">Probability and collateral stay in this browser until Nox encrypts them. The process deliberately separates validation, encryption, and wallet approval.</p><div class="route-callout"><p class="eyebrow ${signalReady ? 'public' : 'private'}">{ signal readiness }</p><h2>${signalReady ? 'Commit window is open' : 'Signal is currently unavailable'}</h2><p>${signalReady ? marketReadinessMessage : isSelfTestRoute ? 'Create a self-test market in this browser session before opening its signal route.' : marketReadinessMessage}</p><a class="text-action" href="${assetPath}">Prepare test collateral <span aria-hidden="true">↗</span></a></div><ol class="journey-steps" aria-label="Signal journey steps"><li><strong>01</strong><span>Validate locally</span><small>No funds move.</small></li><li><strong>02</strong><span>Encrypt in browser</span><small>Separate pool and collateral inputs.</small></li><li><strong>03</strong><span>Confirm in wallet</span><small>Each receipt is awaited before the next stage.</small></li></ol><form id="signal-form"><label>Collateral <input name="stake" inputmode="decimal" autocomplete="off" placeholder="1.00" required${signalReady ? '' : ' disabled'} /></label><label>Probability (basis points) <input name="probability" inputmode="numeric" autocomplete="off" placeholder="7500" required${signalReady ? '' : ' disabled'} /></label><p class="sealed">COMPUTE · Validation moves no funds. Encryption and wallet approval are separate.</p><button class="primary" type="submit"${signalReady ? '' : ' disabled'}>${signalReady ? 'Encrypt and submit signal' : 'Await a fresh market release'}</button><button class="secondary" id="retry-finalize" type="button" hidden>Retry pending finalization</button><p id="signal-status" class="muted" role="status">${signalReady ? 'No funds moved.' : 'No signal can be submitted while the chain-derived market is unavailable or closed.'}</p></form></div></section>`;
                })()
              : isMarketRoute && market
                ? `<section class="band blush-band market"><div class="band-inner"><p class="eyebrow public">{ canonical MVP market }</p><h1>${market.condition}</h1><p class="route-lead">This route holds only the verified market facts and participant entry points. Public operations and recovery actions live on Lifecycle so this page remains easy to inspect.</p><div class="facts"><p><b>Network</b>${market.chainLabel}</p><p><b>Cohort gate</b>${market.cohortGate}</p><p><b>Pool</b>${market.poolAddress}</p></div><ol class="market-path" aria-label="Recommended market path"><li><strong>01</strong><span>Read the verified market facts</span></li><li><strong>02</strong><span>Prepare test collateral</span></li><li><strong>03</strong><span>Submit an encrypted signal</span></li></ol><div class="boundary"><p class="public"><b>PUBLIC</b> ${market.publicNotice}</p><p class="private"><b>PRIVATE</b> ${market.privateNotice}</p><p class="muted">This cohort gate does not provide anonymity or Sybil resistance.</p></div><div class="route-callout market-readiness"><p class="eyebrow ${marketActionable ? 'public' : 'private'}">{ actionability }</p><h2>${marketActionable ? 'Ready for participant setup' : 'Signal path is safely paused'}</h2><p>${marketReadinessMessage}</p></div><div class="route-actions"><a class="primary" href="/pool/${market.poolAddress}/assets">Get test collateral</a>${marketActionable ? `<a class="secondary" href="/pool/${market.poolAddress}/signal">Prepare encrypted signal</a>` : `<a class="secondary" href="/self-test">Create a fresh self-test market</a>`}<a class="secondary" href="/pool/${market.poolAddress}/lifecycle">Open lifecycle</a><a class="text-action dark-action" href="/verify/${market.poolAddress}">Verify this release <span aria-hidden="true">↗</span></a></div></div></section>`
                : landingContent(market);
  const canonicalPoolPath = manifest ? `/pool/${manifest.poolAddress}` : '/markets';
  const canonicalVerifyPath = manifest ? `/verify/${manifest.poolAddress}` : '/markets';
  const marketPath = isSelfTestRoute ? '/self-test' : canonicalPoolPath;
  const assetPath = isSelfTestRoute ? '/self-test/assets' : `${canonicalPoolPath}/assets`;
  const signalPath = isSelfTestRoute ? '/self-test/signal' : `${canonicalPoolPath}/signal`;
  const lifecyclePath = isSelfTestRoute ? '/self-test/lifecycle' : `${canonicalPoolPath}/lifecycle`;
  const positionPath = isSelfTestRoute ? '/self-test/position' : '/position';
  const navigation = [
    navigationLink('/', 'Overview', isHomeRoute),
    navigationLink(marketPath, 'Market', isMarketRoute || location.pathname === '/self-test'),
    navigationLink(assetPath, 'Assets', isAssetRoute),
    navigationLink(signalPath, 'Signal', isSignalRoute),
    navigationLink(lifecyclePath, 'Lifecycle', isLifecycleRoute),
    navigationLink(positionPath, 'Position', isPositionRoute),
    navigationLink(canonicalVerifyPath, 'Verify', Boolean(verifyAddress)),
    navigationLink('/self-test', 'Test', location.pathname === '/self-test' || Boolean(selfTestJoinAddress())),
  ].join('');
  root.innerHTML = `<a class="skip-link" href="#main-content">Skip to content</a><main class="app-shell"><header class="site-header"><a class="wordmark" href="/" aria-label="QuietSignal overview">QuietSignal</a><div class="header-actions"><span class="network-status" aria-label="Network: Ethereum Sepolia">Sepolia</span><button class="wallet" id="wallet" aria-expanded="${walletMenuOpen}"${manifest ? '' : ' disabled'}>${manifest ? walletState : 'Release check'}</button>${walletMenuContent()}</div></header><nav class="site-nav" aria-label="Primary tasks">${navigation}</nav><section class="legend" aria-label="Privacy legend"><span>PRIVATE · owner-only</span><span>COMPUTE · encrypted work</span><span>PUBLIC · chain facts</span><span>PENDING · waiting</span></section><div id="main-content" tabindex="-1">${content}</div><section class="deployment-band"><div><p class="eyebrow">{ active Sepolia release ${releaseId} }</p><p>${message ?? (manifest ? `Verified deployment block ${manifest.deployedAtBlock}` : manifestPhase === 'loading' ? 'Checking the canonical manifest…' : 'Canonical manifest unavailable. Do not continue with a wallet action.')}</p>${manifest ? `<a class="deployment-link" href="${canonicalPoolPath}/lifecycle">Read public lifecycle <span aria-hidden="true">↗</span></a>` : ''}</div></section></main>`;
  document.querySelector<HTMLButtonElement>('#wallet')?.addEventListener('click', () => {
    walletMenuOpen = !walletMenuOpen;
    if (walletMenuOpen) requestWalletDiscovery();
    render();
  });
  document.querySelector<HTMLButtonElement>('#refresh-wallets')?.addEventListener('click', () => {
    requestWalletDiscovery();
    render('Wallet discovery refreshed. Connecting remains a separate wallet request.');
  });
  document.querySelector<HTMLButtonElement>('#disconnect-wallet')?.addEventListener('click', () => {
    selectedWallet = undefined;
    walletMenuOpen = false;
    resetWalletContext(
      'The app no longer uses this wallet. Wallet permissions remain controlled by the extension.',
    );
  });
  document.querySelectorAll<HTMLButtonElement>('[data-wallet-index]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.walletIndex);
      const candidate = availableWallets()[index];
      if (candidate) void connectWallet(candidate.provider);
    });
  });
  document
    .querySelector<HTMLButtonElement>('#refresh-lifecycle')
    ?.addEventListener('click', refreshLifecycle);
  document
    .querySelector<HTMLButtonElement>('#refresh-self-test-lifecycle')
    ?.addEventListener('click', () => void refreshLifecycle(selfTestMarket?.poolAddress));
  document.querySelectorAll<HTMLButtonElement>('[data-lifecycle-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.lifecycleAction as PermissionlessLifecycleAction | undefined;
      if (action) void runPermissionlessLifecycleAction(action);
    });
  });
  document
    .querySelector<HTMLButtonElement>('#reveal-owner')
    ?.addEventListener('click', revealOwner);
  document
    .querySelector<HTMLButtonElement>('#launch-self-test')
    ?.addEventListener('click', () => void runSelfTestLaunch());
  document.querySelector<HTMLButtonElement>('#join-self-test')?.addEventListener('click', () => {
    const address =
      document.querySelector<HTMLInputElement>('#join-self-test-address')?.value ?? '';
    void runSelfTestJoin(address, true);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-owner-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const provider = activeWallet();
      if (!provider || !manifest) {
        ownerMessage = 'Connect the owner wallet on Sepolia, then retry. No funds moved.';
        render();
        return;
      }
      const action = button.dataset.ownerAction;
      if (action !== 'materializeScore' && action !== 'claim' && action !== 'refund') return;
      const pool = routedPoolAddress();
      if (!pool) {
        ownerMessage =
          'The selected pool is unavailable. Refresh the public route before retrying.';
        render();
        return;
      }
      ownerMessage = `Requesting ${action} from the owner wallet. Check the wallet before approving.`;
      render();
      try {
        const transactionHash = await submitOwnerTerminalAction(provider, pool, action);
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
        const provider = activeWallet();
        const pool = routedPoolAddress();
        if (!provider || !pool) throw new Error('Connect a Sepolia wallet first.');
        if (status)
          status.textContent =
            'Checking the pending finalization. No new collateral transfer is requested.';
        const transactionHash = await finalizePendingSignal(provider, pool, (progress) => {
          if (status) status.textContent = progress;
        });
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
  document.querySelectorAll<HTMLButtonElement>('[data-asset-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.assetAction;
      if (action === 'mint' || action === 'approve' || action === 'wrap' || action === 'refresh')
        void runAssetAction(action);
    });
  });
  document
    .querySelector<HTMLFormElement>('#signal-form')
    ?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const status = document.querySelector<HTMLParagraphElement>('#signal-status');
      try {
        if (!marketActionable)
          throw new Error(
            'This market is not accepting a signal. Refresh the public lifecycle and wait for a verified fresh release before retrying.',
          );
        const values = validateSignalDraft({
          stake: String(data.get('stake') ?? ''),
          probability: String(data.get('probability') ?? ''),
        });
        const provider = activeWallet();
        const pool = routedPoolAddress();
        if (!provider || !manifest || !pool) throw new Error('Connect a Sepolia wallet first.');
        if (status) status.textContent = 'Valid inputs. No funds moved. Starting local encryption…';
        const result = await submitSignalJourney(
          provider,
          pool,
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

async function refreshAssetState(): Promise<void> {
  const provider = activeWallet();
  if (!provider || !manifest) {
    assetState = undefined;
    assetMessage = 'Connect a Sepolia wallet before refreshing owner asset state. No funds moved.';
    render();
    return;
  }
  assetMessage =
    'Reading public test-asset state and requesting owner-only confidential balance access for this session…';
  render();
  try {
    assetState = await readTestAssetState(
      provider,
      manifest.faucetAddress,
      manifest.collateralAddress,
    );
    const readiness = presentAssetReadiness(assetState);
    assetMessage = `${readiness.label}: ${readiness.explanation}`;
  } catch (error) {
    assetState = undefined;
    assetMessage =
      error instanceof Error
        ? `${error.message} No funds moved; confirm the connected owner account and retry safely.`
        : 'Asset state could not be refreshed. No funds moved; retry with the connected owner wallet.';
  }
  render();
}

async function runAssetAction(action: 'mint' | 'approve' | 'wrap' | 'refresh'): Promise<void> {
  if (action === 'refresh') {
    await refreshAssetState();
    return;
  }
  const amountInput = document.querySelector<HTMLInputElement>('#asset-amount');
  assetAmount = amountInput?.value ?? assetAmount;
  const provider = activeWallet();
  if (!provider || !manifest) {
    assetMessage = 'Connect a Sepolia wallet before preparing test collateral. No funds moved.';
    render();
    return;
  }
  try {
    const amount = parseTestAssetAmount(assetAmount);
    assetBusy = true;
    assetMessage = {
      mint: 'Requesting a valueless QSFC mint to your connected wallet. Confirm it in the wallet, then wait for the public Sepolia receipt.',
      approve:
        'Requesting an exact QSFC allowance for the immutable confidential wrapper. Confirm it in the wallet, then wait for the receipt.',
      wrap: 'Requesting a 1:1 confidential wrap. Public QSFC remains yours until this wallet transaction confirms.',
    }[action];
    render();
    const transactionHash = await {
      mint: mintTestAsset,
      approve: approveTestAsset,
      wrap: wrapTestAsset,
    }[action](provider, manifest.faucetAddress, manifest.collateralAddress, amount);
    assetMessage = `${action === 'mint' ? 'Mint' : action === 'approve' ? 'Approval' : 'Wrap'} confirmed on Sepolia: ${transactionHash.slice(0, 10)}…. Refreshing the owner asset state.`;
    assetBusy = false;
    render();
    await refreshAssetState();
  } catch (error) {
    assetBusy = false;
    assetMessage =
      error instanceof Error
        ? `${error.message} Read the current wallet and public state before retrying.`
        : 'The asset action was not confirmed. No application-controlled transfer occurred; refresh before retrying.';
    render();
  }
}

async function runSelfTestLaunch(): Promise<void> {
  const provider = activeWallet();
  if (!provider || !manifest) {
    selfTestMessage =
      'Connect a Sepolia wallet before creating a self-test market. No transaction was sent.';
    render();
    return;
  }
  selfTestBusy = true;
  selfTestMessage =
    'Validating the canonical factory, wrapper, and feed before requesting the first wallet deployment.';
  render();
  try {
    selfTestMarket = await launchSelfTestMarket(
      provider,
      {
        canonicalPoolAddress: manifest.poolAddress,
        factoryAddress: manifest.factoryAddress,
        factoryRuntimeCodeHash: manifest.factoryRuntimeCodeHash,
        collateralAddress: manifest.collateralAddress,
        feedAddress: manifest.feedAddress,
        threshold: manifest.threshold,
        comparison: manifest.comparison,
      },
      (progress) => {
        selfTestMessage = progress;
        render();
      },
    );
    selfTestBusy = false;
    marketActionable = true;
    marketCohortGate = `At least ${selfTestMarket.participantGate} participants`;
    selfTestMessage = `Self-test pool ${selfTestMarket.poolAddress.slice(0, 10)}… is confirmed. Refreshing its public lifecycle.`;
    await refreshLifecycle(selfTestMarket.poolAddress);
  } catch (error) {
    selfTestBusy = false;
    selfTestMessage =
      error instanceof Error
        ? `${error.message} No canonical release was changed; inspect any confirmed receipt before retrying.`
        : 'The self-test market was not confirmed. No canonical release was changed; retry only after checking your wallet history.';
    render();
  }
}

async function runSelfTestJoin(poolAddress: string, updateUrl: boolean): Promise<void> {
  const address = poolAddress.trim();
  if (!isSelfTestPoolAddress(address)) {
    selfTestMessage =
      'Enter a valid public self-test pool address. No wallet request or transaction was sent.';
    render();
    return;
  }
  if (!manifest) {
    selfTestMessage = 'The canonical manifest must be validated before joining a self-test pool.';
    render();
    return;
  }
  if (updateUrl) history.pushState({}, '', `/self-test/join/${address}`);
  selfTestMarket = undefined;
  selfTestBusy = true;
  selfTestMessage =
    'Verifying the factory mapping and immutable self-test configuration from Sepolia. No wallet request is needed.';
  render();
  try {
    selfTestMarket = await loadSelfTestMarket(address, {
      canonicalPoolAddress: manifest.poolAddress,
      factoryAddress: manifest.factoryAddress,
      factoryRuntimeCodeHash: manifest.factoryRuntimeCodeHash,
      collateralAddress: manifest.collateralAddress,
      feedAddress: manifest.feedAddress,
      threshold: manifest.threshold,
      comparison: manifest.comparison,
    });
    selfTestBusy = false;
    selfTestMessage = `Verified self-test pool ${selfTestMarket.poolAddress.slice(0, 10)}…. Refreshing its public lifecycle.`;
    await refreshLifecycle(selfTestMarket.poolAddress);
  } catch (error) {
    selfTestBusy = false;
    selfTestMessage =
      error instanceof Error
        ? `${error.message} No wallet request or transaction was sent.`
        : 'The public self-test pool could not be verified. No wallet request or transaction was sent.';
    render();
  }
}

async function runPermissionlessLifecycleAction(
  action: PermissionlessLifecycleAction,
): Promise<void> {
  const provider = activeWallet();
  const pool = routedPoolAddress();
  if (!provider || !pool) {
    lifecycleActionMessage =
      'Connect a Sepolia wallet and refresh this public pool before requesting a lifecycle action.';
    render();
    return;
  }
  lifecycleActionBusy = true;
  lifecycleActionMessage =
    'Preparing the contract-defined lifecycle action. No transaction has been sent.';
  render();
  try {
    const transactionHash = await submitPermissionlessLifecycleAction(
      provider,
      pool,
      action,
      (progress) => {
        lifecycleActionMessage = progress;
        render();
      },
    );
    lifecycleActionBusy = false;
    lifecycleActionMessage = `Lifecycle action confirmed on Sepolia: ${transactionHash.slice(0, 10)}…. Refreshing public state.`;
    await refreshLifecycle(pool);
  } catch (error) {
    lifecycleActionBusy = false;
    lifecycleActionMessage =
      error instanceof Error
        ? error.message
        : 'The lifecycle action was not confirmed. Refresh public state before retrying.';
    render();
  }
}

async function revealOwner(): Promise<void> {
  const provider = activeWallet();
  const pool = routedPoolAddress();
  if (!provider || !pool) {
    ownerMessage = 'Connect the owner wallet on Sepolia, then retry. No funds moved.';
    render();
    return;
  }
  ownerMessage = 'Requesting owner-only decrypt authorization…';
  render();
  try {
    const [position, epoch] = await Promise.all([
      decryptOwnerPosition(provider, pool),
      readPublicEpoch(pool),
    ]);
    ownerMessage = position.committed
      ? `Position revealed for this session. Collateral: ${formatTokenAmount(position.stake)} QSCC. Forecast: ${position.probabilityBps.toString()} bps. ${position.scoreAvailable ? `Score: ${position.scoreBps.toString()} bps.` : 'Score has not been materialized.'} ${position.claimed ? 'Claimed.' : position.refunded ? 'Refunded.' : 'No terminal action submitted.'}`
      : 'This wallet has no committed position for the selected public pool.';
    ownerActions = '';
    if (position.committed && !position.claimed && !position.refunded) {
      if (epoch.state === 4) {
        ownerActions = `<div class="owner-actions"><button class="secondary" data-owner-action="materializeScore">Materialize score</button><button class="secondary" data-owner-action="claim">Claim payout</button></div><p class="muted">Settlement is public. Score materialization and payout are separate explicit owner-wallet requests.</p>`;
      } else if (epoch.state === 5) {
        ownerActions = `<div class="owner-actions"><button class="secondary" data-owner-action="refund">Request refund</button></div><p class="muted">This epoch is publicly refundable. The refund returns confidential collateral to the connected owner after its receipt confirms.</p>`;
      } else {
        ownerActions = `<p class="muted">Terminal actions are unavailable in the current public lifecycle state. Refresh the public market before trying again.</p>`;
      }
    }
  } catch {
    ownerMessage =
      'Viewer access was denied or unavailable. Verify the connected owner account, then retry safely.';
  }
  render();
}

async function refreshLifecycle(pool = routedPoolAddress()): Promise<void> {
  if (!pool) {
    lifecycleMessage =
      'The canonical public pool is unavailable. Reload the manifest, then retry; no funds moved.';
    render();
    return;
  }
  lifecycleMessage = 'Refreshing direct Ethereum Sepolia public pool state…';
  marketReadinessMessage = 'Checking the immutable commit window against the latest Sepolia block…';
  lifecycleActionMessage =
    'Checking which permissionless actions are eligible in the latest public state…';
  lifecycleActions = [];
  render();
  try {
    const epoch = await readPublicLifecycleSnapshot(pool);
    const view = presentLifecycle(epoch.state, {
      deadline: epoch.deadline,
      observedAt: epoch.observedAt,
    });
    const readiness = presentMarketReadiness({
      state: epoch.state,
      deadline: epoch.deadline,
      observedAt: epoch.observedAt,
    });
    marketActionable = readiness.actionable;
    marketCohortGate = `At least ${epoch.kMin} participants`;
    marketReadinessMessage = `${readiness.label}: ${readiness.explanation}`;
    lifecycleMessage = `${view.label}: ${view.explanation} Participants: ${epoch.participantCount}. ${view.recovery}`;
    lifecycleActions = epoch.actions;
    lifecycleActionMessage = epoch.actions.length
      ? 'The actions below were derived from the latest public Sepolia state. Each still requires its own wallet confirmation.'
      : 'No permissionless lifecycle action is eligible in the latest public state.';
  } catch {
    marketActionable = false;
    lifecycleActions = [];
    marketReadinessMessage =
      'The latest public market state could not be read. Signal submission stays disabled until a direct Sepolia refresh succeeds.';
    lifecycleMessage =
      'Direct public read is degraded. Retry safely or verify the canonical pool through an independent public explorer.';
    lifecycleActionMessage =
      'Permissionless actions stay unavailable until a direct Sepolia public refresh succeeds.';
  }
  render();
}

async function connectWallet(provider?: Eip1193Provider): Promise<void> {
  const wallet = provider ?? activeWallet();
  if (!wallet) {
    walletState = 'No wallet detected';
    walletMenuOpen = true;
    render(
      'Install or unlock an EIP-1193 wallet, then refresh discovery. No funds can move from this screen.',
    );
    return;
  }
  selectedWallet = wallet;
  bindWalletEvents(wallet);
  walletMenuOpen = false;
  walletState = 'Connecting…';
  render();
  try {
    let chainId = await wallet.request({ method: 'eth_chainId' });
    if (chainId !== '0xaa36a7') {
      walletState = 'Switching to Sepolia…';
      render(
        'Requesting the Ethereum Sepolia network in your wallet. No transaction is being submitted.',
      );
      await wallet.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xaa36a7' }],
      });
      chainId = await wallet.request({ method: 'eth_chainId' });
      if (chainId !== '0xaa36a7') throw new Error('Wallet did not switch to Ethereum Sepolia.');
    }
    const accounts = await wallet.request({ method: 'eth_requestAccounts' });
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

window.addEventListener('eip6963:announceProvider', (event) => {
  const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
  if (!detail) return;
  registerWalletCandidate(detail);
  if (walletMenuOpen) render();
});

document.addEventListener('click', handleInternalNavigation);
window.addEventListener('popstate', renderRoute);

render('Checking the canonical Sepolia release. No wallet action is available yet.');
loadManifest()
  .then(() => {
    manifestPhase = 'ready';
    render();
    if (selfTestJoinAddress()) refreshSelfTestRoute();
    else void refreshLifecycle();
  })
  .catch(() => {
    manifestPhase = 'unavailable';
    render('The canonical manifest could not be validated. Do not continue until it is available.');
  });
