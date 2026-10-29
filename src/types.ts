export type Role = "client" | "retailer";
export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
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
}
export interface OrderItem {
  product_id: number;
  name: string;
  unit: string;
  price_cents: number;
  quantity: number;
}
export type OrderStatus = "pending" | "confirmed" | "completed" | "cancelled";
export interface Order {
  id: string;
  client_name: string;
  status: OrderStatus;
  total_cents: number;
  pickup_date: string;
  pickup_slot: string;
  note: string;
  created_at: string;
  items: OrderItem[];
}
export interface Dashboard {
  todayOrders: number;
  pending: number;
  revenueCents: number;
  reservedCents: number;
  activeProducts: number;
  waitingPickup: number;
  outOfStock: number;
  offDateProducts: number;
  lowStock: Product[];
  recentOrders: Order[];
  series: {
    date: string;
    orders: number;
    completedCents: number;
    reservedCents: number;
  }[];
  statusCounts: Record<OrderStatus, number>;
  pickupSummary: {
    slot: string;
    pending: number;
    confirmed: number;
    completed: number;
  }[];
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
