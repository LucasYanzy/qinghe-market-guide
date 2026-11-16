import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
test("overview, filters, language and mobile layout", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Market overview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Synthetic figures · separate from your records"),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/overview-desktop.png",
    fullPage: true,
  });
  await page
    .locator("#market-filter")
    .selectOption({ label: "Campus stop · example" });
  await expect(page.getByText("4 held sessions · USD")).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "市集运营概览", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({
    path: "test-results/overview-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A place for every pound." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("actual records stay empty; save, reload, edit and remove a session", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "My records", exact: true }).click();
  await expect(
    page.getByText("Saved on this computer · no customer details"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your first market day starts here." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Log market day", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('[name="date"]').fill("2026-11-12");
  await dialog.locator('[name="market"]').fill("Workflow test stop");
  await dialog
    .getByRole("button", { name: "Confirm empty payment fields as 0" })
    .click();
  await dialog.locator('[name="cash"]').fill("20.01");
  await dialog.locator('[name="snap"]').fill("10.99");
  await dialog.locator('[name="source_ref"]').fill("UI test fixture");
  await dialog
    .getByRole("button", { name: "Save record", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".metric-accent strong")).toHaveText("$31.00");
  await page.reload();
  await page.getByRole("button", { name: "My records", exact: true }).click();
  await expect(page.locator(".metric-accent strong")).toHaveText("$31.00");
  await page.getByRole("button", { name: "Market log", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Unknown", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit 2026-11-12 Workflow test stop" })
    .click();
  for (const k of ["produce", "labor", "transport", "other"])
    await page.getByRole("dialog").locator(`[name="cost_${k}"]`).fill("1");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save record", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "$27.00", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete 2026-11-12 Workflow test stop" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete record", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No market days yet." }),
  ).toBeVisible();
});
test("Excel export imports back without duplication and cannot seed actual records", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import & export", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Excel workbook", exact: false })
    .click();
  const file = await download;
  const output = path.resolve("test-results/example-roundtrip.xlsx");
  await file.saveAs(output);
  expect((await fs.stat(output)).size).toBeGreaterThan(5000);
  await page.getByLabel("Import file", { exact: true }).setInputFiles(output);
  await page
    .getByRole("button", { name: "Validate & preview", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ready to review" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("0 records imported");
  await page.getByRole("button", { name: "My records", exact: true }).click();
  await page.getByLabel("Import file", { exact: true }).setInputFiles(output);
  await expect(page.getByRole("alert")).toContainText(
    "Example workbooks cannot be imported",
  );
});
test("CSV validation, real import, conflict rollback and scenario controls", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "My records", exact: true }).click();
  await expect(
    page.getByText("Saved on this computer · no customer details"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Import & export", exact: true })
    .click();
  const csv =
    "date,market,cash_usd,credit_usd,snap_usd,market_bucks_usd,wic_usd,other_usd,source_ref\n2026-11-13,CSV fixture,10,0,5,0,0,0,Test CSV\n";
  await page
    .getByLabel("Import file", { exact: true })
    .setInputFiles({
      name: "actual.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await page
    .getByRole("button", { name: "Validate & preview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("1 added");
  await page
    .getByLabel("Import file", { exact: true })
    .setInputFiles({
      name: "conflict.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv.replace(",10,0,5,", ",100,0,5,")),
    });
  await page
    .getByRole("button", { name: "Validate & preview", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Conflicting existing record",
  );
  await page.getByRole("button", { name: "Scenario lab", exact: true }).click();
  await expect(
    page.getByText("Assumptions, not a forecast.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".scenario-result-card>strong")).toHaveText(
    "$96.80",
  );
  await page
    .getByLabel("Standard-stop selling price", { exact: false })
    .fill("1");
  await expect(page.locator(".visits-number")).toContainText("—");
  await page.screenshot({ path: "test-results/scenario.png", fullPage: true });
  await page.getByRole("button", { name: "Market log", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete 2026-11-13 CSV fixture" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete record", exact: true })
    .click();
});
