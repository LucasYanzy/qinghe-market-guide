import type { SchoolOverview } from "./types";

export type DashboardView = "overview" | "network" | "products" | "snap";
export type ReportRange = "7" | "30" | "90" | "all" | "custom";
export const reportToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export function reportDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
export function readReportFilters() {
  const q = new URLSearchParams(window.location.search), today = reportToday();
  return {
    range: (["7", "30", "90", "all", "custom"].includes(q.get("range") ?? "") ? q.get("range") : "30") as ReportRange,
    from: q.get("from") || reportDate(today, -29), to: q.get("to") || today,
  };
}
export function aggregateTimeline(timeline: SchoolOverview["timeline"], interval: "day" | "week" | "month") {
  const buckets = new Map<string, SchoolOverview["timeline"][number]>();
  for (const row of timeline) {
    const day = new Date(`${row.date}T12:00:00Z`).getUTCDay();
    const date = interval === "month" ? `${row.date.slice(0, 7)}-01` : interval === "week" ? reportDate(row.date, -(day + 6) % 7) : row.date;
    const total = buckets.get(date) ?? { date, orders: 0, completed: 0, cancelled: 0, snapOrders: 0, revenueCents: 0 };
    for (const key of ["orders", "completed", "cancelled", "snapOrders", "revenueCents"] as const) total[key] += row[key];
    buckets.set(date, total);
  }
  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
}
export function changePercent(value: number | null, previous: number | null | undefined) {
  return value === null || previous === null || previous === undefined || previous === 0 ? null : (value - previous) / previous * 100;
}
export function csvText(rows: (string | number | null)[][]) {
  return "\uFEFF" + rows.map((row) => row.map((value) => {
    const raw = String(value ?? "");
    const safe = typeof value === "string" && /^[\s\uFEFF]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n");
}
