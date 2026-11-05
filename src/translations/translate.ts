import { english } from "./en.ts";
import { chinese } from "./zh.ts";

export type Language = "zh" | "en";
export type Parameters = Record<string, string | number | { message: string } | { unit: string; count: number }>;
export type Message = string | { message: string; values?: Parameters };

// Keep complete sentences as keys so each language controls word order.
// Plain parameter values (including customer names) are never translated.
export function translate(
  language: Language,
  text: Message | null | undefined,
  values: Parameters = {},
): string {
  const source =
    typeof text === "object" && text !== null ? text.message : (text ?? "");
  const parameters =
    typeof text === "object" && text !== null ? { ...text.values, ...values } : values;
  const dictionary = language === "en" ? english : chinese;
  const translated = Object.hasOwn(dictionary, source) ? dictionary[source] : source;
  return translated.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (!Object.hasOwn(parameters, key)) return match;
    const value = parameters[key];
    if (typeof value !== "object") return String(value);
    return "unit" in value
      ? quantityUnit(language, value.unit, value.count)
      : translate(language, value.message);
  });
}

export function quantityUnit(language: Language, unit: string, count: number): string {
  if (language === "zh") return translate(language, unit);
  const forms: Record<string, [string, string]> = {
    "颗": ["head", "heads"],
    "把": ["bunch", "bunches"],
    "个": ["item", "items"],
    "袋": ["bag", "bags"],
    "盒": ["box", "boxes"],
    "篮": ["basket", "baskets"],
    "瓶": ["jar", "jars"],
    "块": ["piece", "pieces"],
    "头": ["bulb", "bulbs"],
  };
  return Object.hasOwn(forms, unit) ? forms[unit][count === 1 ? 0 : 1] : translate(language, unit);
}

export function matchesSearch(query: string, ...texts: string[]): boolean {
  const searchable = texts
    .flatMap((text) => [text, translate("en", text), translate("zh", text)])
    .join(" ");
  return searchable.toLowerCase().includes(query.trim().toLowerCase());
}
