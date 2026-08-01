import './styles.css';
import { parsePublicManifest, type PublicManifest } from './manifest.js';
import { presentMarket } from './market.js';
import { probabilityPercentToBps, validateSignalDraft } from './signal.js';
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
  readPublicTestAssetState,
  readTestAssetState,
  readPublicEpoch,
  readPublicLifecycleSnapshot,
  SignalJourneyError,
  submitPermissionlessLifecycleAction,
  submitOwnerTerminalAction,
  submitSignalJourney,
  wrapTestAsset,
  type PublicTestAssetState,
  type TestAssetState,
} from './wallet.js';
import type {
  LifecycleActionAvailability,
  LifecycleActionPresentation,
  PermissionlessLifecycleAction,
} from './lifecycle-actions.js';
import {
  isSelfTestPoolAddress,
  launchSelfTestMarket,
  loadSelfTestMarket,
  formatSelfTestUsdThreshold,
  selfTestPolicyForDraft,
  selfTestPolicyForSelection,
  type SelfTestMarket,
  type SelfTestPolicy,
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
let lifecycleActionAvailability: LifecycleActionAvailability[] = [];
let lifecycleActionMessage =
  'Refresh public state to see contract-eligible permissionless actions.';
let lifecycleActionBusy = false;
let marketActionable = false;
let marketReadinessMessage = 'Checking whether the canonical market is accepting signals.';
let marketCohortGate = 'Loading public cohort rule…';
let ownerMessage = 'Owner values are masked. Reveal requires your connected owner wallet.';
let ownerActions = '';
let assetState: TestAssetState | undefined;
let headerBalance: PublicTestAssetState | undefined;
let headerBalanceBusy = false;
let assetMessage =
  'Connect a Sepolia wallet, then explicitly refresh the asset state before minting or revealing confidential collateral.';
let assetAmount = '100';
let assetBusy = false;
let selfTestMarket: SelfTestMarket | undefined;
const selfTestMarkets: SelfTestMarket[] = [];
let selectedMarketKey = 'canonical';
let selfTestBusy = false;
let selfTestMessage =
  'Create a fresh public test market only when you are ready to approve two Sepolia deployment transactions from your own wallet.';
type InteractionToastTone = 'pending' | 'success' | 'error';
let interactionBusy = false;
let interactionToast:
  | {
      message: string;
      tone: InteractionToastTone;
    }
  | undefined;
const defaultSelfTestPolicy = selfTestPolicyForSelection('greater-or-equal', '200000000000', 25, 2);
if (!defaultSelfTestPolicy) throw new Error('The default self-test policy is unavailable.');
let selfTestPolicy = defaultSelfTestPolicy;

function rememberSelfTestMarket(market: SelfTestMarket): void {
  const index = selfTestMarkets.findIndex(
    (known) => known.poolAddress.toLowerCase() === market.poolAddress.toLowerCase(),
  );
  if (index >= 0) selfTestMarkets[index] = market;
  else selfTestMarkets.unshift(market);
  selfTestMarket = market;
}

interface PublishedSelfTestPool {
  poolAddress: string;
  policy: {
    comparison: string;
    threshold: string;
    minutes: number;
    gate: number;
  };
  startedAt: string;
}

async function loadPublishedSelfTestMarkets(): Promise<void> {
  if (!manifest) return;
  try {
    const response = await fetch('/verified-self-test-pools.json');
    if (!response.ok) return;
    const records = (await response.json()) as unknown;
    if (!Array.isArray(records)) return;
    const loaded = await Promise.all(
      records.map(async (record): Promise<SelfTestMarket | undefined> => {
        if (!record || typeof record !== 'object') return undefined;
        const candidate = record as PublishedSelfTestPool;
        if (
          !isSelfTestPoolAddress(candidate.poolAddress) ||
          !candidate.policy ||
          typeof candidate.policy.comparison !== 'string' ||
          typeof candidate.policy.threshold !== 'string' ||
          !Number.isInteger(candidate.policy.minutes) ||
          !Number.isInteger(candidate.policy.gate) ||
          !/^\d+$/.test(candidate.startedAt)
        )
          return undefined;
        const policy = selfTestPolicyForSelection(
          candidate.policy.comparison,
          candidate.policy.threshold,
          candidate.policy.minutes,
          candidate.policy.gate,
        );
        if (!policy) return undefined;
        try {
          return await loadSelfTestMarket(candidate.poolAddress, {
            canonicalPoolAddress: manifest.poolAddress,
            factoryAddress: manifest.factoryAddress,
            factoryRuntimeCodeHash: manifest.factoryRuntimeCodeHash,
            collateralAddress: manifest.collateralAddress,
            feedAddress: manifest.feedAddress,
            policy,
            expectedStartTimestamp: BigInt(candidate.startedAt),
          });
        } catch {
          return undefined;
        }
      }),
    );
    for (const market of loaded) {
      if (market) rememberSelfTestMarket(market);
    }
    if (selfTestMarket) selectedMarketKey = 'canonical';
  } catch {
    // A registry failure leaves the canonical market available without trusting a record.
  }
}

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
  headerBalance = undefined;
  headerBalanceBusy = false;
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

function interactionToastContent(): string {
  if (!interactionToast) return '';
  const label =
    interactionToast.tone === 'success'
      ? 'Confirmed'
      : interactionToast.tone === 'error'
        ? 'Action needs attention'
        : 'Wallet action in progress';
  return `<aside class="operation-toast ${interactionToast.tone}" role="status" aria-live="polite"><div><p class="eyebrow">{ ${label.toLowerCase()} }</p><p>${escapeHtml(interactionToast.message)}</p></div><button class="toast-dismiss" id="dismiss-operation-toast" type="button" aria-label="Dismiss notification">×</button></aside>`;
}

function beginWalletInteraction(message: string): boolean {
  if (interactionBusy) return false;
  interactionBusy = true;
  interactionToast = { message, tone: 'pending' };
  render();
  return true;
}

function reportWalletInteraction(message: string): void {
  if (!interactionBusy) return;
  interactionToast = { message, tone: 'pending' };
  render();
}

function endWalletInteraction(
  message: string,
  tone: Exclude<InteractionToastTone, 'pending'>,
): void {
  interactionBusy = false;
  interactionToast = { message, tone };
  render();
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
  const selectedSelfTestAddress = selectedMarketKey.startsWith('self-test:')
    ? selectedMarketKey.slice('self-test:'.length)
    : undefined;
  if (selectedSelfTestAddress) return selectedSelfTestAddress;
  if (location.pathname === '/self-test' || location.pathname.startsWith('/self-test/'))
    return selfTestMarket?.poolAddress;
  return manifest?.poolAddress;
}

function selfTestJoinAddress(): string | undefined {
  const match = /^\/self-test\/join\/(0x[0-9a-f]{40})$/i.exec(location.pathname);
  return match?.[1];
}

function selfTestPolicyFromRoute(): SelfTestPolicy | undefined {
  const parameters = new URLSearchParams(location.search);
  if (
    !parameters.has('comparison') &&
    !parameters.has('threshold') &&
    !parameters.has('minutes') &&
    !parameters.has('gate')
  )
    return defaultSelfTestPolicy;
  const comparison = parameters.get('comparison');
  const threshold = parameters.get('threshold');
  const minutes = parameters.get('minutes');
  const gate = parameters.get('gate');
  if (
    !comparison ||
    !threshold ||
    !minutes ||
    !gate ||
    !/^\d+$/.test(threshold) ||
    !/^\d+$/.test(minutes) ||
    !/^\d+$/.test(gate)
  )
    return undefined;
  return selfTestPolicyForSelection(comparison, threshold, Number(minutes), Number(gate));
}

function selfTestStartTimestampFromRoute(): bigint | undefined {
  const value = new URLSearchParams(location.search).get('startedAt');
  if (!value || !/^\d+$/.test(value)) return undefined;
  const timestamp = BigInt(value);
  return timestamp > 0n ? timestamp : undefined;
}

function selfTestSharePath(poolAddress: string, policy: SelfTestPolicy, startedAt: bigint): string {
  const parameters = new URLSearchParams({
    comparison: policy.comparison,
    threshold: policy.threshold,
    minutes: String(policy.commitWindowMinutes),
    gate: String(policy.participantGate),
    startedAt: startedAt.toString(),
  });
  return `/self-test/join/${poolAddress}?${parameters.toString()}`;
}

function selectedSelfTestPolicy(): SelfTestPolicy | undefined {
  const comparison = document.querySelector<HTMLSelectElement>('#self-test-comparison')?.value;
  const threshold = document.querySelector<HTMLInputElement>('#self-test-threshold')?.value;
  const minutes = document.querySelector<HTMLSelectElement>('#self-test-duration')?.value;
  const gate = document.querySelector<HTMLInputElement>('#self-test-gate')?.value;
  if (!comparison || !threshold || !minutes || !gate) return undefined;
  return selfTestPolicyForDraft(comparison, threshold, Number(minutes), Number(gate));
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

function headerBalanceContent(): string {
  if (!selectedWallet) return '';
  const eth = headerBalance ? `${formatTokenAmount(headerBalance.nativeBalance)} ETH` : 'ETH —';
  const qsfc = headerBalance ? `QSFC ${formatTokenAmount(headerBalance.publicBalance)}` : 'QSFC —';
  const qscc = assetState
    ? `QSCC ${formatTokenAmount(assetState.confidentialBalance)}`
    : 'QSCC hidden';
  const revealLabel = assetState ? 'Refresh' : 'Reveal';
  return `<section class="balance-strip" aria-label="Connected wallet balances"><span>${eth}</span><span>${qsfc}</span><span>${qscc}</span><button class="header-reveal" id="reveal-header-qscc" type="button"${headerBalanceBusy ? ' disabled' : ''}>${headerBalanceBusy ? 'Reading…' : revealLabel}</button></section>`;
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

function assetPanelContent(): string {
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
  return `<div class="panel asset-panel compact-asset-panel"><label>Amount <input id="asset-amount" name="assetAmount" inputmode="decimal" autocomplete="off" value="${escapeHtml(assetAmount)}" /></label><div class="asset-actions"><button class="primary" type="button" data-asset-action="mint"${busy}>Mint QSFC</button><button class="secondary" type="button" data-asset-action="wrap"${busy}>Wrap QSCC</button><button class="secondary" id="reveal-collateral-qscc" type="button"${headerBalanceBusy ? ' disabled' : ''}>${headerBalanceBusy ? 'Reading…' : 'Reveal QSCC'}</button><button class="text-button asset-refresh-icon" type="button" data-asset-action="refresh"${busy} aria-label="Refresh balances" title="Refresh balances">↻</button></div><p role="status" class="asset-status">${readiness.label}: ${readiness.explanation} ${assetMessage}</p>${stateRows}</div>`;
}

function assetSetupContent(): string {
  return `<section class="band petal-band portfolio"><div class="band-inner"><p class="eyebrow compute">{ wallet collateral }</p><h1>Prepare collateral</h1><p class="route-lead">Mint, approve, and wrap test collateral from one compact wallet panel.</p>${assetPanelContent()}</div></section>`;
}

function signalPanelContent(market: ReturnType<typeof presentMarket>, selfTest = false): string {
  const signalPool = selfTest ? selfTestMarket?.poolAddress : market.poolAddress;
  const signalReady = marketActionable && Boolean(signalPool);
  const unavailableMessage = marketReadinessMessage.includes('Checking')
    ? 'The commit window is unavailable until a direct Sepolia lifecycle read succeeds.'
    : marketReadinessMessage;
  const freshPoolAction = signalReady
    ? ''
    : '<a class="text-action dark-action" href="/self-test?new=1">Create a fresh test market <span aria-hidden="true">↗</span></a>';
  return `<div class="market-action-panel"><p class="eyebrow compute">{ encrypted locally }</p><p>${signalReady ? marketReadinessMessage : unavailableMessage}</p><form id="signal-form"><label>Collateral <input name="stake" inputmode="decimal" autocomplete="off" placeholder="1.00" required${signalReady ? '' : ' disabled'} /></label><label>Probability (%) <input name="probability" type="number" min="0" max="100" step="1" inputmode="numeric" autocomplete="off" placeholder="70" required${signalReady ? '' : ' disabled'} /></label><p class="sealed">COMPUTE · Enter a whole percentage from 0 to 100. The browser converts it to protocol basis points before encryption.</p><button class="primary" type="submit"${signalReady ? '' : ' disabled'}>${signalReady ? 'Encrypt and submit forecast' : 'Commit window closed'}</button><button class="secondary" id="retry-finalize" type="button" hidden>Retry pending finalization</button><p id="signal-status" class="muted" role="status">${signalReady ? 'No funds moved.' : 'No forecast can be submitted after this pool commit window closes.'}</p>${freshPoolAction}</form></div>`;
}

function positionPanelContent(): string {
  return `<div class="market-action-panel owner-panel"><p class="eyebrow private">{ owner only }</p><p role="status">${ownerMessage}</p><button class="primary" id="reveal-owner">Reveal with owner wallet</button>${ownerActions}</div>`;
}

function marketSurfaceContent(market: ReturnType<typeof presentMarket>, selfTest = false): string {
  const mode = selfTest ? 'user-created self-test pool' : 'canonical market';
  return `<section class="market-detail"><p class="eyebrow public">{ ${mode} }</p><h2>${market.condition}</h2><p class="route-lead">Read one market and use its available actions without leaving this page.</p><div class="facts"><p><b>Network</b>${market.chainLabel}</p><p><b>Cohort gate</b>${market.cohortGate}</p><p><b>Pool</b>${market.poolAddress}</p></div><div class="market-disclosures"><section class="market-disclosure"><h3>Verify this market</h3><p>Manifest-bound chain, pool, and release facts are shown above. Independent verification remains the source of invariant conclusions.</p></section><section class="market-disclosure"><h3>Make forecast</h3>${signalPanelContent(market, selfTest)}</section><section class="market-disclosure"><h3>Lifecycle</h3><div class="market-action-panel"><p id="lifecycle-status" role="status">${lifecycleMessage}</p><button class="secondary" id="refresh-lifecycle" type="button">Refresh public state</button>${lifecycleActionContent()}</div></section><section class="market-disclosure"><h3>Your position</h3>${positionPanelContent()}</section></div></section>`;
}

function marketDirectoryContent(canonicalMarket: ReturnType<typeof presentMarket>): string {
  const selectedSelfTest = selectedMarketKey.startsWith('self-test:')
    ? selfTestMarkets.find(
        (market) => market.poolAddress.toLowerCase() === selectedMarketKey.slice(10).toLowerCase(),
      )
    : undefined;
  const selectedMarket = selectedSelfTest
    ? {
        ...canonicalMarket,
        condition: selectedSelfTest.policy.conditionLabel,
        cohortGate: `At least ${selectedSelfTest.participantGate} participants`,
        poolAddress: selectedSelfTest.poolAddress,
      }
    : canonicalMarket;
  const verifiedPools = selfTestMarkets
    .map(
      (market) =>
        `<button class="market-list-item" type="button" data-select-market="self-test:${market.poolAddress}"${selectedMarketKey === `self-test:${market.poolAddress}` ? ' aria-pressed="true"' : ''}><span class="eyebrow compute">{ verified pool }</span><strong>${market.policy.conditionLabel}</strong><small>${market.policy.commitWindowMinutes}-minute window · ${market.participantGate}-participant gate</small></button>`,
    )
    .join('');
  const detail = marketSurfaceContent(selectedMarket, Boolean(selectedSelfTest));
  return `<section class="band petal-band market-directory"><div class="band-inner"><p class="eyebrow public">{ market directory }</p><h1>Markets</h1><p class="route-lead">Choose a verified pool on the left. Its facts and actions open here, without leaving the page.</p><div class="market-workspace"><aside class="market-list" aria-label="Verified pools"><p class="eyebrow public">{ verified pools }</p><button class="market-list-item canonical-pool" type="button" data-select-market="canonical"${selectedMarketKey === 'canonical' ? ' aria-pressed="true"' : ''}><span class="eyebrow public">{ verified pool }</span><strong>${canonicalMarket.condition}</strong><small>${canonicalMarket.cohortGate}</small></button>${verifiedPools || '<p class="muted">No additional verified pools in this browser session yet. Create one in Test Lab and it will appear here after Sepolia verification.</p>'}<a class="text-action dark-action" href="/self-test?new=1">Create another verified pool <span aria-hidden="true">↗</span></a></aside><div class="market-detail-column">${detail}</div></div></div></section>`;
}

function portfolioContent(): string {
  const eth = headerBalance ? `${formatTokenAmount(headerBalance.nativeBalance)} ETH` : '—';
  const qsfc = headerBalance ? formatTokenAmount(headerBalance.publicBalance) : '—';
  const qscc = assetState ? formatTokenAmount(assetState.confidentialBalance) : 'Hidden';
  const knownPools = selfTestMarkets.length
    ? `<div class="portfolio-pools">${selfTestMarkets
        .map(
          (market) =>
            `<button class="secondary" type="button" data-select-self-test-pool="${market.poolAddress}">${market.policy.conditionLabel}</button>`,
        )
        .join('')}</div>`
    : '<p class="muted">Open a market before revealing a pool-specific position.</p>';
  return `<section class="band petal-band portfolio"><div class="band-inner"><p class="eyebrow private">{ your wallet }</p><h1>Portfolio</h1><p class="route-lead">Review wallet balances, prepare test collateral, then return to a selected market to forecast or reveal a position.</p><div class="portfolio-balances" aria-label="Wallet balance summary"><article><span>SEPOLIA GAS</span><strong>${eth}</strong></article><article><span>PUBLIC QSFC</span><strong>${qsfc}</strong></article><article><span>PRIVATE QSCC</span><strong>${qscc}</strong><small>${assetState ? 'Revealed for this session only.' : 'Use Reveal QSCC below to read it.'}</small></article></div><section class="portfolio-collateral"><p class="eyebrow compute">{ test collateral }</p><h2>Prepare collateral</h2><p>Mint valueless QSFC, approve only the chosen amount, then wrap it into confidential QSCC.</p>${assetPanelContent()}</section><div class="portfolio-positions"><h2>Your verified test pools</h2>${knownPools}</div></div></section>`;
}

function lifecycleActionContent(): string {
  const controls = lifecycleActionAvailability.length
    ? `<div class="lifecycle-action-list">${lifecycleActionAvailability
        .map((item) => {
          const disabled = !item.eligible || lifecycleActionBusy;
          const requirement = lifecycleActionBusy
            ? 'Another wallet action is in progress. Wait for its confirmed or failed outcome.'
            : item.eligible
              ? item.explanation
              : item.unavailableExplanation;
          return `<div class="${item.eligible ? 'eligible' : 'unavailable'}"><span class="lifecycle-action-tooltip" tabindex="0" data-tooltip="${escapeHtml(requirement)}"><button class="secondary" type="button" data-lifecycle-action="${item.action}"${disabled ? ' disabled' : ''}>${item.label}</button></span><p>${escapeHtml(requirement)}</p></div>`;
        })
        .join('')}</div>`
    : '<p class="muted">Refresh public state to load the contract-defined lifecycle actions.</p>';
  return `<section class="lifecycle-actions" aria-label="Permissionless lifecycle actions"><p class="eyebrow public">{ public lifecycle action }</p><p>Every contract-defined action is shown below. Hover an unavailable action to read its exact public prerequisite.</p>${controls}<p class="muted" role="status">${lifecycleActionMessage}</p></section>`;
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
  const creatingNewMarket = new URLSearchParams(location.search).has('new');
  const joinAddress = selfTestJoinAddress();
  const policy = selfTestMarket?.policy ?? selfTestPolicy;
  const sharePath = selfTestMarket
    ? selfTestSharePath(selfTestMarket.poolAddress, selfTestMarket.policy, selfTestMarket.startedAt)
    : undefined;
  const durationOptions = [
    [5, '5 minutes'],
    [15, '15 minutes'],
    [25, '25 minutes'],
    [60, '1 hour'],
    [180, '3 hours'],
    [7_200, '5 days'],
    [14_400, '10 days'],
  ] as const;
  const durationOptionMarkup = durationOptions
    .map(
      ([minutes, label]) =>
        `<option value="${minutes}"${policy.commitWindowMinutes === minutes ? ' selected' : ''}>${label}</option>`,
    )
    .join('');
  const configuration = `<div class="self-test-configuration"><label>Comparison <select id="self-test-comparison"${busy}><option value="greater-or-equal"${policy.comparison === 'greater-or-equal' ? ' selected' : ''}>ETH/USD ≥ threshold</option><option value="less-than"${policy.comparison === 'less-than' ? ' selected' : ''}>ETH/USD &lt; threshold</option></select></label><label>Threshold (USD) <input id="self-test-threshold" inputmode="decimal" autocomplete="off" value="${formatSelfTestUsdThreshold(policy.threshold)}"${busy} /></label><label>Commit window <select id="self-test-duration"${busy}>${durationOptionMarkup}</select></label><label>Participant gate <input id="self-test-gate" type="number" min="2" max="20" step="1" inputmode="numeric" value="${policy.participantGate}"${busy} /></label></div>`;
  const active =
    selfTestMarket && !creatingNewMarket
      ? `<div class="route-callout"><p class="eyebrow public">{ self-test market ready }</p><h2>Fresh OPEN epoch created.</h2><p>Pool ${selfTestMarket.poolAddress} is a user-created ${selfTestMarket.policy.conditionLabel} market with a ${selfTestMarket.policy.commitWindowMinutes}-minute commit window and a ${selfTestMarket.participantGate}-participant gate. It is not the canonical release or G7 evidence.</p><dl class="asset-facts self-test-facts"><div><dt>POOL</dt><dd>${selfTestMarket.poolAddress}</dd></div><div><dt>CONDITION</dt><dd>${selfTestMarket.policy.conditionLabel}</dd></div><div><dt>COMMIT WINDOW</dt><dd>Until ${new Date(Number(selfTestMarket.deadline) * 1000).toLocaleTimeString()}</dd></div><div><dt>COHORT</dt><dd>${selfTestMarket.participantGate} participants</dd></div></dl><div class="route-callout self-test-share"><p class="eyebrow public">{ second participant }</p><p>Share this public, read-only entry link with another Sepolia participant. Their browser verifies the factory and immutable configuration before any wallet action.</p><a class="text-action dark-action" href="${sharePath}">${sharePath} <span aria-hidden="true">↗</span></a></div><div class="route-actions"><a class="primary" href="/self-test/assets">Prepare test collateral</a><a class="secondary" href="/self-test/signal">Prepare self-test signal</a><a class="secondary" href="/self-test/lifecycle">Open lifecycle</a><a class="secondary" href="/self-test?new=1">Create more verified pools</a><a class="text-action dark-action" href="/self-test/position">Open self-test position <span aria-hidden="true">↗</span></a></div></div>`
      : `<div class="panel self-test-panel"><p class="eyebrow compute">{ user-wallet deployment }</p><h2>Create or join a real test market.</h2><p>Choose a bounded public test configuration. This creates one immutable adapter and one pool through the canonical permissionless factory; it uses only your Sepolia gas and no collateral moves during deployment.</p>${configuration}<p class="sealed">The Chainlink feed, collateral wrapper, timeout, recovery policy, and Sepolia network remain fixed.</p><button class="primary" id="launch-self-test" type="button"${busy}>Create self-test market</button><button class="secondary" id="launch-self-test-batch" type="button"${busy}>Create 10 verified pools</button><p class="muted">This sends the required wallet confirmations sequentially. A pool appears in Markets only after its factory registration and immutable configuration are verified on Sepolia.</p><div class="self-test-join"><label>Existing public self-test pool <input id="join-self-test-address" inputmode="text" autocomplete="off" spellcheck="false" placeholder="0x…" value="${joinAddress ? escapeHtml(joinAddress) : ''}" /></label><button class="secondary" id="join-self-test" type="button"${busy}>Verify and join pool</button></div><p role="status" class="asset-status">${selfTestMessage}</p></div>`;
  return `<section class="band petal-band asset-hero"><div class="band-inner"><p class="eyebrow compute">{ permissionless self-test }</p><h1>Make a fresh test window.</h1><p class="route-lead">The published market has expired. This browser can create one new, public, immutable Sepolia test market from your wallet without changing the canonical release.</p>${active}</div></section><section class="band blush-band asset-workflow"><div class="band-inner"><div class="asset-intro"><p class="eyebrow">{ what this does }</p><h2>Real contracts. Your wallet. No shortcut.</h2><p>The adapter has no asset custody. The factory has no owner. The new pool uses the existing valueless test collateral flow and the same permissionless recovery rules as the product.</p></div><ol class="setup-checklist"><li><strong>01</strong><span>Connect a Sepolia wallet with enough test ETH for two deployment transactions.</span></li><li><strong>02</strong><span>Create the market, then mint and wrap QSFC into confidential QSCC.</span></li><li><strong>03</strong><span>Use two wallets to submit signals before the immutable commit deadline.</span></li><li><strong>04</strong><span>Follow the public lifecycle, settlement, owner score, claim, or refund path.</span></li></ol></div></section>`;
}

function refreshSelfTestRoute(): void {
  const joinAddress = selfTestJoinAddress();
  const routePolicy = selfTestPolicyFromRoute();
  const routeStartTimestamp = selfTestStartTimestampFromRoute();
  const parameters = new URLSearchParams(location.search);
  const hasCustomConfiguration =
    parameters.has('comparison') ||
    parameters.has('threshold') ||
    parameters.has('minutes') ||
    parameters.has('gate');
  if (!routePolicy || (hasCustomConfiguration && !routeStartTimestamp)) {
    selfTestMarket = undefined;
    selfTestMessage =
      'This self-test link has an unsupported public configuration. Use a newly shared link or select one of the available presets.';
    render();
    return;
  }
  selfTestPolicy = routePolicy;
  if (
    joinAddress &&
    (!selfTestMarket || selfTestMarket.poolAddress.toLowerCase() !== joinAddress.toLowerCase())
  ) {
    void runSelfTestJoin(joinAddress, false, routePolicy, routeStartTimestamp);
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

function normalizeLegacyRoute(): void {
  const poolAction = /^\/pool\/(0x[0-9a-f]{40})\/(?:signal|lifecycle)$/i.exec(location.pathname);
  if (poolAction) {
    selectedMarketKey =
      poolAction[1].toLowerCase() === manifest?.poolAddress.toLowerCase()
        ? 'canonical'
        : `self-test:${poolAction[1]}`;
    history.replaceState({}, '', '/markets');
    return;
  }
  const poolRoute = /^\/pool\/(0x[0-9a-f]{40})$/i.exec(location.pathname);
  if (poolRoute) {
    selectedMarketKey =
      poolRoute[1].toLowerCase() === manifest?.poolAddress.toLowerCase()
        ? 'canonical'
        : `self-test:${poolRoute[1]}`;
    history.replaceState({}, '', '/markets');
    return;
  }
  if (
    location.pathname === '/self-test/signal' ||
    location.pathname === '/self-test/lifecycle' ||
    location.pathname === '/self-test/position'
  ) {
    if (selfTestMarket) selectedMarketKey = `self-test:${selfTestMarket.poolAddress}`;
    history.replaceState({}, '', '/markets');
    return;
  }
  if (location.pathname === '/self-test/market') {
    if (selfTestMarket) selectedMarketKey = `self-test:${selfTestMarket.poolAddress}`;
    history.replaceState({}, '', '/markets');
    return;
  }
  if (location.pathname.endsWith('/assets') || location.pathname === '/position') {
    history.replaceState({}, '', '/portfolio');
    return;
  }
  const verifyAddress = /^\/verify\/(0x[0-9a-f]{40})$/i.exec(location.pathname)?.[1];
  if (verifyAddress && manifest?.poolAddress.toLowerCase() === verifyAddress.toLowerCase()) {
    selectedMarketKey = 'canonical';
    history.replaceState({}, '', '/markets');
  }
}

function render(message?: string): void {
  const root = document.querySelector<HTMLDivElement>('#app');
  if (!root) return;
  if (location.pathname === '/how-it-works') history.replaceState({}, '', '/');
  normalizeLegacyRoute();
  const canonicalMarket = manifest ? presentMarket(manifest, marketCohortGate) : undefined;
  const isSelfTestRoute = location.pathname.startsWith('/self-test');
  const isSelfTestMarketRoute = location.pathname === '/self-test/market';
  const market =
    isSelfTestRoute && selfTestMarket && canonicalMarket
      ? {
          ...canonicalMarket,
          condition: selfTestMarket.policy.conditionLabel,
          cohortGate: `At least ${selfTestMarket.participantGate} participants`,
          poolAddress: selfTestMarket.poolAddress,
        }
      : canonicalMarket;
  const isSignalRoute = location.pathname.endsWith('/signal');
  const isAssetRoute = location.pathname.endsWith('/assets');
  const isLifecycleRoute = location.pathname.endsWith('/lifecycle');
  const isMarketRoute =
    location.pathname.startsWith('/markets') ||
    isSelfTestMarketRoute ||
    (location.pathname.startsWith('/pool/') &&
      !isSignalRoute &&
      !isAssetRoute &&
      !isLifecycleRoute);
  const isPositionRoute =
    location.pathname === '/position' || location.pathname === '/self-test/position';
  const isPortfolioRoute = location.pathname === '/portfolio' || isAssetRoute || isPositionRoute;
  const isMarketDirectoryRoute = location.pathname === '/markets';
  const isHomeRoute = location.pathname === '/';
  const verifyAddress = location.pathname.startsWith('/verify/')
    ? location.pathname.slice('/verify/'.length)
    : undefined;
  let content = !manifest
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
              ? assetSetupContent()
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
                  ? isSelfTestMarketRoute && !selfTestMarket
                    ? `<section class="band petal-band asset-hero"><div class="band-inner"><p class="eyebrow public">{ self-test context }</p><h1>No self-test pool is selected.</h1><p class="route-lead">Create or join a verified pool in Test Lab before opening its market, participant, or lifecycle routes.</p><div class="route-actions"><a class="primary" href="/self-test">Open Test Lab</a></div></div></section>`
                    : `<section class="band blush-band market"><div class="band-inner"><p class="eyebrow public">{ ${isSelfTestRoute ? 'self-test market' : 'canonical MVP market'} }</p><h1>${market.condition}</h1><p class="route-lead">This route holds only the verified market facts and participant entry points. Public operations and recovery actions live on Lifecycle so this page remains easy to inspect.</p><div class="facts"><p><b>Network</b>${market.chainLabel}</p><p><b>Cohort gate</b>${market.cohortGate}</p><p><b>Pool</b>${market.poolAddress}</p></div><ol class="market-path" aria-label="Recommended market path"><li><strong>01</strong><span>Read the verified market facts</span></li><li><strong>02</strong><span>Prepare test collateral</span></li><li><strong>03</strong><span>Submit an encrypted signal</span></li></ol><div class="boundary"><p class="public"><b>PUBLIC</b> ${market.publicNotice}</p><p class="private"><b>PRIVATE</b> ${market.privateNotice}</p><p class="muted">This cohort gate does not provide anonymity or Sybil resistance.</p></div><div class="route-callout market-readiness"><p class="eyebrow ${marketActionable ? 'public' : 'private'}">{ actionability }</p><h2>${marketActionable ? 'Ready for participant setup' : 'Signal path is safely paused'}</h2><p>${marketReadinessMessage}</p></div><div class="route-actions"><a class="primary" href="${isSelfTestRoute ? '/self-test/assets' : `/pool/${market.poolAddress}/assets`}">Get test collateral</a>${marketActionable ? `<a class="secondary" href="${isSelfTestRoute ? '/self-test/signal' : `/pool/${market.poolAddress}/signal`}">Prepare encrypted signal</a>` : `<a class="secondary" href="/self-test">Create a fresh self-test market</a>`}<a class="secondary" href="${isSelfTestRoute ? '/self-test/lifecycle' : `/pool/${market.poolAddress}/lifecycle`}">Open lifecycle</a>${isSelfTestRoute ? '' : `<a class="text-action dark-action" href="/verify/${market.poolAddress}">Verify this release <span aria-hidden="true">↗</span></a>`}</div></div></section>`
                  : landingContent(market);
  content = content
    .replace('Probability (basis points)', 'Probability (%)')
    .replace(
      'name="probability" inputmode="numeric" autocomplete="off" placeholder="7500"',
      'name="probability" type="number" min="0" max="100" step="1" inputmode="numeric" autocomplete="off" placeholder="70"',
    )
    .replace(
      'COMPUTE · Validation moves no funds. Encryption and wallet approval are separate.',
      'COMPUTE · Enter a whole percentage from 0 to 100. The browser converts it to protocol basis points before encryption.',
    );
  if (isPortfolioRoute) content = portfolioContent();
  else if ((isMarketDirectoryRoute || isMarketRoute) && canonicalMarket)
    content = marketDirectoryContent(canonicalMarket);
  const isMarketsRoute =
    isMarketRoute || isSignalRoute || isLifecycleRoute || Boolean(verifyAddress);
  const isTestLabRoute = location.pathname === '/self-test' || Boolean(selfTestJoinAddress());
  const navigation = [
    navigationLink('/', 'Overview', isHomeRoute),
    navigationLink('/markets', 'Markets', isMarketsRoute),
    navigationLink('/portfolio', 'Portfolio', isPortfolioRoute),
    navigationLink('/self-test', 'Test Lab', isTestLabRoute),
  ].join('');
  root.innerHTML = `<a class="skip-link" href="#main-content">Skip to content</a><main class="app-shell"${interactionBusy ? ' aria-busy="true"' : ''}><header class="site-header"><a class="wordmark" href="/" aria-label="QuietSignal overview">QuietSignal</a><div class="header-actions"><span class="network-status" aria-label="Network: Ethereum Sepolia">Sepolia</span><button class="wallet" id="wallet" aria-expanded="${walletMenuOpen}"${manifest ? '' : ' disabled'}>${manifest ? walletState : 'Release check'}</button>${walletMenuContent()}</div></header><div class="sticky-navigation">${headerBalanceContent()}<nav class="site-nav" aria-label="Primary tasks">${navigation}</nav></div><section class="legend" aria-label="Privacy legend"><span>PRIVATE · owner-only</span><span>COMPUTE · encrypted work</span><span>PUBLIC · chain facts</span><span>PENDING · waiting</span></section><div id="main-content" tabindex="-1">${content}</div><section class="deployment-band"><div><p class="eyebrow">{ active Sepolia release ${releaseId} }</p><p>${message ?? (manifest ? `Verified deployment block ${manifest.deployedAtBlock}` : manifestPhase === 'loading' ? 'Checking the canonical manifest…' : 'Canonical manifest unavailable. Do not continue with a wallet action.')}</p></div></section></main>${interactionToastContent()}`;
  if (interactionBusy) {
    root.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = true;
    });
    root.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
      input.disabled = true;
    });
    root.querySelectorAll<HTMLSelectElement>('select').forEach((select) => {
      select.disabled = true;
    });
    root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
      anchor.setAttribute('aria-disabled', 'true');
      anchor.tabIndex = -1;
    });
  }
  document
    .querySelector<HTMLButtonElement>('#dismiss-operation-toast')
    ?.addEventListener('click', () => {
      interactionToast = undefined;
      render();
    });
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
  document
    .querySelector<HTMLButtonElement>('#reveal-header-qscc')
    ?.addEventListener('click', () => void revealHeaderQscc());
  document
    .querySelector<HTMLButtonElement>('#reveal-collateral-qscc')
    ?.addEventListener('click', () => void revealHeaderQscc());
  document.querySelectorAll<HTMLButtonElement>('[data-select-market]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.selectMarket;
      if (!key) return;
      selectedMarketKey = key;
      if (key.startsWith('self-test:')) {
        const address = key.slice('self-test:'.length);
        const selected = selfTestMarkets.find(
          (market) => market.poolAddress.toLowerCase() === address.toLowerCase(),
        );
        if (!selected) return;
        selfTestMarket = selected;
        render();
        void refreshLifecycle(selected.poolAddress);
        return;
      }
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-select-self-test-pool]').forEach((button) => {
    button.addEventListener('click', () => {
      const address = button.dataset.selectSelfTestPool;
      const selected = selfTestMarkets.find(
        (market) => market.poolAddress.toLowerCase() === address?.toLowerCase(),
      );
      if (!selected) return;
      selfTestMarket = selected;
      selectedMarketKey = `self-test:${selected.poolAddress}`;
      history.pushState({}, '', '/markets');
      renderRoute();
    });
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
  document
    .querySelector<HTMLButtonElement>('#launch-self-test-batch')
    ?.addEventListener('click', () => void runSelfTestBatch());
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
      if (
        !beginWalletInteraction(
          `Requesting ${action} from the owner wallet. Confirm it in the wallet, then wait for the Sepolia receipt.`,
        )
      )
        return;
      ownerMessage = `Requesting ${action} from the owner wallet. Check the wallet before approving.`;
      render();
      try {
        const transactionHash = await submitOwnerTerminalAction(provider, pool, action);
        ownerMessage = `${action} confirmed on Sepolia: ${transactionHash.slice(0, 10)}…. Refresh the owner position before another action.`;
        endWalletInteraction(`${action} was confirmed on Sepolia.`, 'success');
      } catch (error) {
        ownerMessage =
          error instanceof Error
            ? error.message
            : 'Owner action is unavailable. Read public pool state before retrying.';
        endWalletInteraction(ownerMessage, 'error');
      }
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
        if (
          !beginWalletInteraction(
            'Preparing pending finalization. Confirm the wallet request when it appears.',
          )
        )
          return;
        if (status)
          status.textContent =
            'Checking the pending finalization. No new collateral transfer is requested.';
        const transactionHash = await finalizePendingSignal(provider, pool, (progress) => {
          if (status) status.textContent = progress;
          reportWalletInteraction(progress);
        });
        event.currentTarget.hidden = true;
        if (status)
          status.textContent = `Pending signal finalized on Sepolia: ${transactionHash.slice(0, 10)}…. Public pool state is authoritative.`;
        endWalletInteraction('Pending signal finalization was confirmed on Sepolia.', 'success');
      } catch (error) {
        const failureMessage =
          error instanceof Error
            ? error.message
            : 'Pending finalization is unavailable. Read public pool state before retrying.';
        if (status) status.textContent = failureMessage;
        if (interactionBusy) endWalletInteraction(failureMessage, 'error');
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
          probability: probabilityPercentToBps(String(data.get('probability') ?? '')),
        });
        const provider = activeWallet();
        const pool = routedPoolAddress();
        if (!provider || !manifest || !pool) throw new Error('Connect a Sepolia wallet first.');
        if (status) status.textContent = 'Valid inputs. No funds moved. Starting local encryption…';
        if (
          !beginWalletInteraction(
            'Encrypting the signal locally. Confirm each wallet request as it appears.',
          )
        )
          return;
        const result = await submitSignalJourney(
          provider,
          pool,
          manifest.collateralAddress,
          values,
          (progress) => {
            if (status) status.textContent = progress;
            reportWalletInteraction(progress);
          },
        );
        if (status)
          status.textContent = `Signal finalized on Sepolia: ${result.finalizeTransactionHash.slice(0, 10)}…. Public pool state is authoritative.`;
        endWalletInteraction('Signal finalization was confirmed on Sepolia.', 'success');
      } catch (error) {
        const retry = document.querySelector<HTMLButtonElement>('#retry-finalize');
        if (error instanceof SignalJourneyError && error.allowsFinalizationRetry && retry)
          retry.hidden = false;
        if (status)
          status.textContent =
            error instanceof Error ? error.message : 'Unable to submit the signal journey.';
        if (interactionBusy)
          endWalletInteraction(
            error instanceof Error ? error.message : 'Unable to submit the signal journey.',
            'error',
          );
      } finally {
        event.currentTarget.reset();
      }
    });
}

