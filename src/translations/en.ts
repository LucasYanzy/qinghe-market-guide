import { commonEnglish } from "./common.ts";
import { vendorEnglish } from "./vendor.ts";

export const english: Record<string, string> = {
  ...commonEnglish,
  ...vendorEnglish,
};
