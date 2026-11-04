export type OperatingCounts = {
  sessions: number; expected: number; checkedIn: number; unconfirmed: number; confirmed: number; absent: number; late: number;
  missingReports: number; attendanceReports: number; reports: number; grossCents: number; transactions: number;
  invoiceCount: number; unpaidCents: number; overdueInvoiceCount: number; overdueCents: number; adjustmentCount: number;
};
export type OperatingFollowup = {
  summary: OperatingCounts;
  markets: (OperatingCounts & { id: number; name: string })[];
  adjustments: { marketId: number; marketName: string; date: string; count: number }[];
};
export function workflowUrl(tab: "sessions" | "sales" | "invoices", marketId: number | null, date: string) {
  return `/admin/community?${new URLSearchParams({ ...(marketId ? { market: String(marketId) } : {}), tab, date })}`;
}
export function serviceDeskUrl(marketId: number | null, date: string, filter = "active") {
  return `/admin/operations?${new URLSearchParams({ ...(marketId ? { market: String(marketId) } : {}), date, tab: "orders", filter })}`;
}
