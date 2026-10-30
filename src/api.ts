import type { Parameters } from "./translations/translate";

export class ApiError extends Error {
  status: number;
  values: Parameters;
  constructor(status: number, message: string, values: Record<string, string | number> = {}) {
    super(message);
    this.status = status;
    this.values = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        key === "unit" && typeof value === "string" && typeof values.stock === "number"
          ? { unit: value, count: values.stock }
          : typeof value === "string" ? { message: value } : value,
      ]),
    );
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  }).catch(() => {
    throw new Error("网络请求失败，请稍后重试。");
  });
  const data = await response.json().catch(() => {
    throw new Error("服务器返回了无效响应，请稍后重试。");
  });
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.messageKey ?? data.error ?? "网络请求失败，请稍后重试。",
      data.values,
    );
  return data as T;
}
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export const shortDate = (date: string) => date.slice(5).replace("-", "/");