async function refreshHeaderBalances(): Promise<void> {
  const provider = activeWallet();
  if (!provider || !manifest || !selectedWallet) {
    headerBalance = undefined;
    render();
    return;
  }
  headerBalanceBusy = true;
  render();
  try {
    headerBalance = await readPublicTestAssetState(
      provider,
      manifest.faucetAddress,
      manifest.collateralAddress,
    );
  } catch {
    headerBalance = undefined;
  } finally {
    headerBalanceBusy = false;
    render();
  }
}

async function revealHeaderQscc(): Promise<void> {
  if (!beginWalletInteraction('Requesting owner-only QSCC access for this browser session.'))
    return;
  headerBalanceBusy = true;
  render();
  try {
    await refreshAssetState();
    headerBalanceBusy = false;
    endWalletInteraction('QSCC access was refreshed for this browser session.', 'success');
  } catch (error) {
    headerBalanceBusy = false;
    endWalletInteraction(
      error instanceof Error ? error.message : 'QSCC access could not be refreshed.',
      'error',
    );
  } finally {
    headerBalanceBusy = false;
  }
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
    headerBalance = {
      account: assetState.account,
      publicBalance: assetState.publicBalance,
      nativeBalance: assetState.nativeBalance,
    };
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
    if (!beginWalletInteraction('Refreshing owner asset state for this browser session.')) return;
    await refreshAssetState();
    endWalletInteraction('Owner asset state was refreshed.', 'success');
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
    if (
      !beginWalletInteraction(
        action === 'mint'
          ? 'Requesting a QSFC mint. Confirm the wallet transaction when it appears.'
          : 'Checking collateral preparation. Confirm each wallet transaction when it appears.',
      )
    )
      return;
    assetBusy = true;
    let approvalHash: string | undefined;
    assetMessage = {
      mint: 'Requesting a valueless QSFC mint to your connected wallet. Confirm it in the wallet, then wait for the public Sepolia receipt.',
      approve:
        'Requesting an exact QSFC allowance for the immutable confidential wrapper. Confirm it in the wallet, then wait for the receipt.',
      wrap: 'Checking the exact QSFC allowance before the 1:1 confidential wrap. You may confirm approval, then confirm wrapping.',
    }[action];
    render();
    if (action === 'wrap') {
      if (!assetState || assetState.allowance < amount) {
        assetMessage =
          'Requesting an exact QSFC allowance for this wrap. Confirm approval in the wallet, then wait for its receipt.';
        render();
        approvalHash = await approveTestAsset(
          provider,
          manifest.faucetAddress,
          manifest.collateralAddress,
          amount,
        );
        assetMessage = `Approval confirmed on Sepolia: ${approvalHash.slice(0, 10)}…. Requesting the wrap transaction now; confirm it in the wallet.`;
        render();
      }
    }
    const transactionHash = await (action === 'mint'
      ? mintTestAsset(provider, manifest.faucetAddress, manifest.collateralAddress, amount)
      : action === 'approve'
        ? approveTestAsset(provider, manifest.faucetAddress, manifest.collateralAddress, amount)
        : wrapTestAsset(provider, manifest.faucetAddress, manifest.collateralAddress, amount));
    assetMessage = `${action === 'mint' ? 'Mint' : action === 'approve' ? 'Approval' : approvalHash ? 'Approval and wrap' : 'Wrap'} confirmed on Sepolia: ${transactionHash.slice(0, 10)}…. Refreshing the owner asset state.`;
    assetBusy = false;
    render();
    await refreshAssetState();
    endWalletInteraction(
      `${action === 'mint' ? 'QSFC mint' : action === 'approve' ? 'QSFC approval' : 'QSCC wrap'} was confirmed on Sepolia.`,
      'success',
    );
  } catch (error) {
    assetBusy = false;
    assetMessage =
      error instanceof Error
        ? `${error.message} Read the current wallet and public state before retrying.`
        : 'The asset action was not confirmed. No application-controlled transfer occurred; refresh before retrying.';
    if (interactionBusy) endWalletInteraction(assetMessage, 'error');
    else render();
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
  const policy = selectedSelfTestPolicy();
  if (!policy) {
    selfTestMessage =
      'Choose a supported condition, commit window, and participant gate before creating a self-test market.';
    render();
    return;
  }
  selfTestPolicy = policy;
  if (
    !beginWalletInteraction(
      'Validating the deployment, then requesting the first self-test market transaction.',
    )
  )
    return;
  selfTestBusy = true;
  selfTestMessage =
    'Validating the canonical factory, wrapper, and feed before requesting the first wallet deployment.';
  render();
  try {
    const launched = await launchSelfTestMarket(
      provider,
      {
        canonicalPoolAddress: manifest.poolAddress,
        factoryAddress: manifest.factoryAddress,
        factoryRuntimeCodeHash: manifest.factoryRuntimeCodeHash,
        collateralAddress: manifest.collateralAddress,
        feedAddress: manifest.feedAddress,
        policy,
      },
      (progress) => {
        selfTestMessage = progress;
        reportWalletInteraction(progress);
      },
    );
    rememberSelfTestMarket(launched);
    selfTestBusy = false;
    marketActionable = true;
    marketCohortGate = `At least ${launched.participantGate} participants`;
    selfTestMessage = `Self-test pool ${launched.poolAddress.slice(0, 10)}… is confirmed. Refreshing its public lifecycle.`;
    await refreshLifecycle(launched.poolAddress);
    endWalletInteraction('Self-test market was confirmed and verified on Sepolia.', 'success');
  } catch (error) {
    selfTestBusy = false;
    selfTestMessage =
      error instanceof Error
        ? `${error.message} No canonical release was changed; inspect any confirmed receipt before retrying.`
        : 'The self-test market was not confirmed. No canonical release was changed; retry only after checking your wallet history.';
    endWalletInteraction(selfTestMessage, 'error');
  }
}

