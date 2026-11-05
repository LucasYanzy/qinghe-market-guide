// Redeemed sale amounts, not benefits issued or a second source of revenue.
export const tenderChannels = [
  { key: 'cashCents', label: 'Cash', name: '现金' },
  { key: 'creditCents', label: 'Credit', name: '信用卡' },
  { key: 'checkCents', label: 'Check', name: '支票' },
  { key: 'snapCents', label: 'SNAP', name: 'SNAP' },
  { key: 'goodFoodBucksCents', label: 'Good Food Bucks', name: 'Good Food Bucks' },
  { key: 'marketBucksCents', label: 'Market Bucks', name: 'Market Bucks' },
  { key: 'qrCents', label: 'QR Code (WIC & FMNP)', name: 'QR Code (WIC & FMNP)' },
  { key: 'matchCents', label: 'Match', name: '配比补助' },
];
export const emptyTenders = () => Object.fromEntries(tenderChannels.map(c => [c.key, 0]));
export const tenderTotal = values => tenderChannels.reduce((sum, c) => sum + values[c.key], 0);
