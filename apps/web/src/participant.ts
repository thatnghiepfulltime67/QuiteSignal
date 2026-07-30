import { decimalInput, formatBaseUnits, parseBaseUnits } from '@quitesignal/confidential-client';

const MINIMUM_SEPOLIA_GAS_RESERVE = 100_000_000_000_000n;

export interface MarketReadinessInput {
  state: number;
  deadline: bigint;
  observedAt: bigint;
}

export interface MarketReadiness {
  actionable: boolean;
  label: string;
  explanation: string;
}

export interface AssetReadinessInput {
  publicBalance: bigint;
  allowance: bigint;
  confidentialBalance: bigint;
  nativeBalance: bigint;
}

export interface AssetReadiness {
  readyToWrap: boolean;
  readyToSignal: boolean;
  label: string;
  explanation: string;
}

export function presentMarketReadiness(input: MarketReadinessInput): MarketReadiness {
  if (input.state !== 0) {
    return {
      actionable: false,
      label: 'Market is not accepting signals',
      explanation:
        'This immutable epoch has moved beyond its open commit state. Read the public lifecycle and use only the documented terminal or recovery path.',
    };
  }
  if (input.observedAt >= input.deadline) {
    return {
      actionable: false,
      label: 'Commit window has ended',
      explanation:
        'The chain-derived deadline has passed. Do not encrypt or submit a new signal; wait for a verified fresh release before testing this route.',
    };
  }
  return {
    actionable: true,
    label: 'Market is ready for a signal',
    explanation:
      'The canonical epoch is open. Prepare confidential collateral, then choose a probability and amount for one explicit wallet-guided signal.',
  };
}

export function presentAssetReadiness(input: AssetReadinessInput): AssetReadiness {
  if (input.nativeBalance < MINIMUM_SEPOLIA_GAS_RESERVE) {
    return {
      readyToWrap: false,
      readyToSignal: false,
      label: 'Sepolia gas is required',
      explanation:
        'The test asset is valueless, but every mint, approval, wrap, and signal still needs a small Sepolia ETH gas reserve. Add test ETH before starting this sequence.',
    };
  }
  if (input.confidentialBalance > 0n) {
    return {
      readyToWrap: true,
      readyToSignal: true,
      label: 'Confidential collateral is ready',
      explanation: `${formatBaseUnits(input.confidentialBalance, 18)} QSCC is available to this connected owner for a signal.`,
    };
  }
  if (input.publicBalance > 0n && input.allowance > 0n) {
    return {
      readyToWrap: true,
      readyToSignal: false,
      label: 'Test asset is approved for wrapping',
      explanation:
        'Wrap a selected approved amount 1:1 to create confidential collateral. No pool funds move during wrapping.',
    };
  }
  if (input.publicBalance > 0n) {
    return {
      readyToWrap: false,
      readyToSignal: false,
      label: 'Test asset is ready to approve',
      explanation:
        'Choose an exact amount, approve only that amount for the immutable collateral wrapper, then wrap it confidentially.',
    };
  }
  return {
    readyToWrap: false,
    readyToSignal: false,
    label: 'Get valueless test collateral',
    explanation:
      'Mint the public Sepolia test token to your own wallet, then approve and wrap the amount you choose.',
  };
}

export function formatTokenAmount(value: bigint): string {
  return formatBaseUnits(value, 18);
}

export function parseTestAssetAmount(value: string): bigint {
  const amount = parseBaseUnits(decimalInput(value, 18), 18);
  if (amount === 0n) throw new Error('Choose a test-token amount greater than zero.');
  return amount;
}
