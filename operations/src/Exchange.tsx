import { useState } from "react";
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  Database,
  NotebookPen,
  ArrowRight,
} from "lucide-react";
import {
  type Dataset,
  type RecordKind,
  datasetSchema,
  mergeRecords,
  sales,
} from "../shared/domain.ts";
import {
  type RawTable,
  type ImportIssue,
  ImportValidationError,
  readWorkbook,
  columnsFor,
  guessMapping,
  detectKind,
  prepareImport,
  prepareWorkbook,
  download,
  delimited,
  exportDelimited,
  today,
  checkFile,
} from "./data";
type T = (a: string, b: string) => string;
export function Exchange({
  t,
  state,
  mode,
  busy,
  connected,
  exportFile,
  mutate,
  setError,
}: {
  t: T;
  state: Dataset;
  mode: string;
  busy: boolean;
  connected: boolean;
  exportFile: (template?: boolean) => void;
  mutate: (a: string, p: any) => Promise<boolean>;
  setError: (s: string) => void;
}) {
  const [tables, setTables] = useState<Record<string, RawTable>>({}),
    [sheet, setSheet] = useState(""),
    [file, setFile] = useState("");
  const [kind, setKind] = useState<RecordKind>("sessions"),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [zero, setZero] = useState(false);
  const [preview, setPreview] = useState<Dataset | null>(null),
    [stats, setStats] = useState({ added: 0, skipped: 0 }),
    [reading, setReading] = useState(false),
    [error, setLocalError] = useState(""),
    [issues, setIssues] = useState<ImportIssue[]>([]),
    [scope, setScope] = useState("");
  const [outKind, setOutKind] = useState<RecordKind>("sessions");
  const table = tables[sheet],
    columns = columnsFor(kind);
  const label = (k: RecordKind) =>
    ({
      sessions: t("Market days", "场次"),
      inventory: t("Inventory", "库存"),
      quotes: t("Supplier quotes", "供应商报价"),
    })[k];
  function resetPreview() {
    setPreview(null);
    setLocalError("");
    setIssues([]);
  }
  function choose(s: string, k: RecordKind = detectKind(tables[s]) ?? kind) {
    setSheet(s);
    setKind(k);
    setMapping(guessMapping(tables[s].headers, columnsFor(k)));
    setZero(false);
    resetPreview();
  }
  function review(data: Dataset, scope: string) {
    const m = mergeRecords(state, data);
    setStats({ added: m.added, skipped: m.skipped });
    setPreview(data);
    setScope(scope);
  }
  function fail(e: any) {
    setPreview(null);
    setLocalError(e.message);
    setIssues(e instanceof ImportValidationError ? e.issues : []);
  }
  async function load(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setReading(true);
    setError("");
    resetPreview();
    setTables({});
    setFile(f.name);
    try {
      checkFile(f);
      if (f.name.toLowerCase().endsWith(".json")) {
        const v = JSON.parse(await f.text());
        if (
          v.kind !== "qinghe-operations-backup-v1" ||
          !["recorded", "synthetic"].includes(v.provenance)
        )
          throw new Error("Not a Market Operations backup");
        if (mode === "actual" && v.provenance === "synthetic")
          throw new Error(
            t(
              "Example backups cannot be imported into actual records.",
              "演示备份不能导入真实记录。",
            ),
          );
        review(
          datasetSchema.parse(v.data),
          t("Complete JSON backup", "完整 JSON 备份"),
        );
      } else {
        const result = await readWorkbook(f, mode !== "actual");
        setTables(result);
        const s =
            Object.keys(result).find((k) => detectKind(result[k])) ??
            Object.keys(result)[0],
          k = detectKind(result[s]) ?? "sessions";
        setSheet(s);
        setKind(k);
        setMapping(guessMapping(result[s].headers, columnsFor(k)));
        setZero(false);
      }
    } catch (e) {
      fail(e);
    } finally {
      setReading(false);
      e.target.value = "";
    }
  }
  function validate(all = false) {
    resetPreview();
    try {
      if (all) {
        const r = prepareWorkbook(tables, file);
        review(
          r.data,
          t("Sheets: ", "工作表：") +
            r.sheets.join(", ") +
            (r.ignored.length
              ? t(" · ignored: ", " · 已忽略：") + r.ignored.join(", ")
              : ""),
        );
      } else review(prepareImport(table, mapping, kind, file, zero), sheet);
    } catch (e) {
      fail(e);
    }
  }
  const count = preview
    ? preview.sessions.length + preview.inventory.length + preview.quotes.length
    : 0;
  return (
    <div className="exchange-grid">
      <section className="card import-card">
        <div className="card-head">
          <div>
            <div className="step-label">
              01 / {t("BRING RECORDS IN", "导入记录")}
            </div>
            <h2>{t("Import a spreadsheet", "导入表格")}</h2>
            <p>
              {t(
                "Excel (.xlsx), CSV, TSV or a complete JSON backup. Maximum 8 MB.",
                "Excel（.xlsx）、CSV、TSV 或完整 JSON 备份，最大 8 MB。",
              )}
            </p>
          </div>
          <FileSpreadsheet size={27} />
        </div>
        <label className="upload-zone">
          <Upload size={28} />
          <b>
            {reading
              ? t("Reading file…", "读取中…")
              : t("Choose your file", "选择文件")}
          </b>
          <span>
            {t(
              "Map columns → check preview → confirm import",
              "映射列名 → 预览核对 → 确认导入",
            )}
          </span>
          <input
            aria-label="Import file"
            type="file"
            accept=".csv,.tsv,.xlsx,.json"
            onChange={load}
            disabled={reading || busy}
          />
        </label>
        <p className="form-help">
          {t(
            "Imports append safely. Identical records skip; changed records require editing the existing row. JSON restores missing records without replacing your current dataset.",
            "导入追加记录：相同行跳过，改动行需编辑原记录。JSON 恢复缺失记录，不覆盖现有数据。",
          )}
        </p>
        {table && (
          <>
            <div className="batch-import">
              <h3>{t("Import the whole workbook", "整本工作簿导入")}</h3>
              <p>
                {Object.entries(tables)
                  .filter(([, v]) => detectKind(v))
                  .map(([s, v]) => `${s} (${v.rows.length})`)
                  .join(" · ") ||
                  t(
                    "Use column mapping below for this file.",
                    "此文件请使用下方列名映射。",
                  )}
              </p>
              <button
                className="btn primary"
                disabled={busy}
                onClick={() => validate(true)}
              >
                {t("Validate all record sheets", "校验所有记录表")}
              </button>
            </div>
            <div className="form-grid">
              <label className="field">
                {t("Worksheet", "工作表")}
                <select value={sheet} onChange={(e) => choose(e.target.value)}>
                  {Object.keys(tables).map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t("Record type", "记录类型")}
                <select
                  value={kind}
                  onChange={(e) => choose(sheet, e.target.value as RecordKind)}
                >
                  {(["sessions", "inventory", "quotes"] as const).map((k) => (
                    <option key={k} value={k}>
                      {label(k)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <details className="column-mapping" open>
              <summary>
                {t("Map columns for one sheet", "单表列名映射")}
              </summary>
              <div className="mapping-list">
                {columns.map((c) => (
                  <label key={c}>
                    <span>
                      {c}
                      <small>{c.endsWith("_usd") ? "USD" : ""}</small>
                    </span>
                    <ArrowRight size={13} />
                    <select
                      aria-label={"Map " + c}
                      value={mapping[c] ?? ""}
                      onChange={(e) => {
                        setMapping({ ...mapping, [c]: e.target.value });
                        resetPreview();
                      }}
                    >
                      <option value="">{t("Not mapped", "未映射")}</option>
                      {table.headers.map((h) => (
                        <option key={h}>{h}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </details>
            <p className="form-help">
              {t(
                "Dates YYYY-MM-DD. Unmapped ID generates an ID; session defaults to Main; format mobile; status held; source filename. Unknown costs and transactions stay blank. Inventory quantities and all quote drivers need explicit values.",
                "日期为 YYYY-MM-DD。未映射 ID 自动生成，场次默认 Main，类型 mobile，状态 held，来源为文件名。未知成本和笔数留空；库存及报价参数须明确填写。",
              )}
            </p>
            {kind === "sessions" && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={zero}
                  onChange={(e) => {
                    setZero(e.target.checked);
                    resetPreview();
                  }}
                />
                {t(
                  "I confirm that payment methods without mapped columns were not used (0).",
                  "我确认未映射的支付方式没有使用（金额为 0）。",
                )}
              </label>
            )}
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => validate()}
            >
              {t("Validate & preview", "校验并预览")}
              <ArrowRight size={16} />
            </button>
          </>
        )}
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {!!issues.length && (
          <div className="import-errors">
            <button
              className="btn secondary"
              onClick={() =>
                download(
                  new Blob(
                    [
                      delimited(
                        ["sheet", "row", "error"],
                        issues.map((i) => [i.sheet, i.row, i.message]),
                      ),
                    ],
                    { type: "text/csv;charset=utf-8" },
                  ),
                  `import-errors-${today()}.csv`,
                )
              }
            >
              <Download size={16} />
              {t("Download error report", "下载错误清单")} ({issues.length})
            </button>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("Sheet", "工作表")}</th>
                    <th>{t("Row", "行")}</th>
                    <th>{t("Error", "错误")}</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.slice(0, 50).map((i, n) => (
                    <tr key={n}>
                      <td>{i.sheet}</td>
                      <td>{i.row}</td>
                      <td>{i.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="form-help">
              {t(
                "Showing first 50 errors; download contains every error. No rows have been saved.",
                "最多显示 50 项，下载包含全部错误。尚未保存任何行。",
              )}
            </p>
          </div>
        )}
        {preview && (
          <div className="preview-box">
            <h3>
              <CheckCircle2 size={18} />
              {t("Ready to review", "待核对导入")}
            </h3>
            <p>
              {file} · {preview.sessions.length} {t("sessions", "场次")} ·{" "}
              {preview.inventory.length} {t("inventory rows", "库存记录")} ·{" "}
              {preview.quotes.length} {t("quotes", "报价")}
            </p>
            <p>{scope}</p>
            <div className="import-totals">
              <b>
                {stats.added} {t("to add", "条新增")}
              </b>
              <span>
                {stats.skipped} {t("duplicates to skip", "条相同记录跳过")}
              </span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Market / supplier</th>
                    <th>{t("Sales / product", "销售 / 商品")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...preview.sessions,
                    ...preview.inventory,
                    ...preview.quotes,
                  ]
                    .slice(0, 8)
                    .map((r, i) => (
                      <tr key={i}>
                        <td>{r.date}</td>
                        <td>{"supplier" in r ? r.supplier : r.market}</td>
                        <td>
                          {"tenders" in r
                            ? "$" + (sales(r) / 100).toFixed(2)
                            : r.product + " / " + r.unit}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="form-help">
              {t(
                "First 8 rows shown. Every row has been validated; any conflict stops the entire batch.",
                "显示前 8 行；整批均已校验，任何冲突都会阻止整批导入。",
              )}
            </p>
            <button
              className="btn primary"
              disabled={busy || (mode === "actual" && !connected) || !count}
              onClick={async () => {
                if (await mutate("import", { data: preview })) setPreview(null);
              }}
            >
              {t("Confirm import", "确认导入")}
            </button>
          </div>
        )}
      </section>
      <div className="export-stack">
        <section className="card">
          <div className="card-head">
            <div>
              <div className="step-label">
                02 / {t("TAKE RECORDS WITH YOU", "导出与备份")}
              </div>
              <h2>{t("A copy you can keep.", "随时留存完整副本。")}</h2>
              <p>
                {t(
                  "These exports include the entire workspace. Use the register export buttons for filtered rows.",
                  "此处导出整个工作区；筛选后的记录可从台账导出。",
                )}
              </p>
            </div>
          </div>
          <div className="export-buttons">
            <button disabled={busy} onClick={() => exportFile()}>
              <FileSpreadsheet size={22} />
              <span>
                <b>{t("Excel workbook", "Excel 工作簿")}</b>
                <small>
                  {t(
                    "Summary, daily / monthly, market performance + all records",
                    "汇总、日月趋势、点位表现与全部记录",
                  )}
                </small>
              </span>
              <Download size={18} />
            </button>
            <button
              disabled={busy}
              onClick={() =>
                download(
                  new Blob(
                    [
                      JSON.stringify(
                        {
                          kind: "qinghe-operations-backup-v1",
                          provenance:
                            mode === "demo" ? "synthetic" : "recorded",
                          exported_at: new Date().toISOString(),
                          data: datasetSchema.parse({
                            sessions: state.sessions,
                            inventory: state.inventory,
                            quotes: state.quotes,
                          }),
                        },
                        null,
                        2,
                      ),
                    ],
                    { type: "application/json" },
                  ),
                  `market-operations-${mode}-${today()}.json`,
                )
              }
            >
              <Database size={22} />
              <span>
                <b>{t("Complete backup", "完整记录备份")}</b>
                <small>
                  {t(
                    "JSON · sessions, inventory and supplier quotes",
                    "JSON · 场次、库存与供应商报价",
                  )}
                </small>
              </span>
              <Download size={18} />
            </button>
            <button disabled={busy} onClick={() => exportFile(true)}>
              <NotebookPen size={22} />
              <span>
                <b>{t("Blank import template", "空白录入模板")}</b>
                <small>
                  {t(
                    "Three input sheets + field definitions",
                    "三类录入表与字段说明",
                  )}
                </small>
              </span>
              <Download size={18} />
            </button>
          </div>
          <div className="delimited-export">
            <h3>{t("CSV / TSV tables", "CSV / TSV 表格")}</h3>
            <label className="field">
              {t("Export record type", "导出记录类型")}
              <select
                aria-label="Export record type"
                value={outKind}
                onChange={(e) => setOutKind(e.target.value as RecordKind)}
              >
                {(["sessions", "inventory", "quotes"] as const).map((k) => (
                  <option key={k} value={k}>
                    {label(k)} ({state[k].length})
                  </option>
                ))}
              </select>
            </label>
            <div className="button-row">
              {(["csv", "tsv"] as const).map((ext) => (
                <button
                  key={ext}
                  className="btn secondary"
                  disabled={busy}
                  onClick={() =>
                    exportDelimited(state, outKind, mode === "demo", ext)
                  }
                >
                  <Download size={16} />
                  {ext.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </section>
        <section className="guide-card">
          <h3>{t("Keep the meaning of your records", "保留数据原意")}</h3>
          <p>
            {t(
              "SNAP, Market Bucks and WIC are already part of sales. Sales belong to the seller being tracked. These records are not a grant ledger or organization-wide profit statement.",
              "SNAP、Market Bucks 和 WIC 已包含于销售；销售归于所跟踪的销售主体。此台账不替代资助账或机构利润表。",
            )}
          </p>
          <p>
            {t(
              "Public-site records stay in this browser. They are not uploaded or synchronized between people or devices. Export before clearing browser data or moving devices. The local service version saves to this computer.",
              "公开站点的记录仅存此浏览器，不上传、不跨人员或设备同步。清理浏览器或换设备前请导出备份；本地服务版保存在本机。",
            )}
          </p>
          <p>
            {t(
              "For supplier comparisons, handling is per pack and delivery is per order. Procurement assumptions have their own save / restore file in Scenario lab.",
              "供应商报价的处理费按包计算，配送费按订单计算。采购假设可在情景测算单独保存与恢复。",
            )}
          </p>
        </section>
      </div>
    </div>
  );
}
