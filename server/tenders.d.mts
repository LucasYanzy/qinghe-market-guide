export type TenderKey = 'cashCents' | 'creditCents' | 'checkCents' | 'snapCents' | 'goodFoodBucksCents' | 'marketBucksCents' | 'qrCents' | 'matchCents';
export type TenderBreakdown = Record<TenderKey, number>;
export const tenderChannels: readonly { key: TenderKey; label: string; name: string }[];
export function emptyTenders(): TenderBreakdown;
export function tenderTotal(values: TenderBreakdown): number;
