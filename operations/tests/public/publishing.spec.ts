import { test, expect } from "@playwright/test";
test("published base path loads and real records work without any API server", async ({
  page,
  context,
}) => {
  const errors: string[] = [],
    apiRequests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.route("**/api/**", (r) => {
    apiRequests.push(r.request().url());
    return r.abort();
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Market overview", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My records", exact: true }).click();
  await expect(
    page.getByText("Saved in this browser · export to back up"),
  ).toBeVisible();
  await page.getByRole("button", { name: "My records", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your first market day starts here." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Log market day", exact: true })
    .click();
  const d = page.getByRole("dialog");
  await d.locator('[name="date"]').fill("2026-11-16");
  await d.locator('[name="market"]').fill("Browser test");
  await d
    .getByRole("button", { name: "Confirm empty payment fields as 0" })
    .click();
  await d.locator('[name="cash"]').fill("25.13");
  await d.locator('[name="source_ref"]').fill("Browser test fixture");
  await d.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(d).not.toBeVisible();
  await expect(page.locator(".metric-accent strong")).toHaveText("$25.13");
  await page.reload();
  await page.getByRole("button", { name: "My records", exact: true }).click();
  await expect(page.locator(".metric-accent strong")).toHaveText("$25.13");
  const stale = await context.newPage();
  await stale.goto("./");
  await stale.getByRole("button", { name: "My records", exact: true }).click();
  await expect(stale.locator(".metric-accent strong")).toHaveText("$25.13");
  await page.getByRole("button", { name: "Market log", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit 2026-11-16 Browser test" })
    .click();
  await d.locator('[name="cash"]').fill("30");
  await d.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(d).not.toBeVisible();
  await stale.getByRole("button", { name: "Market log", exact: true }).click();
  await stale
    .getByRole("button", { name: "Edit 2026-11-16 Browser test" })
    .click();
  await stale.getByRole("dialog").locator('[name="cash"]').fill("99");
  await stale
    .getByRole("dialog")
    .getByRole("button", { name: "Save record", exact: true })
    .click();
  await expect(stale.getByRole("dialog").getByRole("alert")).toContainText(
    "Records changed in another tab",
  );
  await page
    .getByRole("button", { name: "Import & export", exact: true })
    .click();
  const dl = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Complete backup", exact: false })
    .click();
  await (await dl).saveAs("test-results/published-records-backup.json");
  const excel = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Excel workbook", exact: false })
    .click();
  await (await excel).saveAs("test-results/published-records.xlsx");
  await page.getByRole("button", { name: "Example", exact: true }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.locator(".metric-accent strong")).toHaveText("$4,599.00");
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
});
test("public records are isolated in another browser context; imports and mobile layouts work", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "My records", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your first market day starts here." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Import & export", exact: true })
    .click();
  const csv =
    "date,market,cash_usd,credit_usd,snap_usd,market_bucks_usd,wic_usd,other_usd,source_ref\n2026-11-16,Import test,10,0,5,0,0,0,Public test fixture\n";
  await page
    .getByLabel("Import file", { exact: true })
    .setInputFiles({
      name: "import.csv",
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
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "市集运营概览", exact: true }),
  ).toBeVisible();
});
