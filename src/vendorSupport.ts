import { useCallback, useEffect, useState } from "react";
import type { Message } from "./i18n";
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
  window.dispatchEvent(new Event("qinghe:navigate"));
}
export function useVendorData<T>(path: string, revision: number) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Message>("");
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number>();
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<T>(path, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setUpdatedAt(Date.now());
        }
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision]);
  return { data, setData, error, loading, updatedAt };
}

// URL-backed filters survive reloads, back navigation and opening a saved link.
export function useVendorFilters<T extends Record<string, string>>(
  defaults: T,
) {
  const read = useCallback(() => {
    const query = new URLSearchParams(window.location.search);
    return Object.fromEntries(
      Object.entries(defaults).map(([key, value]) => [
        key,
        query.get(key) ?? value,
      ]),
    ) as T;
  }, [defaults]);
  const [filters, setFilters] = useState(read);
  useEffect(() => {
    const sync = () => setFilters(read());
    window.addEventListener("popstate", sync);
    window.addEventListener("qinghe:navigate", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("qinghe:navigate", sync);
    };
  }, [read]);
  const update = useCallback(
    (patch: Partial<T>) => {
      const next = { ...read(), ...patch };
      const query = new URLSearchParams(window.location.search);
      Object.entries(next).forEach(([key, value]) => {
        if (value === defaults[key]) query.delete(key);
        else query.set(key, value);
      });
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${query.size ? `?${query}` : ""}`,
      );
      setFilters(next);
    },
    [defaults, read],
  );
  return [filters, update] as const;
}
