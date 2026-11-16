import {
  datasetSchema,
  type Dataset,
  type Session,
  type Inventory,
  tenderKeys,
  costKeys,
  centsFrom,
  sessionSchema,
  inventorySchema,
} from "../shared/domain.ts";
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function exampleData(): Dataset {
  const dates = [
    "2026-09-08",
    "2026-09-15",
    "2026-09-22",
    "2026-09-29",
    "2026-10-06",
    "2026-10-13",
    "2026-10-20",
    "2026-10-27",
    "2026-11-03",
    "2026-11-10",
  ];
  const sessions: Session[] = dates.map((date, i) => ({
    id: "example-" + i,
    date,
    market:
      i % 3 === 0 ? "Campus stop · example" : "Neighborhood stop · example",
    session: "Main",
    format: "mobile",
    status: "held",
    transactions: 24 + i * 2,
    tenders: {
      cash: 9200 + i * 760,
      credit: 8700 + i * 640,
      snap: 13800 + i * 870,
      market_bucks: 3400 + i * 150,
      wic: 0,
      other: 0,
    },
    costs: {
      produce: 23000 + i * 1100,
      labor: 12000,
      transport: 2500,
      other: i === 9 ? null : 1200,
    },
    source_ref: "Synthetic demonstration / not Rutgers operating results",
    notes: "Illustrative figures for testing the interface.",
  }));
  const inventory: Inventory[] = [
    {
      id: "example-stock-1",
      date: dates[9],
      market: sessions[9].market,
      session: "Main",
      product: "Tomatoes",
      unit: "lb",
      opening: 0,
      received: 60,
      sold: 42,
      donated: 4,
      spoiled: 2,
      transferred: 8,
      closing: 4,
      source_ref: "Synthetic demonstration",
      notes:
        "Transferred quantity is an outbound movement; record receiving stock separately.",
    },
    {
      id: "example-stock-2",
      date: dates[9],
      market: sessions[9].market,
      session: "Main",
      product: "Apples",
      unit: "lb",
      opening: 0,
      received: 80,
      sold: 58,
      donated: 6,
      spoiled: 0,
      transferred: 10,
      closing: 6,
      source_ref: "Synthetic demonstration",
      notes: "",
    },
  ];
  return { sessions, inventory };
}
export type RawTable = { headers: string[]; rows: Record<string, string>[] };
export function parseCSV(text: string): RawTable {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || cell === "") quoted = !quoted;
      else throw new Error("Invalid CSV quote");
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("CSV contains an unclosed quote");
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  const headers = (rows.shift() ?? []).map((x) =>
    x.replace(/^\uFEFF/, "").trim(),
  );
  if (
    !headers.length ||
    new Set(headers).size !== headers.length ||
    headers.some((x) => !x)
  )
    throw new Error("The first row must contain unique, nonempty column names");
  return {
    headers,
    rows: rows.map((r, i) => {
      if (r.length !== headers.length)
        throw new Error(
          `Row ${i + 2} has ${r.length} values, expected ${headers.length}`,
        );
      return Object.fromEntries(headers.map((h, j) => [h, r[j]]));
    }),
  };
}
export async function readWorkbook(
  file: File,
  allowSynthetic = true,
): Promise<Record<string, RawTable>> {
  if (file.size > 8 * 1024 * 1024)
    throw new Error("Use files smaller than 8 MB");
  if (file.name.toLowerCase().endsWith(".csv"))
    return { [file.name]: parseCSV(await file.text()) };
  if (!file.name.toLowerCase().endsWith(".xlsx"))
    throw new Error("Choose an .xlsx or .csv file");
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  if (
    !allowSynthetic &&
    String(
      workbook.getWorksheet("Read me")?.getCell("A1").value ?? "",
    ).includes("SYNTHETIC EXAMPLE")
  )
    throw new Error(
      "Example workbooks cannot be imported into actual records.",
    );
  const tables: Record<string, RawTable> = {};
  for (const sheet of workbook.worksheets) {
    if (!sheet.rowCount) continue;
    const str = (v: any): string => {
      if (v === null || v === undefined) return "";
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      if (typeof v === "object") {
        if ("formula" in v) return str(v.result);
        if ("richText" in v) return v.richText.map((r: any) => r.text).join("");
        if ("text" in v) return v.text;
        return "";
      }
      return String(v);
    };
    const headers = Array.from({ length: sheet.columnCount }, (_, i) =>
      str(sheet.getRow(1).getCell(i + 1).value).trim(),
    );
    if (headers.some((h) => !h) || new Set(headers).size !== headers.length)
      continue;
    const rows: Record<string, string>[] = [];
    sheet.eachRow((r, n) => {
      if (n === 1) return;
      const values = headers.map((_, i) => str(r.getCell(i + 1).value));
      if (values.some((x) => x.trim()))
        rows.push(Object.fromEntries(headers.map((h, i) => [h, values[i]])));
    });
    tables[sheet.name] = { headers, rows };
  }
  if (!Object.keys(tables).length)
    throw new Error("No sheet with unique column names in row 1 was found");
  return tables;
}
export const sessionColumns = [
  "id",
  "date",
  "market",
  "session",
  "format",
  "status",
  "transactions",
  ...tenderKeys.map((k) => k + "_usd"),
  ...costKeys.map((k) => "cost_" + k + "_usd"),
  "source_ref",
  "notes",
];
export const inventoryColumns = [
  "id",
  "date",
  "market",
  "session",
  "product",
  "unit",
  "opening",
  "received",
  "sold",
  "donated",
  "spoiled",
  "transferred",
  "closing",
  "source_ref",
  "notes",
];
const aliases: Record<string, string[]> = {
  date: ["market_date", "market day", "date"],
  market: ["market", "site", "location", "market_name"],
  transactions: ["transactions", "customers", "transaction_count"],
  cash_usd: ["cash", "cash sales"],
  credit_usd: ["credit", "card", "credit card"],
  snap_usd: ["snap", "ebt", "snap sales"],
  market_bucks_usd: ["market bucks", "market_bucks"],
  wic_usd: ["wic"],
  source_ref: ["source", "source_ref"],
};
export function guessMapping(headers: string[], columns: string[]) {
  return Object.fromEntries(
    columns.map((c) => [
      c,
      headers.find((h) =>
        [c, ...(aliases[c] ?? [])].some(
          (a) => a.toLowerCase() === h.toLowerCase(),
        ),
      ) ?? "",
    ]),
  );
}
export function prepareImport(
  table: RawTable,
  mapping: Record<string, string>,
  kind: "sessions" | "inventory",
  filename: string,
  zeroMissing: boolean,
): Dataset {
  if (table.rows.length > 20000)
    throw new Error("Import at most 20,000 rows at a time");
  const records = table.rows.map((row, i) => {
    const get = (key: string) =>
      mapping[key] ? (row[mapping[key]]?.trim() ?? "") : "";
    const common = {
      id: get("id") || crypto.randomUUID(),
      date: get("date"),
      market: get("market"),
      session: get("session") || "Main",
      source_ref: get("source_ref") || filename,
      notes: get("notes"),
    };
    try {
      if (kind === "sessions") {
        const tenders = Object.fromEntries(
          tenderKeys.map((k) => {
            const value = get(k + "_usd");
            if (!mapping[k + "_usd"] && zeroMissing) return [k, 0];
            return [k, centsFrom(value)];
          }),
        );
        return sessionSchema.parse({
          ...common,
          format: get("format") || "mobile",
          status: get("status") || "held",
          transactions:
            get("transactions") === "" ? null : Number(get("transactions")),
          tenders,
          costs: Object.fromEntries(
            costKeys.map((k) => [
              k,
              centsFrom(get("cost_" + k + "_usd"), true),
            ]),
          ),
        });
      }
      return inventorySchema.parse({
        ...common,
        product: get("product"),
        unit: get("unit"),
        ...Object.fromEntries(
          [
            "opening",
            "received",
            "sold",
            "donated",
            "spoiled",
            "transferred",
            "closing",
          ].map((k) => {
            const v = get(k);
            if (v === "") throw new Error(`${k}: enter 0 when confirmed`);
            return [k, Number(v)];
          }),
        ),
      });
    } catch (e: any) {
      throw new Error(
        `Row ${i + 2}: ${e.issues?.map((x: any) => `${x.path.join(".")}: ${x.message}`).join("; ") ?? e.message}`,
      );
    }
  });
  return datasetSchema.parse({
    sessions: kind === "sessions" ? records : [],
    inventory: kind === "inventory" ? records : [],
  });
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportWorkbook(
  data: Dataset,
  demo: boolean,
  template = false,
) {
  const ExcelJS = await import("exceljs");
  const book = new ExcelJS.Workbook();
  book.creator = "Qinghe Market Operations";
  const readme = book.addWorksheet("Read me");
  readme.addRows([
    [
      "Market Operations · " +
        (template
          ? "Import template"
          : demo
            ? "SYNTHETIC EXAMPLE"
            : "Recorded data"),
    ],
    [
      "Purpose",
      "Per-session sales, payment mix, costs and inventory; not a vendor-profit or bank-cash statement.",
    ],
    [
      "Currency",
      "USD. Every *_usd column is dollars. Unknown costs and transaction counts are blank; confirmed zero is 0.",
    ],
    [
      "Grain",
      "One row per date + market + session. Inventory adds product + unit. Dates YYYY-MM-DD; format mobile/onsite; status held/cancelled.",
    ],
    [
      "Payments",
      "Mutually exclusive actual tender amounts. SNAP, Market Bucks and WIC are included in sales, not added again as grant income. Record net sales after refunds consistently.",
    ],
    [
      "Inventory",
      "opening + received = sold + donated + spoiled + transferred + closing. transferred means outbound; record inbound under received.",
    ],
    [
      "Costs",
      "produce = cost of goods consumed including inventory losses, not the value of all purchases. labor includes paid/economic staff time; other should exclude produce already recorded. Blank means unknown.",
    ],
    [
      "Source",
      "Keep a traceable source_ref per record. No customer personal information is required.",
    ],
    [
      "Import",
      "Choose Market days or Inventory sheet; preview and confirm each separately. Imports append; identical records skip and conflicting records stop the batch.",
    ],
    [
      "Backups",
      "Use JSON backup for a complete copy. Keep files in your organization’s private storage.",
    ],
    ["Generated at", new Date().toISOString()],
    [
      "Scope",
      template
        ? "Empty input sheets"
        : `${data.sessions.length} sessions; ${data.inventory.length} inventory rows; entire current dataset`,
    ],
  ]);
  readme.columns = [{ width: 23 }, { width: 115 }];
  readme.eachRow((r) => {
    r.alignment = { wrapText: true, vertical: "top" };
    r.height = 44;
  });
  const sessions = book.addWorksheet("Market days");
  sessions.addRow(sessionColumns);
  if (!template)
    for (const s of data.sessions)
      sessions.addRow(
        sessionColumns.map((k) =>
          k.endsWith("_usd")
            ? k.startsWith("cost_")
              ? s.costs[k.slice(5, -4) as keyof Session["costs"]] === null
                ? null
                : s.costs[k.slice(5, -4) as keyof Session["costs"]]! / 100
              : s.tenders[k.slice(0, -4) as keyof Session["tenders"]] / 100
            : (s as any)[k],
        ),
      );
  const inventory = book.addWorksheet("Inventory");
  inventory.addRow(inventoryColumns);
  if (!template)
    for (const s of data.inventory)
      inventory.addRow(inventoryColumns.map((k) => (s as any)[k]));
  for (const sheet of [sessions, inventory]) {
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columnCount },
    };
    sheet.columns.forEach((c, i) => {
      c.width = i === 0 ? 38 : 22;
    });
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF183E35" },
    };
    sheet.getRow(1).height = 28;
    sheet.eachRow((r, n) => {
      if (n > 1) r.alignment = { vertical: "top", wrapText: true };
    });
  }
  const bytes = await book.xlsx.writeBuffer();
  download(
    new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `market-operations-${template ? "template" : demo ? "EXAMPLE" : "records"}-${today()}.xlsx`,
  );
}
