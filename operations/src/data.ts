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
  quoteSchema,
  type Quote,
  type RecordKind,
  sales,
  summary,
  grouped,
  totalCosts,
} from "../shared/domain.ts";
import { performance } from "../shared/analytics.ts";
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
  return {
    sessions,
    inventory,
    quotes: [
      {
        id: "example-quote-1",
        date: "2026-11-10",
        supplier: "Grower A · example",
        product: "Tomatoes",
        unit: "lb",
        spec: "Loose, grade A",
        pack_size: 20,
        pack_price: 3600,
        minimum_order: 15000,
        delivery: 2500,
        handling: 400,
        yield_pct: 92,
        lead_days: 3,
        source_ref: "Synthetic quote, not an actual supplier offer",
        notes: "",
      },
      {
        id: "example-quote-2",
        date: "2026-11-10",
        supplier: "Co-op B · example",
        product: "Tomatoes",
        unit: "lb",
        spec: "Loose, grade A",
        pack_size: 25,
        pack_price: 4800,
        minimum_order: 0,
        delivery: 1000,
        handling: 200,
        yield_pct: 96,
        lead_days: 2,
        source_ref: "Synthetic quote, not an actual supplier offer",
        notes: "",
      },
    ],
  };
}
export type RawTable = {
  headers: string[];
  rows: Record<string, string>[];
  rowNumbers?: number[];
};
export const MAX_FILE = 8 * 1024 * 1024;
export function checkFile(file: File) {
  if (file.size > MAX_FILE) throw new Error("Use files smaller than 8 MB");
}
export function parseCSV(text: string, delimiter = ","): RawTable {
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [],
    lines: number[] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false,
    line = 1,
    start = 1;
  const end = () => {
    row.push(cell);
    if (row.some((x) => x.trim())) {
      rows.push(row);
      lines.push(start);
    }
    row = [];
    cell = "";
    closed = false;
    start = line;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted) {
        quoted = false;
        closed = true;
      } else if (!cell && !closed) quoted = true;
      else throw new Error(`Invalid quote at line ${line}`);
    } else if (c === delimiter && !quoted) {
      row.push(cell);
      cell = "";
      closed = false;
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      line++;
      end();
    } else {
      if (closed)
        throw new Error(`Unexpected text after quote at line ${line}`);
      cell += c;
      if (c === "\n") line++;
    }
  }
  if (quoted) throw new Error("CSV contains an unclosed quote");
  end();
  const headers = (rows.shift() ?? []).map((x) => x.trim());
  lines.shift();
  if (
    !headers.length ||
    headers.some((x) => !x) ||
    new Set(headers).size !== headers.length
  )
    throw new Error("The first row must contain unique, nonempty column names");
  return {
    headers,
    rowNumbers: lines,
    rows: rows.map((r, i) => {
      if (r.length !== headers.length)
        throw new Error(
          `Row ${lines[i]} has ${r.length} values, expected ${headers.length}`,
        );
      return Object.fromEntries(headers.map((h, j) => [h, r[j]]));
    }),
  };
}
export async function readWorkbook(
  file: File,
  allowSynthetic = true,
): Promise<Record<string, RawTable>> {
  checkFile(file);
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "csv" || ext === "tsv") {
    const table = parseCSV(await file.text(), ext === "tsv" ? "\t" : ",");
    if (
      !allowSynthetic &&
      table.rows.some((r) => r.__provenance === "synthetic")
    )
      throw new Error("Example tables cannot be imported into actual records.");
    return { [file.name]: table };
  }
  if (ext !== "xlsx") throw new Error("Choose an .xlsx, .csv or .tsv file");
  const module = await import("exceljs");
  const ExcelJS = module.default ?? module;
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  if (
    !allowSynthetic &&
    String(book.getWorksheet("Read me")?.getCell("A1").value ?? "").includes(
      "SYNTHETIC EXAMPLE",
    )
  )
    throw new Error(
      "Example workbooks cannot be imported into actual records.",
    );
  const str = (v: any): string => {
    if (v == null) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "object") {
      if ("formula" in v || "sharedFormula" in v) {
        if (v.result == null)
          throw new Error(
            "Formula cells need saved calculated values. Recalculate and save in Excel first.",
          );
        return str(v.result);
      }
      if ("richText" in v) return v.richText.map((r: any) => r.text).join("");
      if ("text" in v) return v.text;
      if ("error" in v) throw new Error(`Spreadsheet error: ${v.error}`);
      return "";
    }
    return String(v);
  };
  const tables: Record<string, RawTable> = {};
  for (const sheet of book.worksheets) {
    if (!sheet.rowCount || sheet.name === "Read me") continue;
    // Read only real header cells; formatting far to the right is not data.
    const indexed: { n: number; h: string }[] = [];
    sheet.getRow(1).eachCell((cell, n) => {
      const h = str(cell.value).trim();
      if (h) indexed.push({ n, h });
    });
    const headers = indexed.map((c) => c.h);
    if (!headers.length || new Set(headers).size !== headers.length) continue;
    const rows: RawTable["rows"] = [],
      rowNumbers: number[] = [];
    sheet.eachRow((r, n) => {
      if (n === 1) return;
      const values = indexed.map((c) => str(r.getCell(c.n).value));
      if (values.some((x) => x.trim())) {
        rows.push(Object.fromEntries(headers.map((h, i) => [h, values[i]])));
        rowNumbers.push(n);
      }
    });
    tables[sheet.name] = { headers, rows, rowNumbers };
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
export const quoteColumns = [
  "id",
  "date",
  "supplier",
  "product",
  "unit",
  "spec",
  "pack_size",
  "pack_price_usd",
  "minimum_order_usd",
  "delivery_usd",
  "handling_usd",
  "yield_pct",
  "lead_days",
  "source_ref",
  "notes",
];
export const columnsFor = (kind: RecordKind) =>
  kind === "sessions"
    ? sessionColumns
    : kind === "inventory"
      ? inventoryColumns
      : quoteColumns;
const aliases: Record<string, string[]> = {
  date: ["market_date", "market day", "日期"],
  market: ["site", "location", "market_name", "点位", "市场"],
  session: ["场次"],
  transactions: ["transaction_count", "交易笔数"], // Customers are people, not transactions.
  cash_usd: ["cash", "cash sales", "现金"],
  credit_usd: ["credit", "card", "credit card", "银行卡"],
  snap_usd: ["snap", "ebt", "snap sales"],
  market_bucks_usd: ["market bucks", "market_bucks"],
  wic_usd: ["wic"],
  source_ref: ["source", "来源"],
  notes: ["备注"],
  product: ["商品", "产品"],
  unit: ["单位"],
  opening: ["期初"],
  received: ["入库"],
  sold: ["售出"],
  donated: ["捐赠"],
  spoiled: ["损耗"],
  transferred: ["调出"],
  closing: ["期末"],
  supplier: ["供应商"],
  spec: ["规格"],
  pack_size: ["每包数量"],
  pack_price_usd: ["整包价格"],
  minimum_order_usd: ["最低订单金额"],
  delivery_usd: ["配送费"],
  handling_usd: ["每包处理费"],
  yield_pct: ["可用率"],
  lead_days: ["提前天数"],
  cost_produce_usd: ["采购耗用成本"],
  cost_labor_usd: ["人工成本"],
  cost_transport_usd: ["运输成本"],
  cost_other_usd: ["其他成本"],
  format: ["类型"],
  status: ["状态"],
};
const normalized = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[ _-]+/g, "");
export function guessMapping(headers: string[], columns: string[]) {
  return Object.fromEntries(
    columns.map((c) => [
      c,
      headers.find((h) =>
        [c, ...(aliases[c] ?? [])].some((a) => normalized(a) === normalized(h)),
      ) ?? "",
    ]),
  );
}
export function detectKind(table: RawTable): RecordKind | null {
  if (guessMapping(table.headers, quoteColumns).supplier) return "quotes";
  const m = guessMapping(table.headers, inventoryColumns);
  if (m.product && m.received) return "inventory";
  const s = guessMapping(table.headers, sessionColumns);
  if (s.date && s.market && tenderKeys.some((k) => s[k + "_usd"]))
    return "sessions";
  return null;
}
export type ImportIssue = { sheet: string; row: number; message: string };
export class ImportValidationError extends Error {
  issues: ImportIssue[];
  constructor(issues: ImportIssue[]) {
    super(
      `${issues.length} row error(s). ${issues
        .slice(0, 3)
        .map((i) => `${i.sheet} · Row ${i.row}: ${i.message}`)
        .join(" | ")}`,
    );
    this.issues = issues;
  }
}
function numberFrom(v: string, key: string) {
  if (!v) throw new Error(`${key}: enter 0 when confirmed`);
  if (
    (v.includes(",") && !/^\d{1,3}(,\d{3})+(?:\.\d+)?$/.test(v)) ||
    !/^\d+(?:\.\d+)?$/.test(v.replace(/,/g, ""))
  )
    throw new Error(`${key}: use a nonnegative number`);
  return Number(v.replace(/,/g, ""));
}
export function prepareImport(
  table: RawTable,
  mapping: Record<string, string>,
  kind: RecordKind,
  filename: string,
  zeroMissing: boolean,
): Dataset {
  if (table.rows.length > 20000)
    throw new Error("Import at most 20,000 rows per sheet");
  const issues: ImportIssue[] = [],
    records: any[] = [];
  const used = Object.values(mapping).filter(Boolean);
  if (new Set(used).size !== used.length)
    throw new Error("Each source column can map to only one field");
  table.rows.forEach((row, i) => {
    const get = (k: string) => {
      const raw = mapping[k] ? (row[mapping[k]] ?? "") : "";
      let v = k === "notes" ? raw : raw.trim();
      if (row.__export_format === "qinghe-table-v1" && /^'[\s]*[=+@\-]/.test(v))
        v = v.slice(1);
      return v;
    };
    const common = {
      id: get("id") || crypto.randomUUID(),
      date: get("date"),
      source_ref: get("source_ref") || filename,
      notes: get("notes"),
    };
    try {
      if (kind === "quotes") {
        records.push(
          quoteSchema.parse({
            ...common,
            supplier: get("supplier"),
            product: get("product"),
            unit: get("unit"),
            spec: get("spec"),
            ...Object.fromEntries(
              ["pack_size", "yield_pct", "lead_days"].map((k) => [
                k,
                numberFrom(get(k), k),
              ]),
            ),
            ...Object.fromEntries(
              ["pack_price", "minimum_order", "delivery", "handling"].map(
                (k) => [k, centsFrom(get(k + "_usd"))],
              ),
            ),
          }),
        );
        return;
      }
      const base = {
        ...common,
        market: get("market"),
        session: get("session") || "Main",
      };
      if (kind === "sessions")
        records.push(
          sessionSchema.parse({
            ...base,
            format:
              ({ 流动: "mobile", 固定: "onsite" } as any)[get("format")] ||
              get("format") ||
              "mobile",
            status:
              ({ 已开市: "held", 取消: "cancelled" } as any)[get("status")] ||
              get("status") ||
              "held",
            transactions:
              get("transactions") === ""
                ? null
                : numberFrom(get("transactions"), "transactions"),
            tenders: Object.fromEntries(
              tenderKeys.map((k) => [
                k,
                !mapping[k + "_usd"] && zeroMissing
                  ? 0
                  : centsFrom(get(k + "_usd")),
              ]),
            ),
            costs: Object.fromEntries(
              costKeys.map((k) => [
                k,
                centsFrom(get("cost_" + k + "_usd"), true),
              ]),
            ),
          }),
        );
      else
        records.push(
          inventorySchema.parse({
            ...base,
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
              ].map((k) => [k, numberFrom(get(k), k)]),
            ),
          }),
        );
    } catch (e: any) {
      issues.push({
        sheet: filename,
        row: table.rowNumbers?.[i] ?? i + 2,
        message:
          e.issues
            ?.map((x: any) => `${x.path.join(".")}: ${x.message}`)
            .join("; ") ?? e.message,
      });
    }
  });
  if (issues.length) throw new ImportValidationError(issues);
  return datasetSchema.parse({
    sessions: [],
    inventory: [],
    quotes: [],
    [kind]: records,
  });
}
export function prepareWorkbook(
  tables: Record<string, RawTable>,
  filename: string,
): { data: Dataset; sheets: string[]; ignored: string[] } {
  const data: Dataset = { sessions: [], inventory: [], quotes: [] },
    sheets: string[] = [],
    ignored: string[] = [],
    issues: ImportIssue[] = [];
  for (const [name, table] of Object.entries(tables)) {
    const kind = detectKind(table);
    if (!kind) {
      ignored.push(name);
      continue;
    }
    sheets.push(name);
    try {
      const d = prepareImport(
        table,
        guessMapping(table.headers, columnsFor(kind)),
        kind,
        filename + " / " + name,
        false,
      );
      (data[kind] as any[]).push(...d[kind]);
    } catch (e: any) {
      if (e instanceof ImportValidationError) issues.push(...e.issues);
      else issues.push({ sheet: name, row: 1, message: e.message });
    }
  }
  if (issues.length) throw new ImportValidationError(issues);
  if (!sheets.length)
    throw new Error(
      "No recognized record sheets. Use column mapping for this file.",
    );
  return { data: datasetSchema.parse(data), sheets, ignored };
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function recordValues(kind: RecordKind, s: any): any[] {
  return columnsFor(kind).map((k) =>
    k.endsWith("_usd")
      ? kind === "sessions"
        ? k.startsWith("cost_")
          ? s.costs[k.slice(5, -4)] == null
            ? null
            : s.costs[k.slice(5, -4)] / 100
          : s.tenders[k.slice(0, -4)] / 100
        : s[k.slice(0, -4)] / 100
      : s[k],
  );
}
export function delimited(
  headers: string[],
  rows: unknown[][],
  delimiter = ",",
) {
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (typeof v === "string" && /^(?:[\s]*[=+@\-]|[\t\r])/.test(s))
      s = "'" + s;
    return s.includes(delimiter) || /["\r\n]/.test(s)
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  };
  return (
    "\uFEFF" +
    [headers, ...rows].map((r) => r.map(cell).join(delimiter)).join("\r\n") +
    "\r\n"
  );
}
export function exportDelimited(
  data: Dataset,
  kind: RecordKind,
  demo: boolean,
  ext: "csv" | "tsv" = "csv",
  scope = "all",
) {
  download(
    new Blob(
      [
        delimited(
          [...columnsFor(kind), "__provenance", "__export_format"],
          data[kind].map((r) => [
            ...recordValues(kind, r),
            demo ? "synthetic" : "recorded",
            "qinghe-table-v1",
          ]),
          ext === "tsv" ? "\t" : ",",
        ),
      ],
      {
        type:
          ext === "tsv"
            ? "text/tab-separated-values;charset=utf-8"
            : "text/csv;charset=utf-8",
      },
    ),
    `market-${kind}-${demo ? "EXAMPLE" : "records"}-${scope}-${today()}.${ext}`,
  );
}
export async function buildWorkbook(
  data: Dataset,
  demo: boolean,
  template = false,
  scope = "Entire workspace",
) {
  const module = await import("exceljs");
  const ExcelJS = module.default ?? module;
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
    ["Scope", template ? "Empty input sheets" : scope],
    ["Generated at", new Date().toISOString()],
    [
      "Currency",
      "USD. *_usd columns are dollars. Blank costs and transactions mean unknown; confirmed zero is 0.",
    ],
    [
      "Record grain",
      "Date + market + session. Inventory adds product + unit. Quotes use date + supplier + product + unit + spec + pack_size.",
    ],
    [
      "Payments",
      "SNAP, Market Bucks and WIC are already included in sales. Do not add them again as grants. Transactions are purchases, not unique customers.",
    ],
    [
      "Contribution",
      "Complete-cost held sessions only: sales less produce, labor, transport, other. Unknown-cost sessions excluded from BOTH cohort sales and costs. Cancelled costs shown separately. Not organization profit or bank cash.",
    ],
    [
      "Produce costs",
      "Goods consumed including losses, not all cash purchases. Avoid duplicating costs across stops.",
    ],
    [
      "Inventory",
      "opening + received = sold + donated + spoiled + transferred + closing. transferred is outbound. Keep product units separate.",
    ],
    [
      "Quotes",
      "pack_size is raw units per pack. handling_usd is per pack; delivery_usd is per order. Minimum applies to goods subtotal before delivery/handling. yield_pct is usable percentage. Match product, unit and spec before comparing.",
    ],
    [
      "Import",
      "Use all recognized sheets to restore Market days, Inventory and Supplier quotes together, or map one sheet. Summary sheets are ignored. Imports append; identical records skip; conflicts stop the entire batch. Dates YYYY-MM-DD; format mobile/onsite; status held/cancelled.",
    ],
    [
      "Backup",
      "JSON restores records by merging, without overwriting conflicting records. Keep exported files in private storage. Scenario assumptions export separately in the procurement tool.",
    ],
  ]);
  readme.columns = [{ width: 24 }, { width: 115 }];
  readme.eachRow((r) => {
    r.alignment = { wrapText: true, vertical: "top" };
    r.height = 48;
  });
  const add = (name: string, headers: string[], rows: any[][]) => {
    const s = book.addWorksheet(name);
    s.addRow(headers);
    s.addRows(rows);
    s.views = [{ state: "frozen", ySplit: 1 }];
    s.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: headers.length },
    };
    s.columns.forEach((c, i) => {
      c.width =
        headers[i] === "id"
          ? 38
          : headers[i].includes("source") || headers[i] === "notes"
            ? 48
            : 24;
      if (
        headers[i].includes("_usd") ||
        [
          "sales",
          "cohort_sales",
          "cohort_costs",
          "contribution",
          "cancelled_costs",
          "basket",
        ].includes(headers[i])
      )
        c.numFmt = '"$"#,##0.00;[Red]("$"#,##0.00)';
      if (headers[i].includes("share")) c.numFmt = "0.0%";
    });
    s.eachRow((row, n) => {
      if (n > 1) {
        row.alignment = { vertical: "top", wrapText: true };
        row.height = 34;
      }
    });
    s.getRow(1).height = 36;
    s.getRow(1).alignment = { wrapText: true, vertical: "middle" };
    s.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    s.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF183E35" },
    };
    return s;
  };
  if (!template) {
    const st = summary(data.sessions),
      pf = performance(data.sessions),
      complete = st.held.filter((s) => totalCosts(s) !== null);
    const summarySheet = add(
      "Summary",
      ["metric", "value", "definition"],
      [
        ["sales_usd", st.total / 100, "Held sessions"],
        ["held_sessions", st.held.length, "Cancelled excluded"],
        ["distinct_dates", st.days, "All stops combined per date"],
        [
          "average_day_usd",
          st.averageDay == null ? null : st.averageDay / 100,
          "Sales / distinct held dates",
        ],
        ["assistance_share", st.share, "SNAP + Market Bucks + WIC / sales"],
        [
          "complete_cost_sessions",
          complete.length,
          "All four cost categories known",
        ],
        [
          "missing_cost_sessions",
          st.held.length - complete.length,
          "Contribution unavailable for these sessions",
        ],
        [
          "cohort_contribution_usd",
          complete.length
            ? complete.reduce((n, s) => n + sales(s) - totalCosts(s)!, 0) / 100
            : null,
          "Complete-cost held sessions only",
        ],
        [
          "supplier_quotes",
          data.quotes.length,
          "Quotes are offers, not purchases",
        ],
      ],
    );
    summarySheet.getColumn(1).width = 34;
    summarySheet.getColumn(3).width = 85;
    summarySheet.eachRow((r, n) => {
      if (n === 1) return;
      r.alignment = { wrapText: true, vertical: "top" };
      r.height = 32;
      const metric = String(r.getCell(1).value ?? "");
      r.getCell(2).numFmt = metric.endsWith("_usd")
        ? '"$"#,##0.00;[Red]("$"#,##0.00)'
        : metric.endsWith("_share")
          ? "0.0%"
          : "#,##0";
    });
    for (const [name, period] of [
      ["Daily sales", "day"],
      ["Monthly sales", "month"],
    ] as const)
      add(
        name,
        ["period", "sales_usd", ...tenderKeys.map((k) => k + "_usd")],
        grouped(data.sessions, period).map((r) => [
          r.date,
          r.total,
          ...tenderKeys.map((k) => r[k]),
        ]),
      );
    add(
      "Market performance",
      [
        "market",
        "held_sessions",
        "dates",
        "sales",
        "assistance_usd",
        "complete_cost_sessions",
        "missing_cost_sessions",
        "cohort_sales",
        "cohort_costs",
        "contribution",
        "known_transactions",
        "transaction_sessions",
        "basket",
        "cancelled_sessions",
        "cancelled_costs",
      ],
      pf.map((r) => [
        r.market,
        r.sessions,
        r.days,
        r.sales / 100,
        r.assistance / 100,
        r.complete,
        r.missing,
        r.complete ? r.cohortSales / 100 : null,
        r.complete ? r.cohortCosts / 100 : null,
        r.contribution == null ? null : r.contribution / 100,
        r.transactions,
        r.transactionSessions,
        r.basket == null ? null : r.basket / 100,
        r.cancelled,
        r.cancelledCosts / 100,
      ]),
    );
  }
  for (const kind of ["sessions", "inventory", "quotes"] as const)
    add(
      {
        sessions: "Market days",
        inventory: "Inventory",
        quotes: "Supplier quotes",
      }[kind],
      columnsFor(kind),
      template ? [] : data[kind].map((r) => recordValues(kind, r)),
    );
  return book;
}
export async function exportWorkbook(
  data: Dataset,
  demo: boolean,
  template = false,
  scope?: string,
) {
  const book = await buildWorkbook(data, demo, template, scope),
    bytes = await book.xlsx.writeBuffer();
  download(
    new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `market-operations-${template ? "template" : demo ? "EXAMPLE" : "records"}-${scope ? "filtered-" : ""}${today()}.xlsx`,
  );
}