async function runSelfTestBatch(): Promise<void> {
  const provider = activeWallet();
  if (!provider || !manifest) {
    selfTestMessage =
      'Connect a Sepolia wallet before creating verified pools. No transaction was sent.';
    render();
    return;
  }
  const policies = [
    ['greater-or-equal', '150000000000', 15, 2],
    ['greater-or-equal', '200000000000', 20, 2],
    ['greater-or-equal', '250000000000', 25, 3],
    ['greater-or-equal', '300000000000', 30, 3],
    ['greater-or-equal', '350000000000', 35, 4],
    ['less-than', '200000000000', 45, 4],
    ['less-than', '250000000000', 60, 5],
    ['less-than', '300000000000', 75, 5],
    ['less-than', '350000000000', 90, 6],
    ['less-than', '400000000000', 120, 6],
  ]
    .map(([comparison, threshold, minutes, gate]) =>
      selfTestPolicyForSelection(
        String(comparison),
        String(threshold),
        Number(minutes),
        Number(gate),
      ),
    )
    .filter((policy): policy is SelfTestPolicy => Boolean(policy));
  if (
    !beginWalletInteraction(
      'Creating verified pools sequentially. Confirm each wallet transaction as it appears.',
    )
  )
    return;
  selfTestBusy = true;
  render();
  try {
    for (const [index, policy] of policies.entries()) {
      selfTestMessage = `Creating verified pool ${index + 1} of ${policies.length}. Confirm each Sepolia wallet request; no pool is listed before immutable config verification.`;
      render();
      const launched = await launchSelfTestMarket(
        provider,
        {
          canonicalPoolAddress: manifest.poolAddress,
          factoryAddress: manifest.factoryAddress,
          factoryRuntimeCodeHash: manifest.factoryRuntimeCodeHash,
          collateralAddress: manifest.collateralAddress,
          feedAddress: manifest.feedAddress,
          policy,
        },
        (progress) => {
          selfTestMessage = `Pool ${index + 1} of ${policies.length}: ${progress}`;
          reportWalletInteraction(selfTestMessage);
        },
      );
      rememberSelfTestMarket(launched);
    }
    selfTestBusy = false;
    selfTestMessage = `All ${policies.length} pools were created and verified against the Sepolia factory. Opening Markets.`;
    selectedMarketKey = selfTestMarkets.length
      ? `self-test:${selfTestMarkets[0].poolAddress}`
      : 'canonical';
    history.pushState({}, '', '/markets');
    renderRoute();
    if (selfTestMarkets[0]) await refreshLifecycle(selfTestMarkets[0].poolAddress);
    endWalletInteraction(
      `All ${policies.length} verified pools were created on Sepolia.`,
      'success',
    );
  } catch (error) {
    selfTestBusy = false;
    selfTestMessage =
      error instanceof Error
        ? `${error.message} Pools already confirmed remain listed; inspect the wallet before retrying.`
        : 'The batch stopped before all pools were confirmed. Confirmed pools remain listed.';
    endWalletInteraction(selfTestMessage, 'error');
  }
}

