import { test, expect } from "@playwright/test";

test("first visits use English and a chosen language survives refresh", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator(".interactive-demo-toolbar").getByRole("button", { name: "Customer", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Good food, every day.");
  await page.getByRole("button", { name: "切换为中文", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("今天，也要好好吃饭。");
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Good food, every day.");
});
