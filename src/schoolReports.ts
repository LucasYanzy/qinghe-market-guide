import type { OperatorFinance, SchoolOverview } from "./types";
import type { ReportPoint } from './ReportTrend';

export type DashboardView = "overview" | "network" | "products" | "snap" | "business" | "reports" | "finance";
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

export function financeTrend(finance: OperatorFinance, from: string, to: string, previousFrom: string | null, metric: 'incomeCents' | 'expenseCents', monthly: boolean): ReportPoint[] {
  const days = new Map<string, ReportPoint>();
  for (const row of finance.series) days.set(row.date, {date: row.date, value: row[metric], previous: null, previousDate: null});
  if (previousFrom) for (const row of finance.previousSeries ?? []) {
    const offset = Math.round((Date.parse(`${row.date}T12:00:00Z`) - Date.parse(`${previousFrom}T12:00:00Z`)) / 86400000);
    const date = reportDate(from, offset);
    if (date > to) continue;
    const point = days.get(date) ?? {date, value: null, previous: null, previousDate: null};
    point.previous = row[metric];
    days.set(date, point);
  }
  for (const row of days.values()) if (previousFrom) {
    const offset = Math.round((Date.parse(`${row.date}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
    row.previousDate = reportDate(previousFrom, offset);
  }
  const sorted = [...days.values()].sort((a,b) => a.date.localeCompare(b.date));
  if (!sorted.length) return [];
  // Include unrecorded dates as gaps, never as invented zero-value entries.
  const first = previousFrom ? from : sorted[0].date;
  const last = previousFrom ? to : sorted[sorted.length - 1].date;
  if (!monthly) {
    const result: ReportPoint[] = [];
    const count = Math.round((Date.parse(last) - Date.parse(first)) / 86400000) + 1;
    for (let i = 0; i < count; i++) {
      const date = reportDate(first, i);
      result.push(days.get(date) ?? {date,value:null,previous:null,previousDate:previousFrom?reportDate(previousFrom,i):null});
    }
    return result;
  }
  const months = new Map<string, ReportPoint>();
  for (const row of sorted) {
    const date = row.date.slice(0,7), bucket = months.get(date) ?? {date, value: null, previous: null, previousDate: null};
    if (row.value !== null) bucket.value = (bucket.value ?? 0) + row.value;
    if (row.previous !== null) bucket.previous = (bucket.previous ?? 0) + row.previous;
    // An aligned month may span two calendar months in the prior period.
    const start = date + '-01' < from ? from : date + '-01';
    const endOfMonth = new Date(Date.UTC(Number(date.slice(0,4)), Number(date.slice(5,7)), 0)).toISOString().slice(0,10);
    const end = endOfMonth > to ? to : endOfMonth;
    const shift = (day: string) => Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
    bucket.previousDate = previousFrom ? `${reportDate(previousFrom, shift(start))} – ${reportDate(previousFrom, shift(end))}` : null;
    months.set(date, bucket);
  }
  const result: ReportPoint[] = [];
  for (let date = first.slice(0,7); date <= last.slice(0,7);) {
    result.push(months.get(date) ?? {date,value:null,previous:null,previousDate:null});
    date = new Date(Date.UTC(Number(date.slice(0,4)), Number(date.slice(5,7)), 1)).toISOString().slice(0,7);
  }
  return result;
}
export function csvText(rows: (string | number | null)[][]) {
  return "\uFEFF" + rows.map((row) => row.map((value) => {
    const raw = String(value ?? "");
    const safe = typeof value === "string" && /^[\s\uFEFF]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n");
}