async function runSelfTestJoin(
  poolAddress: string,
  updateUrl: boolean,
  policy = selfTestPolicy,
  expectedStartTimestamp?: bigint,
): Promise<void> {
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
  if (updateUrl) {
    const selected = selectedSelfTestPolicy();
    if (!selected) {
      selfTestMessage =
        'Choose a supported condition, commit window, and participant gate before verifying a self-test pool.';
      render();
      return;
    }
    policy = selected;
  }
  selfTestPolicy = policy;
  selfTestMarket = undefined;
  selfTestBusy = true;
  selfTestMessage =
    'Verifying the factory mapping and immutable self-test configuration from Sepolia. No wallet request is needed.';
  render();
  try {
    const joined = await loadSelfTestMarket(address, {
      canonicalPoolAddress: manifest.poolAddress,
      factoryAddress: manifest.factoryAddress,
      factoryRuntimeCodeHash: manifest.factoryRuntimeCodeHash,
      collateralAddress: manifest.collateralAddress,
      feedAddress: manifest.feedAddress,
      policy,
      expectedStartTimestamp,
    });
    rememberSelfTestMarket(joined);
    selfTestPolicy = joined.policy;
    if (updateUrl)
      history.pushState(
        {},
        '',
        selfTestSharePath(joined.poolAddress, joined.policy, joined.startedAt),
      );
    selfTestBusy = false;
    selfTestMessage = `Verified self-test pool ${joined.poolAddress.slice(0, 10)}…. Refreshing its public lifecycle.`;
    await refreshLifecycle(joined.poolAddress);
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
  if (
    !beginWalletInteraction(
      'Revalidating lifecycle state before requesting the wallet transaction.',
    )
  ) {
    lifecycleActionBusy = false;
    return;
  }
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
        reportWalletInteraction(progress);
      },
    );
    lifecycleActionBusy = false;
    lifecycleActionMessage = `Lifecycle action confirmed on Sepolia: ${transactionHash.slice(0, 10)}…. Refreshing public state.`;
    await refreshLifecycle(pool);
    endWalletInteraction('Lifecycle action was confirmed on Sepolia.', 'success');
  } catch (error) {
    lifecycleActionBusy = false;
    lifecycleActionMessage =
      error instanceof Error
        ? error.message
        : 'The lifecycle action was not confirmed. Refresh public state before retrying.';
    endWalletInteraction(lifecycleActionMessage, 'error');
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
  if (!beginWalletInteraction('Requesting owner-only position access for this browser session.'))
    return;
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
  endWalletInteraction(
    ownerMessage,
    ownerMessage.startsWith('Viewer access') ? 'error' : 'success',
  );
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
  lifecycleActionAvailability = [];
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
    lifecycleActionAvailability = epoch.actionAvailability;
    lifecycleActionMessage = epoch.actions.length
      ? 'The actions below were derived from the latest public Sepolia state. Each still requires its own wallet confirmation.'
      : 'No action is currently eligible. Hover a disabled action to read its public prerequisite.';
  } catch {
    marketActionable = false;
    lifecycleActions = [];
    lifecycleActionAvailability = [];
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
  if (!beginWalletInteraction('Requesting wallet connection and Sepolia network confirmation.'))
    return;
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
    endWalletInteraction('Wallet connection to Sepolia was confirmed.', 'success');
    void refreshHeaderBalances();
  } catch {
    walletState = 'Connection declined';
    endWalletInteraction(
      'Wallet connection was not completed. Retrying is safe and does not move funds.',
      'error',
    );
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
  .then(async () => {
    manifestPhase = 'ready';
    await loadPublishedSelfTestMarkets();
    render();
    if (selfTestJoinAddress()) refreshSelfTestRoute();
    else void refreshLifecycle();
  })
  .catch(() => {
    manifestPhase = 'unavailable';
    render('The canonical manifest could not be validated. Do not continue until it is available.');
  });
