import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { exampleData, buildWorkbook, parseCSV } from "../../src/data";
function fixture() {
  const data = exampleData();
  data.sessions = Array.from({ length: 31 }, (_, i) => ({
    ...data.sessions[0],
    id: "fixture-session-" + i,
    date: "2026-10-" + String(i + 1).padStart(2, "0"),
    market: "Fixture stop",
    session: "Fixture session " + i,
    tenders: {
      cash: 1000,
      credit: 0,
      snap: 0,
      market_bucks: 0,
      wic: 0,
      other: 0,
    },
    costs: { produce: 200, labor: 100, transport: 0, other: 0 },
    source_ref: "Browser test fixture",
    notes: "",
  }));
  data.inventory = data.inventory.map((r) => ({
    ...r,
    market: "Fixture stop",
    source_ref: "Browser test fixture",
  }));
  data.quotes = data.quotes.map((r, i) => ({
    ...r,
    supplier: "Fixture supplier " + i,
    source_ref: "Browser test fixture",
  }));
  return data;
}
async function actual(page: any) {
  await page.goto("./");
  await page.getByRole("button", { name: "My records", exact: true }).click();
  await expect(
    page.getByText("Saved in this browser · export to back up"),
  ).toBeVisible();
}
test("JSON restores all record types; registers paginate, search and export every matching row", async ({
  page,
}) => {
  await actual(page);
  await page
    .getByRole("button", { name: "Import & export", exact: true })
    .click();
  const data = fixture();
  await page.getByLabel("Import file", { exact: true }).setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        kind: "qinghe-operations-backup-v1",
        provenance: "recorded",
        data,
      }),
    ),
  });
  await expect(
    page.getByRole("heading", { name: "Ready to review" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("35 added");
  const backup = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Complete backup", exact: false })
    .click();
  const b = await backup;
  expect(JSON.parse(await fs.readFile((await b.path())!, "utf8")).data).toEqual(
    data,
  );
  await page.getByRole("button", { name: "Market log", exact: true }).click();
  await expect(page.locator(".records-card tbody tr")).toHaveCount(25);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".records-card tbody tr")).toHaveCount(6);
  const csv = page.waitForEvent("download");
  await page.getByRole("button", { name: "Filtered CSV", exact: true }).click();
  const c = await csv;
  expect(
    parseCSV(await fs.readFile((await c.path())!, "utf8")).rows,
  ).toHaveLength(31);
  await page
    .getByLabel("Search records", { exact: true })
    .fill("Fixture session 30");
  await expect(page.locator(".records-card tbody tr")).toHaveCount(1);
  const filtered = page.waitForEvent("download");
  await page.getByRole("button", { name: "Filtered CSV", exact: true }).click();
  const f = await filtered;
  expect(
    parseCSV(await fs.readFile((await f.path())!, "utf8")).rows[0].session,
  ).toBe("Fixture session 30");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Market performance & data quality" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Where the stock went" }),
  ).toBeVisible();
  await page
    .getByLabel("Inventory chart record")
    .selectOption("example-stock-2");
});
test("whole-workbook import is atomic and reports all invalid rows; TSV quotes import into saved procurement", async ({
  page,
}) => {
  await actual(page);
  await page
    .getByRole("button", { name: "Import & export", exact: true })
    .click();
  const book = await buildWorkbook(fixture(), false);
  const file = Buffer.from(await book.xlsx.writeBuffer());
  await page.getByLabel("Import file", { exact: true }).setInputFiles({
    name: "records.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: file,
  });
  await page
    .getByRole("button", { name: "Validate all record sheets" })
    .click();
  await expect(page.getByText("35 to add", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  await page.getByLabel("Import file", { exact: true }).setInputFiles({
    name: "records.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: file,
  });
  await page
    .getByRole("button", { name: "Validate all record sheets" })
    .click();
  await expect(
    page.getByText("35 duplicates to skip", { exact: true }),
  ).toBeVisible();
  const bad =
    "date,market,cash_usd,credit_usd,snap_usd,market_bucks_usd,wic_usd,other_usd\n2026-02-30,A,10,0,0,0,0,0\n2026-11-01,B,no,0,0,0,0,0";
  await page.getByLabel("Import file", { exact: true }).setInputFiles({
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(bad),
  });
  await page
    .getByRole("button", { name: "Validate & preview", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("2 row error(s)");
  await expect(
    page.getByRole("button", { name: "Confirm import", exact: true }),
  ).toHaveCount(0);
  const error = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download error report", exact: false })
    .click();
  const e = await error;
  expect(
    parseCSV(await fs.readFile((await e.path())!, "utf8")).rows.map(
      (r) => r.row,
    ),
  ).toEqual(["2", "3"]);
  const tsv =
    "date\tsupplier\tproduct\tunit\tspec\tpack_size\tpack_price_usd\tminimum_order_usd\tdelivery_usd\thandling_usd\tyield_pct\tlead_days\tsource_ref\n2026-11-17\tTSV Supplier\tApples\tlb\tGrade A\t20\t30\t100\t10\t2\t80\t3\tUI test";
  await page.getByLabel("Import file", { exact: true }).setInputFiles({
    name: "quotes.tsv",
    mimeType: "text/tab-separated-values",
    buffer: Buffer.from(tsv),
  });
  await page
    .getByRole("button", { name: "Validate & preview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("1 added");
  await page.getByRole("button", { name: "Procurement", exact: true }).click();
  await page
    .getByLabel("Quote comparison group")
    .selectOption({ label: "Apples / lb / Grade A" });
  await expect(
    page.getByRole("cell", { name: "TSV Supplier 2026-11-17", exact: true }),
  ).toBeVisible();
});
test("procurement quote CRUD, minimum-order arithmetic, scenario restore and mobile charts", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await actual(page);
  await page.getByRole("button", { name: "Procurement", exact: true }).click();
  await page.getByRole("button", { name: "Add quote", exact: true }).click();
  const form = page.locator(".quote-editor");
  for (const [name, value] of Object.entries({
    date: "2026-11-17",
    supplier: "UI Supplier",
    product: "Tomatoes",
    unit: "lb",
    spec: "Loose grade A",
    pack_size: "20",
    pack_price: "30",
    minimum_order: "100",
    delivery: "10",
    handling: "2",
    yield_pct: "80",
    lead_days: "3",
    source_ref: "Written test quote",
  }))
    await form.locator(`[name="${name}"]`).fill(value);
  await form.getByRole("button", { name: "Save quote", exact: true }).click();
  await expect(form).toHaveCount(0);
  for (const [label, value] of [
    ["Target usable units", "30"],
    ["Base demand", "50"],
    ["Selling price", "5"],
    ["Other session costs", "20"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await expect(page.locator(".procurement-metrics")).toContainText("$92.00");
  await expect(page.locator(".procurement-metrics")).toContainText("4 packs");
  const scenario = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Save scenario", exact: true })
    .click();
  const file = await scenario;
  const bytes = await fs.readFile((await file.path())!);
  await page.getByLabel("Base demand", { exact: true }).fill("0");
  await expect(page.locator(".procurement-metrics")).toContainText("-$158.00");
  await page.getByLabel("Restore procurement scenario").setInputFiles({
    name: "scenario.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await expect(page.getByLabel("Base demand", { exact: true })).toHaveValue(
    "50",
  );
  await page
    .getByRole("button", { name: "Remember inputs", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "My records", exact: true }).click();
  await page.getByRole("button", { name: "Procurement", exact: true }).click();
  await expect(page.getByLabel("Base demand", { exact: true })).toHaveValue(
    "50",
  );
  await expect(page.locator(".procurement-metrics")).toContainText("$92.00");
  await page
    .getByRole("button", { name: "Edit quote UI Supplier", exact: true })
    .click();
  await page.locator('.quote-editor [name="delivery"]').fill("20");
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await expect(page.locator(".procurement-metrics")).toContainText("$82.00");
  await page.getByLabel("Target usable units", { exact: true }).fill("");
  await expect(page.locator(".procurement-metrics")).toHaveCount(0);
  await page.getByLabel("Target usable units", { exact: true }).fill("1000000");
  await expect(page.locator(".procurement-metrics")).toBeVisible();
  await page.getByLabel("Target usable units", { exact: true }).fill("30");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await expect(
    page
      .locator(
        '[aria-label="Demand scenario quantities"] .recharts-bar-rectangle path',
      )
      .first(),
  ).toHaveAttribute("fill", "#315c48");
  await page.screenshot({
    path: "test-results/procurement-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "供应商报价台账", exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete quote UI Supplier", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete quote", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Add your first supplier quote" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
