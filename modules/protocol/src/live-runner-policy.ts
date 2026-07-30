import { keccak256, toHex, type Hash } from 'viem';

export const LIVE_WORK_ITEM = 'LIVE-01' as const;
export const LIVE_RECOVERY_WORK_ITEM = 'LIVE-02' as const;

const KNOWN_WORK_ITEMS = [
  'PK-05',
  'PK-06',
  'PK-07',
  'SDK-03',
  LIVE_WORK_ITEM,
  LIVE_RECOVERY_WORK_ITEM,
] as const;

export type LifecycleWorkItem = (typeof KNOWN_WORK_ITEMS)[number];

export function isLifecycleWorkItem(value: string): value is LifecycleWorkItem {
  return (KNOWN_WORK_ITEMS as readonly string[]).includes(value);
}

export function lifecyclePhase(workItem: LifecycleWorkItem): 'P1' | 'P2' {
  return workItem === 'SDK-03' ||
    workItem === LIVE_WORK_ITEM ||
    workItem === LIVE_RECOVERY_WORK_ITEM
    ? 'P2'
    : 'P1';
}

export function poolCases(workItem: LifecycleWorkItem): readonly string[] {
  if (workItem === 'PK-05') return ['below-k', 'threshold'];
  if (workItem === LIVE_WORK_ITEM) return ['threshold'];
  if (workItem === LIVE_RECOVERY_WORK_ITEM) return ['below-k', 'timeout'];
  if (workItem === 'PK-06') return ['timeout', 'grace', 'success'];
  if (workItem === 'PK-07') return ['claim', 'refund'];
  return ['commit'];
}

export function usesAggregateLifecycle(workItem: LifecycleWorkItem): boolean {
  return workItem === 'PK-05' || workItem === LIVE_WORK_ITEM;
}

export function poolSalt(workItem: LifecycleWorkItem, caseName: string): Hash {
  if (!poolCases(workItem).includes(caseName))
    throw new Error('Pool case is not allowed for this work item.');
  return keccak256(toHex(`quiet-signal/${workItem}/${caseName}/v1`));
}
