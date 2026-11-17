import { useState, useEffect, useRef } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { Plus, Download, Pencil, Trash2 } from "lucide-react";
import {
  type Dataset,
  type Quote,
  quoteSchema,
  centsFrom,
} from "../shared/domain.ts";
import {
  procure,
  quoteGroup,
  procurementSchema,
  procurementDefaults,
  type ProcurementInputs,
} from "../shared/analytics.ts";
import { today, download, delimited, exportDelimited, checkFile } from "./data";
type T = (a: string, b: string) => string;
const usd = (v: number | null) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(v);
const num = (v: number) =>
  v.toLocaleString("en-US", { maximumFractionDigits: 2 });
const inputStrings = (p: ProcurementInputs) =>
  Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)]));
export function Procurement({
  state,
  mode,
  t,
  busy,
  connected,
  mutate,
}: {
  state: Dataset;
  mode: string;
  t: T;
  busy: boolean;
  connected: boolean;
  mutate: (a: string, p: any) => Promise<boolean>;
}) {
  const [group, setGroup] = useState(""),
    [quoteId, setQuoteId] = useState(""),
    [edit, setEdit] = useState<Quote | null | undefined>(undefined),
    [remove, setRemove] = useState<Quote | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [values, setValues] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem("operations-procurement-" + mode);
      return inputStrings(
        saved
          ? procurementSchema.parse(JSON.parse(saved))
          : procurementDefaults,
      );
    } catch {
      return inputStrings(procurementDefaults);
    }
  });
  const valid = procurementSchema.safeParse(
    Object.fromEntries(
      Object.entries(values).map(([k, v]) => [
        k,
        v === "" ? undefined : Number(v),
      ]),
    ),
  );
  const groups = [...new Set(state.quotes.map(quoteGroup))],
    activeGroup = groups.includes(group) ? group : groups[0];
  const comparable = state.quotes
      .filter((q) => quoteGroup(q) === activeGroup)
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          a.supplier.localeCompare(b.supplier) ||
          a.pack_size - b.pack_size,
      ),
    q = comparable.find((q) => q.id === quoteId) ?? comparable[0];
  const results = comparable.map((quote) => {
    try {
      return {
        quote,
        result: valid.success ? procure(quote, valid.data) : null,
        error: "",
      };
    } catch (e: any) {
      return { quote, result: null, error: e.message };
    }
  });
  const current = results.find((r) => r.quote.id === q?.id),
    result = current?.result;
  const demands = valid.success
    ? [
        Math.max(0, valid.data.demand * (1 - valid.data.spread / 100)),
        valid.data.demand,
        valid.data.demand * (1 + valid.data.spread / 100),
      ]
    : [];
  const cases =
    q && valid.success && result
      ? demands.map((d, i) => ({
          name: [
            t("Low demand", "低需求"),
            t("Base demand", "基准需求"),
            t("High demand", "高需求"),
          ][i],
          demand: d,
          ...procure(q, valid.data, d),
        }))
      : [];
  const sensitivity =
    q && valid.success && result
      ? Array.from({ length: 9 }, (_, i) => {
          const target = Math.min(
            1_000_000,
            Math.max(0.01, valid.data.target * (0.4 + i * 0.15)),
          );
          try {
            const r = procure(q, { ...valid.data, target });
            return {
              target: Number(target.toFixed(2)),
              contribution: Number(r.contribution.toFixed(2)),
              surplus: Number(r.surplus.toFixed(2)),
              packs: r.packs,
            };
          } catch {
            return {
              target: Number(target.toFixed(2)),
              contribution: null,
              surplus: null,
              packs: null,
            };
          }
        })
      : [];
  const locked = busy || (mode === "actual" && !connected);
  function exportScenario() {
    if (!valid.success || !q) return;
    download(
      new Blob(
        [
          JSON.stringify(
            {
              kind: "qinghe-procurement-scenario-v1",
              provenance: mode === "demo" ? "synthetic" : "recorded",
              exported_at: new Date().toISOString(),
              quote: q,
              inputs: valid.data,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
      `procurement-${mode}-${today()}.json`,
    );
  }
  async function restore(f?: File) {
    if (!f) return;
    try {
      checkFile(f);
      const v = JSON.parse(await f.text());
      if (v.kind !== "qinghe-procurement-scenario-v1")
        throw new Error("Not a procurement scenario");
      if (mode === "actual" && v.provenance === "synthetic")
        throw new Error("Example scenarios belong in the example workspace");
      const p = procurementSchema.parse(v.inputs),
        quote = quoteSchema.parse(v.quote);
      if (
        !state.quotes.some(
          (q) =>
            q.id === quote.id && JSON.stringify(q) === JSON.stringify(quote),
        )
      )
        throw new Error(
          t(
            "Restore this quote from the records backup first. The scenario must match a saved quote.",
            "请先从记录备份恢复此报价，测算须对应已保存的同一报价。",
          ),
        );
      setGroup(quoteGroup(quote));
      setQuoteId(quote.id);
      setValues(inputStrings(p));
      setError("");
      setNotice(t("Scenario assumptions restored.", "测算假设已恢复。"));
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <>
      <div className="assumption-banner">
        <b>{t("Procure-and-resell planning", "采购转售测算")}</b>
        <span>
          {t(
            "Quotes are offers; all demand, price and yield inputs are assumptions. Results do not enter actual sales or inventory.",
            "报价为供应商要约；需求、售价和可用率均为假设。测算结果不写入实际销售与库存。",
          )}
        </span>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      <section className="card">
        <div className="card-head">
          <div>
            <h2>{t("Supplier quote register", "供应商报价台账")}</h2>
            <p>
              {t(
                "Use the same product, unit and specification. Keep the quote date and source; older quotes may no longer apply.",
                "同商品、同单位、同规格才可比较。保留报价日期及来源，旧报价需重新确认。",
              )}
            </p>
          </div>
          <div className="button-row">
            <button
              className="btn secondary"
              onClick={() => exportDelimited(state, "quotes", mode === "demo")}
            >
              <Download size={16} />
              {t("Quotes CSV", "报价 CSV")}
            </button>
            <button
              className="btn primary"
              disabled={locked}
              onClick={() => {
                setEdit(null);
                setError("");
              }}
            >
              <Plus size={16} />
              {t("Add quote", "新增报价")}
            </button>
          </div>
        </div>
        {!state.quotes.length ? (
          <div className="empty-state">
            <h3>
              {t("Add your first supplier quote", "添加第一条供应商报价")}
            </h3>
            <p>
              {t(
                "Import the Supplier quotes sheet or record an offer here. Actual records start empty.",
                "可导入 Supplier quotes 表，或在此录入。真实记录初始为空。",
              )}
            </p>
          </div>
        ) : (
          <>
            <label className="field comparison-select">
              {t(
                "Comparable product / unit / specification",
                "可比商品 / 单位 / 规格",
              )}
              <select
                aria-label="Quote comparison group"
                value={activeGroup}
                onChange={(e) => {
                  setGroup(e.target.value);
                  setQuoteId("");
                }}
              >
                {groups.map((g) => {
                  const r = state.quotes.find((q) => quoteGroup(q) === g)!;
                  return (
                    <option key={g} value={g}>
                      {r.product} / {r.unit} / {r.spec}
                    </option>
                  );
                })}
              </select>
            </label>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      t("Supplier / date", "供应商 / 日期"),
                      t("Pack", "包装"),
                      t("Price / pack", "每包价格"),
                      t("Minimum goods", "最低货值"),
                      t("Delivery / order", "每单配送"),
                      t("Handling / pack", "每包处理"),
                      t("Usable yield", "可用率"),
                      t("Lead days", "提前天数"),
                      t("Source", "来源"),
                      t("Actions", "操作"),
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparable.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <b>{r.supplier}</b>
                        <span>{r.date}</span>
                      </td>
                      <td>
                        {r.pack_size} {r.unit}
                      </td>
                      <td>{usd(r.pack_price / 100)}</td>
                      <td>{usd(r.minimum_order / 100)}</td>
                      <td>{usd(r.delivery / 100)}</td>
                      <td>{usd(r.handling / 100)}</td>
                      <td>{r.yield_pct}%</td>
                      <td>{r.lead_days}</td>
                      <td className="source-cell">{r.source_ref}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            aria-label={"Edit quote " + r.supplier}
                            disabled={locked}
                            onClick={() => setEdit(r)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            aria-label={"Delete quote " + r.supplier}
                            disabled={locked}
                            onClick={() => setRemove(r)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      {edit !== undefined && (
        <QuoteForm
          key={edit?.id ?? "new"}
          quote={edit}
          t={t}
          busy={locked}
          close={() => setEdit(undefined)}
          save={async (r) => {
            const ok = await mutate("records/quotes", { record: r });
            if (ok) {
              setEdit(undefined);
              setGroup(quoteGroup(r));
              setQuoteId(r.id);
            }
            return ok;
          }}
        />
      )}
      {remove && (
        <section className="card delete-quote">
          <p>
            {t("Delete quote from", "删除报价：")} {remove.supplier} ·{" "}
            {remove.date}?
          </p>
          <div className="button-row">
            <button
              className="btn secondary"
              disabled={locked}
              onClick={() => setRemove(null)}
            >
              {t("Keep quote", "保留报价")}
            </button>
            <button
              className="btn danger"
              disabled={locked}
              onClick={async () => {
                if (
                  await mutate(
                    "delete/quotes/" + encodeURIComponent(remove.id),
                    {},
                  )
                )
                  setRemove(null);
              }}
            >
              {t("Delete quote", "确认删除报价")}
            </button>
          </div>
        </section>
      )}
      <div className="procurement-grid">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>{t("Purchase assumptions", "采购假设")}</h2>
              <p>
                {t(
                  "Each comparison is a single-product order. Target usable stock determines order size; demand determines sell-through. Minimums apply to goods before fees.",
                  "每次比较按单商品订单测算。可用库存目标决定订货量，需求决定售出量；最低订单按费用前货值判断。",
                )}
              </p>
            </div>
          </div>
          <div className="form-grid">
            {(
              [
                [
                  "target",
                  "Target usable units",
                  "可用库存目标",
                  q?.unit ?? "units",
                ],
                ["demand", "Base demand", "基准需求", q?.unit ?? "units"],
                ["spread", "Demand range ±", "需求范围 ±", "%"],
                [
                  "price",
                  "Selling price",
                  "销售单价",
                  "USD / " + (q?.unit ?? "unit"),
                ],
                ["session_cost", "Other session costs", "其他场次成本", "USD"],
              ] as const
            ).map(([key, en, cn, unit]) => (
              <label className="field" key={key}>
                {t(en, cn)}
                <span className="input-unit">
                  <input
                    aria-label={en}
                    type="number"
                    min={key === "target" ? ".01" : "0"}
                    max={key === "spread" ? 100 : undefined}
                    step="any"
                    value={values[key]}
                    onChange={(e) =>
                      setValues({ ...values, [key]: e.target.value })
                    }
                  />
                  <small>{unit}</small>
                </span>
              </label>
            ))}
          </div>
          {!valid.success && (
            <p className="form-error" role="alert">
              {t(
                "Complete every assumption with a valid nonnegative number. Target must be positive; range is 0–100%.",
                "各假设须为有效非负数；库存目标须为正，需求范围为 0–100%。",
              )}
            </p>
          )}
          <div className="button-row">
            <button
              className="btn secondary"
              onClick={() => {
                setValues(inputStrings(procurementDefaults));
                setNotice("");
              }}
            >
              {t("Reset assumptions", "重置假设")}
            </button>
            <button
              className="btn secondary"
              disabled={!valid.success}
              onClick={() => {
                try {
                  localStorage.setItem(
                    "operations-procurement-" + mode,
                    JSON.stringify(valid.success ? valid.data : {}),
                  );
                  setNotice(
                    t(
                      "Inputs saved in this browser for this workspace.",
                      "输入已在此浏览器按工作区保存。",
                    ),
                  );
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            >
              {t("Remember inputs", "保存输入")}
            </button>
          </div>
          <p className="form-help">
            {t(
              "Zero resale value for surplus. Full order cost is charged to this purchase cycle. Other session costs exclude goods, delivery and per-pack handling already in the quote. No demand forecast is inferred.",
              "余货回收价值为零，整单成本计入本周期。其他场次成本不重复包含报价中的货值、配送及按包处理费。本工具不自动预测需求。",
            )}
          </p>
        </section>
        <section className="card">
          <div className="card-head">
            <div>
              <h2>{t("Delivered cost comparison", "采购到岸成本比较")}</h2>
              <p>
                {t(
                  "Whole packs, minimum orders and usable yield included.",
                  "已纳入整包、最低订单及可用率。",
                )}
              </p>
            </div>
          </div>
          {results.some((r) => r.result) ? (
            <>
              <div role="img" aria-label="Supplier delivered cost">
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart
                    data={results
                      .filter((r) => r.result)
                      .map(({ quote, result: r }) => ({
                        supplier:
                          quote.supplier +
                          " · " +
                          quote.date +
                          " · " +
                          quote.pack_size +
                          " " +
                          quote.unit,
                        goods: r!.goods,
                        handling: r!.handling,
                        delivery: r!.delivery,
                      }))}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="supplier"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) =>
                        v.length > 24 ? v.slice(0, 24) + "…" : v
                      }
                    />
                    <YAxis tickFormatter={(v) => "$" + v} width={60} />
                    <Tooltip formatter={(v: any) => usd(Number(v))} />
                    <Legend />
                    <Bar
                      isAnimationActive={false}
                      dataKey="goods"
                      name={t("Goods", "货值")}
                      stackId="a"
                      fill="#315c48"
                    />
                    <Bar
                      isAnimationActive={false}
                      dataKey="handling"
                      name={t("Handling", "处理费")}
                      stackId="a"
                      fill="#94b29d"
                    />
                    <Bar
                      isAnimationActive={false}
                      dataKey="delivery"
                      name={t("Delivery", "配送费")}
                      stackId="a"
                      fill="#db9c46"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {[
                        t("Use quote", "选择报价"),
                        t("Packs", "包数"),
                        t("Usable", "可用量"),
                        t("Over target", "超出目标"),
                        t("Delivered bill", "到岸总额"),
                        t("Cost / usable unit", "每可用单位成本"),
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(({ quote, result: r, error }) => (
                      <tr key={quote.id}>
                        <td>
                          <label className="radio-label">
                            <input
                              type="radio"
                              name="active-quote"
                              aria-label={
                                "Use " +
                                quote.supplier +
                                " " +
                                quote.date +
                                " " +
                                quote.pack_size +
                                " " +
                                quote.unit
                              }
                              checked={q?.id === quote.id}
                              onChange={() => setQuoteId(quote.id)}
                            />
                            <span>
                              {quote.supplier}
                              <small>
                                {quote.date} · {quote.pack_size} {quote.unit} /{" "}
                                {t("pack", "包")}
                              </small>
                            </span>
                          </label>
                        </td>
                        {r ? (
                          <>
                            <td>{r.packs}</td>
                            <td>
                              {num(r.usable)} {quote.unit}
                            </td>
                            <td>{num(r.excess)}</td>
                            <td>{usd(r.delivered)}</td>
                            <td>{usd(r.effective)}</td>
                          </>
                        ) : (
                          <td colSpan={5}>{error || "—"}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="empty-state">
              {t(
                "Add a valid quote and complete the assumptions to compare.",
                "添加有效报价并填写假设后可比较。",
              )}
              {current?.error}
            </p>
          )}
        </section>
      </div>
      {q && result && valid.success && (
        <>
          <section className="metrics procurement-metrics">
            {[
              [
                t("ORDER SIZE", "订货量"),
                result.packs + " " + t("packs", "包"),
                num(result.purchased) + " " + q.unit,
              ],
              [
                t("BASE CONTRIBUTION", "基准贡献"),
                usd(result.contribution),
                q.supplier,
              ],
              [
                t("UNSOLD USABLE STOCK", "可用余货"),
                num(result.surplus) + " " + q.unit,
                t("Base demand case", "基准需求情景"),
              ],
              [
                t("BREAK-EVEN PRICE", "保本售价"),
                usd(result.breakEven),
                "USD / " + q.unit,
              ],
            ].map(([label, value, detail]) => (
              <article className="metric" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <p>{detail}</p>
              </article>
            ))}
          </section>
          <section className="card">
            <div className="card-head">
              <div>
                <h2>
                  {t(
                    "Demand scenarios & purchase sensitivity",
                    "需求情景与采购敏感性",
                  )}
                </h2>
                <p>
                  {q.supplier} · {q.product} / {q.unit} / {q.spec} ·{" "}
                  {t("Lead time", "提前")} {q.lead_days}{" "}
                  {t(
                    "days; confirm availability with supplier",
                    "天；下单前确认供货",
                  )}
                </p>
              </div>
              <div className="button-row">
                <button className="btn secondary" onClick={exportScenario}>
                  <Download size={16} />
                  {t("Save scenario", "保存测算文件")}
                </button>
                <label className="btn secondary file-button">
                  {t("Restore scenario", "恢复测算")}
                  <input
                    aria-label="Restore procurement scenario"
                    type="file"
                    accept=".json"
                    onChange={(e) => {
                      void restore(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  className="btn secondary"
                  onClick={() =>
                    download(
                      new Blob(
                        [
                          delimited(
                            [
                              "case",
                              "supplier",
                              "quote_date",
                              "product",
                              "unit",
                              "spec",
                              "source_ref",
                              "target_usable",
                              "selling_price_usd",
                              "session_cost_usd",
                              "demand",
                              "packs",
                              "purchased",
                              "usable",
                              "loss",
                              "sold",
                              "surplus",
                              "unmet",
                              "goods_usd",
                              "delivery_usd",
                              "handling_usd",
                              "revenue_usd",
                              "total_cost_usd",
                              "contribution_usd",
                              "break_even_price_usd",
                            ],
                            cases.map((r) => [
                              r.name,
                              q.supplier,
                              q.date,
                              q.product,
                              q.unit,
                              q.spec,
                              q.source_ref,
                              valid.data.target,
                              valid.data.price,
                              valid.data.session_cost,
                              r.demand,
                              r.packs,
                              r.purchased,
                              r.usable,
                              r.loss,
                              r.sold,
                              r.surplus,
                              r.unmet,
                              r.goods,
                              r.delivery,
                              r.handling,
                              r.revenue,
                              r.total,
                              r.contribution,
                              r.breakEven,
                            ]),
                          ),
                        ],
                        { type: "text/csv;charset=utf-8" },
                      ),
                      `procurement-results-${mode}-${today()}.csv`,
                    )
                  }
                >
                  <Download size={16} />
                  {t("Results CSV", "结果 CSV")}
                </button>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      t("Demand case", "需求情景"),
                      t("Demand", "需求量"),
                      t("Sold", "售出"),
                      t("Surplus", "余货"),
                      t("Unmet", "未满足"),
                      t("Revenue", "销售额"),
                      t("Full cost", "全部成本"),
                      t("Contribution", "贡献"),
                      t("Break-even price", "保本价"),
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cases.map((r) => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td>{num(r.demand)}</td>
                      <td>{num(r.sold)}</td>
                      <td>{num(r.surplus)}</td>
                      <td>{num(r.unmet)}</td>
                      <td>{usd(r.revenue)}</td>
                      <td>{usd(r.total)}</td>
                      <td className={r.contribution < 0 ? "negative" : ""}>
                        {usd(r.contribution)}
                      </td>
                      <td>{usd(r.breakEven)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="insight-grid">
              <div role="img" aria-label="Demand scenario quantities">
                <ResponsiveContainer width="100%" height={265}>
                  <BarChart data={cases}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip
                      formatter={(v: any) => num(Number(v)) + " " + q.unit}
                    />
                    <Legend />
                    <Bar
                      isAnimationActive={false}
                      dataKey="sold"
                      name={t("Sold", "售出")}
                      fill="#315c48"
                    />
                    <Bar
                      isAnimationActive={false}
                      dataKey="surplus"
                      name={t("Surplus", "余货")}
                      fill="#db9c46"
                    />
                    <Bar
                      isAnimationActive={false}
                      dataKey="unmet"
                      name={t("Unmet", "未满足")}
                      fill="#9f7770"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div
                role="img"
                aria-label="Purchase target contribution sensitivity"
              >
                <ResponsiveContainer width="100%" height={265}>
                  <LineChart
                    data={sensitivity}
                    margin={{ right: 15, bottom: 20, top: 10 }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="target"
                      height={48}
                      label={{
                        value: t("Target usable units", "可用库存目标"),
                        position: "insideBottom",
                        offset: 0,
                      }}
                    />
                    <YAxis tickFormatter={(v) => "$" + v} width={65} />
                    <Tooltip
                      formatter={(v: any) => usd(Number(v))}
                      labelFormatter={(v) =>
                        t("Target: ", "库存目标：") + v + " " + q.unit
                      }
                    />
                    <ReferenceLine y={0} stroke="#9f7770" />
                    <Line
                      dataKey="contribution"
                      name={t("Base contribution", "基准贡献")}
                      stroke="#315c48"
                      strokeWidth={2.5}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <p className="form-help">
              {t(
                "Sensitivity holds base demand and selling price fixed, recomputing whole-pack orders at each target. Minimums can produce the same order for several targets. It is a comparison, not an optimized or forecast quantity.",
                "敏感性保持基准需求及售价不变，在每个库存目标重新计算整包订单。最低订单可能使多个目标对应相同包数；这是情景比较，不是预测或最优订货量。",
              )}
            </p>
          </section>
        </>
      )}
    </>
  );
}
function QuoteForm({
  quote,
  t,
  busy,
  close,
  save,
}: {
  quote: Quote | null;
  t: T;
  busy: boolean;
  close: () => void;
  save: (q: Quote) => Promise<boolean>;
}) {
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);
  const fields = [
    ["date", "Quote date", "报价日期", "date"],
    ["supplier", "Supplier", "供应商", "text"],
    ["product", "Product", "商品", "text"],
    ["unit", "Unit", "单位", "text"],
    ["spec", "Specification / grade", "规格 / 等级", "text"],
    ["pack_size", "Raw units per pack", "每包原始数量", "number"],
    ["pack_price", "Pack price (USD)", "每包价格（美元）", "money"],
    ["minimum_order", "Minimum goods order (USD)", "最低货值（美元）", "money"],
    ["delivery", "Delivery per order (USD)", "每单配送费（美元）", "money"],
    ["handling", "Handling per pack (USD)", "每包处理费（美元）", "money"],
    ["yield_pct", "Usable yield (%)", "可用率（%）", "number"],
    ["lead_days", "Lead days", "提前天数", "number"],
    ["source_ref", "Quote source", "报价来源", "text"],
  ] as const;
  return (
    <section className="card quote-editor">
      <div className="card-head">
        <h2>
          {quote
            ? t("Edit supplier quote", "编辑供应商报价")
            : t("New supplier quote", "新增供应商报价")}
        </h2>
      </div>
      <form
        ref={formRef}
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            const f = new FormData(e.currentTarget),
              r: any = {
                id: quote?.id ?? crypto.randomUUID(),
                notes: String(f.get("notes") ?? ""),
              };
            for (const [key, , , type] of fields) {
              const v = String(f.get(key) ?? "");
              r[key] =
                type === "money"
                  ? centsFrom(v)
                  : type === "number"
                    ? v === ""
                      ? undefined
                      : Number(v)
                    : v;
            }
            const parsed = quoteSchema.parse(r);
            if (parsed.pack_price === 0 && parsed.minimum_order > 0)
              throw new Error(
                t(
                  "Zero-price goods cannot meet a positive order minimum.",
                  "零价格商品无法满足正数最低货值。",
                ),
              );
            await save(parsed);
          } catch (e: any) {
            setError(
              e.issues
                ?.map((i: any) => i.path.join(".") + ": " + i.message)
                .join("; ") ?? e.message,
            );
          }
        }}
      >
        <fieldset disabled={busy}>
          <div className="form-grid">
            {fields.map(([key, en, cn, type]) => (
              <label className="field" key={key}>
                {t(en, cn)}
                <input
                  aria-label={en}
                  name={key}
                  required
                  type={type === "money" ? "number" : type}
                  min={
                    type === "money" || type === "number"
                      ? key === "pack_size" || key === "yield_pct"
                        ? ".00001"
                        : "0"
                      : undefined
                  }
                  max={key === "yield_pct" ? 100 : undefined}
                  step={
                    type === "money" ? ".01" : key === "lead_days" ? "1" : "any"
                  }
                  defaultValue={
                    quote
                      ? type === "money"
                        ? Number(quote[key]) / 100
                        : String(quote[key])
                      : key === "date"
                        ? today()
                        : ""
                  }
                />
              </label>
            ))}
          </div>
          <label className="field">
            {t("Notes", "备注")}
            <textarea
              name="notes"
              defaultValue={quote?.notes ?? ""}
              maxLength={2000}
            />
          </label>
          <p className="form-help">
            {t(
              "Use the exact same unit and specification for comparable offers. Minimum excludes fees. Confirm 0 for waived fees; never substitute blank for a known zero.",
              "可比报价请填写完全一致的单位与规格。最低订单不含费用，免收费用须明确填 0。",
            )}
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="button-row">
            <button type="button" className="btn secondary" onClick={close}>
              {t("Cancel", "取消")}
            </button>
            <button className="btn primary" type="submit">
              {t("Save quote", "保存报价")}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
