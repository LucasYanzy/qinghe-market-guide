import { useEffect, useState } from "react";
import { api } from "./api";
import { pagePaths, type Page } from "./navigation";
import type { Product, OrderStatus } from "./types";

export const orderLabels: Record<OrderStatus, string> = {
  pending: "待确认",
  confirmed: "待自提",
  completed: "已完成",
  cancelled: "已取消",
};
export type InventoryFilter =
  | "all"
  | "today"
  | "low"
  | "out"
  | "off-date"
  | "hidden";
export function inventoryMatches(
  p: Product,
  filter: InventoryFilter,
  today: string,
) {
  const current = !!p.active && p.available_date === today;
  return (
    filter === "all" ||
    (filter === "today" && current) ||
    (filter === "low" && current && p.stock > 0 && p.stock < 10) ||
    (filter === "out" && current && p.stock === 0) ||
    (filter === "off-date" && !!p.active && p.available_date !== today) ||
    (filter === "hidden" && !p.active)
  );
}
export function openVendorPage(
  navigate: (page: Page) => void,
  page: "inventory" | "orders",
  params: Record<string, string> = {},
) {
  navigate(page);
  const query = new URLSearchParams(params).toString();
  if (query)
    window.history.replaceState(null, "", `${pagePaths[page]}?${query}`);
}
export function useVendorData<T>(path: string, revision: number) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<T>(path, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision]);
  return { data, setData, error, loading };
}
