import type { TenderBreakdown } from '../server/tenders.mjs';
export type Role = "client" | "retailer" | "admin";
export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  roles?: Role[];
}
export interface Config {
  demo: boolean;
  today: string;
  timezone: string;
  currency: string;
  pickupSlots: string[];
}
export interface Product {
  id: number;
  market_id: number;
  market_name?: string;
  market_address?: string;
  retailer_id: number;
  name: string;
  category: string;
  art: string;
  unit: string;
  price_cents: number;
  stock: number;
  farm: string;
  description: string;
  organic: number;
  available_date: string;
  active: number;
  snap_eligibility: "eligible" | "ineligible" | "unknown";
}
export interface Market {
  id: number;
  name: string;
  subtitle: string;
  address: string;
  latitude: number;
  longitude: number;
  hours: string;
  description: string;
  active: number;
  preorders_enabled: number;
  community: string;
  coverage_radius_km: number;
  snap_status: SnapStatus;
  snap_model: "unconfirmed" | "market_tokens" | "vendor_terminal";
  snap_verified_on: string;
  snap_note: string;
  official_location_id?: string;
}
export type SnapStatus = "unconfirmed" | "accepted" | "unavailable";
export interface SnapVendorPolicy { market_id: number; snap_status: SnapStatus; snap_verified_on: string; snap_note: string }
export interface CheckoutQuote {
  marketId: number; marketName: string; totalCents: number; eligibleCents: number; otherCents: number; unknownCents: number;
  snapAvailable: boolean; snapModel: Market["snap_model"]; marketVerifiedOn: string; vendorVerifiedOn: string; instructions: string;
  marketConfirmed?: boolean; vendorConfirmed?: boolean;
  items: { productId: number; name: string; quantity: number; lineCents: number; snapEligibility: Product["snap_eligibility"] }[];
}
export interface ReportSummary {
  orders: number; completed: number; cancelled: number; participants: number; revenueCents: number; reservedCents: number;
  averageOrderCents: number | null; completionRate: number | null; cancellationRate: number | null;
}
export interface ProductPerformance {
  productId: number; name: string; unit: string; marketId: number; marketName: string;
  vendorId: number; vendorName: string; quantity: number; revenueCents: number; orders: number; buyers: number; repeatBuyers: number;
  minPriceCents: number; maxPriceCents: number; sellingDays: number; lastSoldOn: string;
}
export interface BusinessAnalytics {
  receipts: { orders: number; cashCents: number; cardCents: number; snapCents: number };
  attendance: { assignments: number; checkedIn: number; absent: number; unconfirmed: number; sessions: number };
  reports: { reports: number; grossCents: number; transactions: number };
  tenderMix: { reports: number; classifiedCents: number; unclassifiedCents: number; channels: TenderBreakdown };
  fees: { invoices: number; billedCents: number; paidCents: number; outstandingCents: number; overdueCents: number; periodReceiptsCents: number };
}
export interface FinanceTotals { incomeCents: number; expenseCents: number; incomeEntries: number; expenseEntries: number; netCents: number | null }
export interface OperatorFinance {
  current: FinanceTotals; previous: FinanceTotals | null;
  series: { date: string; incomeCents: number | null; expenseCents: number | null }[];
  previousSeries: OperatorFinance['series'] | null;
  categories: { kind: 'income' | 'expense'; category: string; entries: number; amountCents: number }[];
  entries: { id: number | string; marketId: number | null; marketName: string | null; date: string; kind: 'income' | 'expense'; category: string; amountCents: number; description: string; reference: string; version: number; source: 'manual' | 'invoice' }[];
  totalEntries: number;
}
export interface MerchantProfitability {
  reports: number; grossCovered: number; completeCovered: number; salesCents: number | null;
  grossCoveredSalesCents: number | null; goodsCostCents: number | null; grossProfitCents: number | null;
  completeSalesCents: number | null; operatingSurplusCents: number | null;
  rows: { sessionId: number; date: string; marketName: string; salesCents: number; goodsCostCents: number | null; operatingCostCents: number | null; grossProfitCents: number | null; operatingSurplusCents: number | null }[];
}
export interface SchoolAnalytics {
  current: ReportSummary;
  previous: (ReportSummary & { from: string; to: string }) | null;
  customers: { participants: number; newParticipants: number; returningParticipants: number; once: number; twoToThree: number; fourPlus: number };
  inventory: {
    listed: number; available: number; lowStock: number; soldOut: number; snapUnknown: number;
    categories: { name: string; products: number }[];
    alerts: { id: number; name: string; unit: string; stock: number; category: string; snap_eligibility: Product["snap_eligibility"]; marketId: number; marketName: string; vendorName: string }[];
  };
  products: ProductPerformance[];
  previousProducts: ProductPerformance[] | null;
  business: BusinessAnalytics;
  finance: OperatorFinance;
  sellingVendors: number; soldProducts: number;
  slots: { slot: string; orders: number; completed: number; revenueCents: number }[];
  heatmap: { weekday: number; slot: string; orders: number }[];
  payments: { method: "pay_at_pickup" | "snap_ebt"; orders: number; totalCents: number; eligibleCents: number; otherCents: number; completed: number; customers: number }[];
  operations: { overdue: number; outstanding: { id: string; status: OrderStatus; date: string; slot: string; totalCents: number; marketName: string }[] };
}
export interface SchoolOverview {
  updatedAt: string;
  sampleData: boolean;
  analytics: SchoolAnalytics;
  range: string;
  marketId: number | null;
  from: string | null;
  to: string;
  timezone: string;
  summary: {
    orders: number; pending: number; confirmed: number; completed: number; cancelled: number;
    revenueCents: number; reservedCents: number; participants: number; repeatParticipants: number;
    activeMarkets: number; totalMarkets: number; totalVendors: number; activeProducts: number; snapIntentOrders: number;
  };
  markets: (Market & {
    orders: number; completed: number; participants: number; revenueCents: number;
    vendors: number; activeProducts: number; products: number; pending: number; confirmed: number; cancelled: number; snapVendors: number;
  })[];
  vendors: {
    id: number; name: string; email: string; marketNames: string | null; marketIds: number[]; products: number; activeProducts: number;
    orders: number; completed: number; participants: number; revenueCents: number;
    snapMarkets: SnapVendorPolicy[];
  }[];
  timeline: { date: string; orders: number; completed: number; cancelled: number; snapOrders: number; revenueCents: number; participants?: number }[];
  previousTimeline: { date: string; orders: number; completed: number; participants: number; revenueCents: number }[] | null;
}
export interface OrderItem {
  product_id: number;
  name: string;
  unit: string;
  price_cents: number;
  quantity: number;
}
export type OrderStatus = "pending" | "confirmed" | "completed" | "cancelled";
export type PaymentMethod = "pay_at_pickup" | "snap_ebt";
export interface Order {
  id: string;
  client_name: string;
  status: OrderStatus;
  total_cents: number;
  original_total_cents?: number;
  adjustment?: OrderAdjustment | null;
  pickup_date: string;
  pickup_slot: string;
  pickup_code?: string;
  market_session_id?: number | null;
  receipt?: { cash_cents: number; card_cents: number; snap_cents: number; reference: string; recorded_at: string } | null;
  note: string;
  created_at: string;
  items: OrderItem[];
  payment_method: PaymentMethod;
  snap_eligible_cents: number;
  other_payment_cents: number;
  snap_plan: CheckoutQuote | null;
}
export interface OrderAdjustment {
  status: "proposed" | "accepted" | "rejected"; version: number; reason: string; total_cents: number;
  items: {productId: number; name: string; unit: string; quantity: number; lineCents: number}[];
}
export interface Dashboard {
  todayOrders: number;
  pending: number;
  revenueCents: number;
  reservedCents: number;
  activeProducts: number;
  lowStock: Product[];
  recentOrders: Order[];
}
export interface PriceData {
  product: Product;
  history: { date: string; price_cents: number }[];
  forecast: {
    points: {
      date: string;
      price_cents: number;
      low_cents: number;
      high_cents: number;
    }[];
    maeCents: number | null;
    sampleSize: number;
    method: string;
    message: string;
  };
}
