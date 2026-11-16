import React, { useState, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Leaf,
  LayoutDashboard,
  NotebookPen,
  PackageOpen,
  ArrowLeftRight,
  ChartNoAxesCombined,
  Plus,
  Download,
  ArrowUpRight,
  ArrowRight,
  Check,
  ChevronDown,
  Info,
  Upload,
  FileSpreadsheet,
  X,
  Trash2,
  Pencil,
  Menu,
  Database,
  CheckCircle2,
} from "lucide-react";
import {
  type Dataset,
  type Session,
  type Inventory,
  tenderKeys,
  costKeys,
  summary,
  sales,
  totalCosts,
  grouped,
  crossSubsidy,
  sessionSchema,
  inventorySchema,
  datasetSchema,
  mergeRecords,
  recordKey,
  centsFrom,
} from "../shared/domain.ts";
import {
  today,
  exampleData,
  readWorkbook,
  sessionColumns,
  inventoryColumns,
  guessMapping,
  prepareImport,
  download,
  exportWorkbook,
  type RawTable,
} from "./data";
import "./style.css";
const colors = [
  "#214d40",
  "#94b29d",
  "#db9c46",
  "#9f7770",
  "#a5a6c3",
  "#d4d7d0",
];
type Page = "overview" | "sessions" | "inventory" | "exchange" | "planning";
type State = Dataset & { revision: number };
const money = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(n / 100);
const amount = (n: number) => money(n * 100);
const empty: State = { sessions: [], inventory: [], revision: 0 };
function App() {
  const [zh, setZh] = useState(
    localStorage.getItem("operations-language") === "zh",
  );
  const t = (en: string, cn: string) => (zh ? cn : en);
  const [page, setPage] = useState<Page>("overview");
  const [mode, setMode] = useState<"demo" | "actual">("demo");
  const [demo, setDemo] = useState<State>(() => {
    try {
      const saved = localStorage.getItem("operations-demo-v1");
      return {
        ...(saved ? datasetSchema.parse(JSON.parse(saved)) : exampleData()),
        revision: 0,
      };
    } catch {
      return { ...exampleData(), revision: 0 };
    }
  });
  const [actual, setActual] = useState<State>(empty);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [market, setMarket] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  const [editor, setEditor] = useState<{
    kind: "sessions" | "inventory";
    record?: Session | Inventory;
  } | null>(null);
  const [remove, setRemove] = useState<{
    kind: "sessions" | "inventory";
    id: string;
  } | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const state = mode === "demo" ? demo : actual;
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/state");
      if (!r.ok) throw new Error();
      const data = await r.json();
      datasetSchema.parse({
        sessions: data.sessions,
        inventory: data.inventory,
      });
      setActual(data);
      setConnected(true);
    } catch {
      setConnected(false);
      setError(
        t(
          "Cannot reach the local records service. Start the app with npm run dev or npm start, then retry.",
          "无法连接本地记录服务。启动完整应用后重试。",
        ),
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (mode === "actual") void refresh();
  }, [mode]);
  useEffect(() => {
    localStorage.setItem("operations-language", zh ? "zh" : "en");
    document.documentElement.lang = zh ? "zh-CN" : "en";
  }, [zh]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!busy) {
          setEditor(null);
          setRemove(null);
        }
        setNavOpen(false);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [busy]);
  async function mutate(action: string, payload: any) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "demo") {
        let next: Dataset = {
          sessions: [...demo.sessions],
          inventory: [...demo.inventory],
        };
        let added: number | undefined;
        if (action === "import") {
          const merged = mergeRecords(next, payload.data);
          next = merged.data;
          added = merged.added;
        } else if (action.startsWith("delete/")) {
          const [, kind, id] = action.split("/");
          (next as any)[kind] = (next as any)[kind].filter(
            (r: any) => r.id !== id,
          );
        } else {
          const kind = action.split("/")[1] as "sessions" | "inventory";
          const row = payload.record;
          const list = next[kind] as (Session | Inventory)[];
          if (
            list.some((r) => r.id !== row.id && recordKey(r) === recordKey(row))
          )
            throw new Error(
              t(
                "A record already exists for that date, market and session.",
                "此日期、点位及场次的记录已存在。",
              ),
            );
          const i = list.findIndex((r) => r.id === row.id);
          if (i >= 0) list[i] = row;
          else list.push(row);
        }
        datasetSchema.parse(next);
        localStorage.setItem("operations-demo-v1", JSON.stringify(next));
        setDemo({ ...next, revision: demo.revision + 1 });
        setNotice(
          added === undefined
            ? t("Saved in example workspace.", "已保存到演示区。")
            : t(
                `${added} records imported into example workspace.`,
                `${added} 条记录已导入演示区。`,
              ),
        );
      } else {
        if (!connected)
          throw new Error(
            t(
              "Connect to the local records service first.",
              "请先连接本地记录服务。",
            ),
          );
        const res = await fetch("/api/" + action, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, revision: actual.revision }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Unable to save");
        setActual(data);
        setNotice(
          data.added === undefined
            ? t("Saved to the local database.", "已保存到本地数据库。")
            : t(
                `${data.added} added · ${data.skipped} duplicates skipped.`,
                `${data.added} 条新增，跳过 ${data.skipped} 条重复记录。`,
              ),
        );
      }
      setEditor(null);
      setRemove(null);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function switchMode(next: "demo" | "actual") {
    if (next === "actual") {
      setLoading(true);
      setConnected(false);
    }
    setMode(next);
    setMarket("");
    setFrom("");
    setTo("");
    setNotice("");
    setError("");
    setEditor(null);
  }
  const sites = [
    ...new Set(
      state.sessions
        .map((s) => s.market)
        .concat(state.inventory.map((s) => s.market)),
    ),
  ].sort();
  const selected = (s: { date: string; market: string }) =>
    (!market || s.market === market) &&
    (!from || s.date >= from) &&
    (!to || s.date <= to);
  const rows = useMemo(
    () => state.sessions.filter(selected),
    [state, market, from, to],
  );
  const inventory = state.inventory.filter(selected);
  const stats = summary(rows);
  const chart = grouped(rows, period);
  const tenders = tenderKeys.map((k, i) => ({
    name: {
      cash: t("Cash", "现金"),
      credit: t("Credit / debit", "银行卡"),
      snap: "SNAP / EBT",
      market_bucks: "Market Bucks",
      wic: "WIC / FMNP",
      other: t("Other", "其他"),
    }[k],
    value: stats.held.reduce((n, s) => n + s.tenders[k], 0) / 100,
    color: colors[i],
    key: k,
  }));
  const nav = [
    { id: "overview", icon: LayoutDashboard, en: "Overview", cn: "运营概览" },
    { id: "sessions", icon: NotebookPen, en: "Market log", cn: "场次记录" },
    { id: "inventory", icon: PackageOpen, en: "Inventory", cn: "库存与损耗" },
    {
      id: "exchange",
      icon: ArrowLeftRight,
      en: "Import & export",
      cn: "导入与导出",
    },
    {
      id: "planning",
      icon: ChartNoAxesCombined,
      en: "Scenario lab",
      cn: "情景测算",
    },
  ] as const;
  const filtersActive = !!(market || from || to);
  async function exportFile(template = false) {
    setBusy(true);
    setError("");
    try {
      await exportWorkbook(state, mode === "demo", template);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (navOpen ? "nav-open" : "")}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("overview");
          }}
        >
          <span className="brand-symbol">
            <Leaf size={27} />
          </span>
          <span>
            qinghe<span className="brand-sub">MARKET OPERATIONS</span>
          </span>
        </a>
        <div className="workspace-label">{t("WORKSPACE", "工作空间")}</div>
        <nav>
          {nav.map(({ id, icon: Icon, en, cn }, i) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => {
                setPage(id);
                setNavOpen(false);
              }}
            >
              <Icon size={19} />
              <span>{t(en, cn)}</span>
              {i === 0 && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="tiny-leaf">
            <Leaf size={20} />
          </span>
          <h3>
            {t("Good records. Better decisions.", "记录清楚，决策有据。")}
          </h3>
          <p>
            {t(
              "A shared language for sales, food access and market-day operations.",
              "用统一口径，理解销售、食物可及性与每场运营。",
            )}
          </p>
          <button onClick={() => setPage("exchange")}>
            {t("Start with your spreadsheet", "从已有表格开始")}{" "}
            <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="sidebar-footer">
          <span className="avatar">RC</span>
          <div>
            Rutgers Community
            <span>{t("Internal operations", "内部运营工具")}</span>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <button
            className="mobile-menu icon-btn"
            aria-label="Open navigation"
            onClick={() => setNavOpen(!navOpen)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            {t("Workspace", "工作空间")} <span>/</span>{" "}
            <b>
              {t(
                nav.find((n) => n.id === page)!.en,
                nav.find((n) => n.id === page)!.cn,
              )}
            </b>
          </div>
          <div className="top-actions">
            <span className="internal-pill">
              <span /> {t("Internal tool", "内部工具")}
            </span>
            <button className="language" onClick={() => setZh(!zh)}>
              {zh ? "EN" : "中文"}
            </button>
            <span className="top-avatar">L</span>
          </div>
        </header>
        <div className="page-content">
          <div className="mode-banner">
            <div>
              <span
                className={"status-dot " + (mode === "actual" ? "actual" : "")}
              />
              <b>
                {mode === "demo"
                  ? t("Example workspace", "演示工作区")
                  : t("Recorded data", "真实记录")}
              </b>
              <span>
                {mode === "demo"
                  ? t(
                      "Synthetic figures · separate from your records",
                      "合成示例，与真实记录分开保存",
                    )
                  : connected
                    ? t(
                        "Saved on this computer · no customer details",
                        "保存在本机，不收集顾客个人信息",
                      )
                    : t(
                        "Local service connection required",
                        "需要连接本地服务",
                      )}
              </span>
            </div>
            <div className="segmented">
              <button
                disabled={busy}
                className={mode === "demo" ? "selected" : ""}
                onClick={() => switchMode("demo")}
              >
                {t("Example", "演示")}
              </button>
              <button
                disabled={busy}
                className={mode === "actual" ? "selected" : ""}
                onClick={() => switchMode("actual")}
              >
                {t("My records", "真实记录")}
              </button>
            </div>
          </div>
          <div className="page-title">
            <div>
              <div className="eyebrow">
                {t("COMMUNITY MARKET · OPERATIONS", "社区市集 · 运营管理")}
              </div>
              <h1>
                {page === "overview"
                  ? t("Market overview", "市集运营概览")
                  : page === "sessions"
                    ? t(
                        "Every market day, recorded.",
                        "把每一场市集，记录清楚。",
                      )
                    : page === "inventory"
                      ? t("A place for every pound.", "让每一份库存都有去向。")
                      : page === "exchange"
                        ? t(
                            "Your spreadsheet, connected.",
                            "从熟悉的表格开始。",
                          )
                        : t("Plan the next decision.", "为下一步决策做测算。")}
              </h1>
              <p>
                {page === "overview"
                  ? t(
                      "See what came in, who it supported, and what to follow up.",
                      "看清销售、支付构成，以及需要跟进的运营问题。",
                    )
                  : page === "sessions"
                    ? t(
                        "One record per date, market and session. All amounts in USD.",
                        "每个日期、点位、场次一条记录。金额单位：美元。",
                      )
                    : page === "inventory"
                      ? t(
                          "Track sales, donations, waste and transfers in consistent product units.",
                          "按一致商品单位，追踪售出、捐赠、损耗和调拨。",
                        )
                      : page === "exchange"
                        ? t(
                            "Bring in existing records. Keep a complete, portable copy.",
                            "导入已有记录，也随时带走完整、可复用的副本。",
                          )
                        : t(
                            "Test assumptions before using them to make a commitment.",
                            "把假设写明白，再观察它们如何影响结果。",
                          )}
              </p>
            </div>
            <div className="title-actions">
              {page === "overview" && (
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => exportFile()}
                >
                  <Download size={16} />
                  {t("Export workbook", "导出工作簿")}
                </button>
              )}
              {["overview", "sessions", "inventory"].includes(page) && (
                <button
                  className="btn primary"
                  disabled={busy || (mode === "actual" && !connected)}
                  onClick={() =>
                    setEditor({
                      kind: page === "inventory" ? "inventory" : "sessions",
                    })
                  }
                >
                  <Plus size={17} />
                  {page === "inventory"
                    ? t("Add inventory", "录入库存")
                    : t("Log market day", "录入场次")}
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
              {mode === "actual" && (
                <button onClick={() => refresh()}>
                  {t("Refresh records", "刷新记录")}
                </button>
              )}
              <button
                className="icon-btn"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              <CheckCircle2 size={17} />
              {notice}
              <button
                className="icon-btn"
                aria-label="Dismiss notice"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {loading ? (
            <div className="empty-state">
              {t("Loading records…", "正在读取记录…")}
            </div>
          ) : (
            <>
              {["overview", "sessions", "inventory"].includes(page) && (
                <div className="filter-bar">
                  <div>
                    <span className="filter-label">{t("VIEW", "筛选")}</span>
                    <label className="sr-only" htmlFor="market-filter">
                      Market
                    </label>
                    <select
                      id="market-filter"
                      value={market}
                      onChange={(e) => setMarket(e.target.value)}
                    >
                      <option value="">
                        {t("All market stops", "所有点位")}
                      </option>
                      {sites.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="date-range">
                    <label>
                      {t("From", "起始")}
                      <input
                        aria-label="From date"
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                      />
                    </label>
                    <span>→</span>
                    <label>
                      {t("To", "结束")}
                      <input
                        aria-label="To date"
                        type="date"
                        value={to}
                        min={from}
                        onChange={(e) => setTo(e.target.value)}
                      />
                    </label>
                  </div>
                  <span className="filter-count">
                    {page === "inventory" ? inventory.length : rows.length}{" "}
                    {t("records", "条记录")}
                  </span>
                  {filtersActive && (
                    <button
                      className="text-btn"
                      onClick={() => {
                        setMarket("");
                        setFrom("");
                        setTo("");
                      }}
                    >
                      {t("Clear", "清除")}
                    </button>
                  )}
                </div>
              )}
              {from && to && from > to ? (
                <div className="alert error">
                  {t(
                    "The start date must be on or before the end date.",
                    "起始日期不能晚于结束日期。",
                  )}
                </div>
              ) : page === "overview" ? (
                <>
                  <section className="metrics">
                    <Metric
                      label={t("TOTAL SALES", "销售总额")}
                      value={money(stats.total)}
                      detail={`${stats.held.length} ${t("held sessions", "个已开市场次")} · USD`}
                      accent
                    />
                    <Metric
                      label={t("AVERAGE PER DAY", "平均每日销售")}
                      value={money(stats.averageDay)}
                      detail={`${stats.days} ${t("distinct market dates", "个不同开市日期")}`}
                    />
                    <Metric
                      label={t("BEST SALES DAY", "最佳销售日")}
                      value={money(stats.bestDay?.[1])}
                      detail={
                        stats.bestDay?.[0] ??
                        t("No held market days", "暂无已开市场次")
                      }
                    />
                    <Metric
                      label={t("ASSISTANCE SHARE", "援助支付占比")}
                      value={
                        stats.share === null
                          ? "—"
                          : (stats.share * 100).toFixed(1) + "%"
                      }
                      detail="SNAP + Market Bucks + WIC"
                    />
                  </section>
                  {!stats.held.length ? (
                    <Empty
                      title={t(
                        "Your first market day starts here.",
                        "从第一条场次记录开始。",
                      )}
                      detail={t(
                        "Log a market day or import your existing spreadsheet. Missing records are never filled with example results.",
                        "录入一场市集，或导入已有表格。没有记录时保持空白。",
                      )}
                      action={() => setPage("exchange")}
                      label={t("Import records", "导入记录")}
                    />
                  ) : (
                    <>
                      <div className="chart-row">
                        <section className="card revenue-chart">
                          <div className="card-head">
                            <div>
                              <h2>{t("Sales over time", "销售趋势")}</h2>
                              <p>
                                {t(
                                  "Net recorded sales · USD",
                                  "记录的净销售额 · 美元",
                                )}
                              </p>
                            </div>
                            <div className="segmented">
                              {(["day", "week", "month"] as const).map(
                                (p, i) => (
                                  <button
                                    key={p}
                                    className={period === p ? "selected" : ""}
                                    onClick={() => setPeriod(p)}
                                  >
                                    {t(
                                      ["Day", "Week", "Month"][i],
                                      ["日", "周", "月"][i],
                                    )}
                                  </button>
                                ),
                              )}
                            </div>
                          </div>
                          <div
                            className="chart-wrap"
                            role="img"
                            aria-label="Sales over time, US dollars"
                          >
                            <ResponsiveContainer width="100%" height={245}>
                              <AreaChart
                                data={chart}
                                margin={{
                                  top: 15,
                                  right: 12,
                                  bottom: 0,
                                  left: 0,
                                }}
                              >
                                <defs>
                                  <linearGradient
                                    id="salesFill"
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                  >
                                    <stop
                                      offset="0%"
                                      stopColor="#527b63"
                                      stopOpacity={0.22}
                                    />
                                    <stop
                                      offset="100%"
                                      stopColor="#527b63"
                                      stopOpacity={0.01}
                                    />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid
                                  vertical={false}
                                  stroke="#e9ece6"
                                />
                                <XAxis
                                  dataKey="date"
                                  tickFormatter={(v) => String(v).slice(5)}
                                  tickLine={false}
                                  axisLine={false}
                                  minTickGap={30}
                                />
                                <YAxis
                                  tickFormatter={(v) => "$" + v}
                                  tickLine={false}
                                  axisLine={false}
                                  width={53}
                                />
                                <Tooltip
                                  formatter={(v: any) => [
                                    amount(Number(v)),
                                    t("Sales", "销售额"),
                                  ]}
                                  labelFormatter={(v) =>
                                    period === "week"
                                      ? t(`Week of ${v}`, `${v} 起的一周`)
                                      : v
                                  }
                                />
                                <Area
                                  type="linear"
                                  dataKey="total"
                                  stroke="#315c48"
                                  strokeWidth={2.5}
                                  fill="url(#salesFill)"
                                  isAnimationActive={false}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="chart-foot">
                            <span
                              className="legend-dot"
                              style={{ background: "#315c48" }}
                            />
                            {t(
                              "Recorded sales only. Missing days are omitted. Weeks begin Monday.",
                              "仅含已有记录；缺失日期不填零；周一为每周起点。",
                            )}
                            <details>
                              <summary>
                                {t("View chart data", "查看图表数据")}
                              </summary>
                              <table>
                                <thead>
                                  <tr>
                                    <th>{t("Period", "时期")}</th>
                                    <th>USD</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {chart.map((r) => (
                                    <tr key={r.date}>
                                      <td>{r.date}</td>
                                      <td>{amount(r.total)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </details>
                          </div>
                        </section>
                        <section className="card payment-chart">
                          <div className="card-head">
                            <div>
                              <h2>{t("How people paid", "支付构成")}</h2>
                              <p>
                                {t(
                                  "Share of recorded sales · USD",
                                  "各支付方式占销售额 · 美元",
                                )}
                              </p>
                            </div>
                            <span className="subtle-icon">
                              <ArrowLeftRight size={18} />
                            </span>
                          </div>
                          <div className="donut-wrap">
                            <ResponsiveContainer width="100%" height={192}>
                              <PieChart>
                                <Pie
                                  data={tenders.filter((x) => x.value > 0)}
                                  dataKey="value"
                                  innerRadius={65}
                                  outerRadius={83}
                                  paddingAngle={2}
                                  stroke="none"
                                  isAnimationActive={false}
                                >
                                  {tenders
                                    .filter((x) => x.value > 0)
                                    .map((x) => (
                                      <Cell key={x.key} fill={x.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                  formatter={(v: any) => amount(Number(v))}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="donut-center">
                              <span>{t("Total sales", "销售总额")}</span>
                              <b>{money(stats.total)}</b>
                            </div>
                          </div>
                          <div className="payment-legend">
                            {tenders.map((x) => (
                              <div key={x.key}>
                                <span>
                                  <i style={{ background: x.color }} />
                                  {x.name}
                                </span>
                                <b>
                                  {stats.total
                                    ? ((x.value * 10000) / stats.total).toFixed(
                                        1,
                                      )
                                    : "0.0"}
                                  %
                                </b>
                              </div>
                            ))}
                          </div>
                        </section>
                      </div>
                      <div className="secondary-row">
                        <section className="card">
                          <div className="card-head">
                            <div>
                              <h2>
                                {t("Monthly payment mix", "月度支付构成")}
                              </h2>
                              <p>
                                {t(
                                  "Actual tender amounts · USD",
                                  "各支付方式的记录金额 · 美元",
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="chart-wrap">
                            <ResponsiveContainer width="100%" height={225}>
                              <BarChart
                                data={grouped(rows, "month")}
                                margin={{ left: 0, right: 12, top: 10 }}
                              >
                                <CartesianGrid
                                  vertical={false}
                                  stroke="#e9ece6"
                                />
                                <XAxis
                                  dataKey="date"
                                  axisLine={false}
                                  tickLine={false}
                                />
                                <YAxis
                                  width={60}
                                  tickFormatter={(v) => "$" + v}
                                  axisLine={false}
                                  tickLine={false}
                                />
                                <Tooltip
                                  formatter={(v: any, n: any) => [
                                    amount(Number(v)),
                                    tenders.find((x) => x.key === n)?.name ?? n,
                                  ]}
                                />
                                {tenderKeys.map((k, i) => (
                                  <Bar
                                    key={k}
                                    dataKey={k}
                                    stackId="sales"
                                    fill={colors[i]}
                                    maxBarSize={50}
                                    isAnimationActive={false}
                                  />
                                ))}
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </section>
                        <section className="card top-days">
                          <div className="card-head">
                            <div>
                              <h2>{t("Top market days", "销售最高的日期")}</h2>
                              <p>
                                {t(
                                  "Across the current selection · USD",
                                  "当前筛选内按每日合计排序 · 美元",
                                )}
                              </p>
                            </div>
                          </div>
                          {grouped(rows, "day")
                            .sort((a, b) => b.total - a.total)
                            .slice(0, 5)
                            .map((r, i) => (
                              <div className="ranking" key={r.date}>
                                <span className="rank-number">0{i + 1}</span>
                                <div>
                                  <b>{r.date}</b>
                                  <span>
                                    {
                                      rows.filter(
                                        (s) =>
                                          s.date === r.date &&
                                          s.status === "held",
                                      ).length
                                    }{" "}
                                    {t("sessions", "场")}
                                  </span>
                                </div>
                                <strong>{amount(r.total)}</strong>
                              </div>
                            ))}
                        </section>
                      </div>
                      <section className="follow-up">
                        <div className="follow-icon">
                          <Info size={21} />
                        </div>
                        <div>
                          <h3>
                            {t(
                              "Keep an eye on the gaps.",
                              "也看看记录中的空白。",
                            )}
                          </h3>
                          <p>
                            {rows.filter((s) => totalCosts(s) === null).length}{" "}
                            {t(
                              "sessions have incomplete costs. Complete them before interpreting contribution or funding needs. Payment assistance is already included in sales.",
                              "个场次成本未填全，补齐后才能解释场次贡献或资金缺口。援助支付已计入销售额。",
                            )}
                          </p>
                        </div>
                        <button onClick={() => setPage("sessions")}>
                          {t("Review records", "检查记录")}
                          <ArrowRight size={17} />
                        </button>
                      </section>
                    </>
                  )}
                </>
              ) : page === "sessions" ? (
                <section className="card records-card">
                  <div className="card-head">
                    <div>
                      <h2>{t("Market-day register", "场次台账")}</h2>
                      <p>
                        {t(
                          "Revenue belongs to the seller recorded here. These are session contributions, not organization-wide profit.",
                          "按实际销售主体登记；此处是场次贡献，不是机构整体利润。",
                        )}
                      </p>
                    </div>
                  </div>
                  {rows.length ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            {[
                              t("Date / market", "日期 / 点位"),
                              t("Sales", "销售额"),
                              "SNAP",
                              t("Transactions", "交易笔数"),
                              t("Recorded costs", "成本合计"),
                              t("Contribution", "场次贡献"),
                              t("Source", "来源"),
                              t("Actions", "操作"),
                            ].map((h) => (
                              <th key={h}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...rows]
                            .sort((a, b) => b.date.localeCompare(a.date))
                            .map((s) => (
                              <tr key={s.id}>
                                <td>
                                  <b>{s.date}</b>
                                  <span>{s.market}</span>
                                  <small>
                                    {s.session} · {s.format} · {s.status}
                                  </small>
                                </td>
                                <td>{money(sales(s))}</td>
                                <td>{money(s.tenders.snap)}</td>
                                <td>{s.transactions ?? "—"}</td>
                                <td>{money(totalCosts(s))}</td>
                                <td
                                  className={
                                    totalCosts(s) !== null &&
                                    sales(s) - totalCosts(s)! < 0
                                      ? "negative"
                                      : ""
                                  }
                                >
                                  {totalCosts(s) === null
                                    ? t("Unknown", "未知")
                                    : money(sales(s) - totalCosts(s)!)}
                                </td>
                                <td className="source-cell">{s.source_ref}</td>
                                <td>
                                  <div className="row-actions">
                                    <button
                                      aria-label={`Edit ${s.date} ${s.market}`}
                                      onClick={() =>
                                        setEditor({
                                          kind: "sessions",
                                          record: s,
                                        })
                                      }
                                    >
                                      <Pencil size={15} />
                                    </button>
                                    <button
                                      aria-label={`Delete ${s.date} ${s.market}`}
                                      onClick={() =>
                                        setRemove({
                                          kind: "sessions",
                                          id: s.id,
                                        })
                                      }
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
                  ) : (
                    <Empty
                      title={t("No market days yet.", "暂无场次记录。")}
                      detail={t(
                        "Add a record or adjust your filters.",
                        "请新增记录，或调整筛选。",
                      )}
                    />
                  )}
                </section>
              ) : page === "inventory" ? (
                <>
                  <div className="inventory-note">
                    <PackageOpen size={20} />
                    <p>
                      {t(
                        "Opening + received = sold + donated + spoiled + transferred out + closing. Keep each product and unit separate; unlike units are never totaled.",
                        "期初 + 入库 = 售出 + 捐赠 + 损耗 + 调出 + 期末。不同商品和单位分别登记，不混加数量。",
                      )}
                    </p>
                  </div>
                  <section className="card records-card">
                    <div className="card-head">
                      <div>
                        <h2>{t("Stock movement register", "库存流水")}</h2>
                        <p>
                          {t(
                            "Transferred quantities are outbound. Record the receiving stop under received.",
                            "调拨数量为调出，接收点位在入库字段登记。",
                          )}
                        </p>
                      </div>
                    </div>
                    {inventory.length ? (
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              {[
                                t("Date / market", "日期 / 点位"),
                                t("Product / unit", "商品 / 单位"),
                                t("Opening", "期初"),
                                t("Received", "入库"),
                                t("Sold", "售出"),
                                t("Donated", "捐赠"),
                                t("Spoiled", "损耗"),
                                t("Transferred", "调出"),
                                t("Closing", "期末"),
                                t("Actions", "操作"),
                              ].map((x) => (
                                <th key={x}>{x}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {inventory.map((s) => (
                              <tr key={s.id}>
                                <td>
                                  <b>{s.date}</b>
                                  <span>{s.market}</span>
                                  <small>{s.session}</small>
                                </td>
                                <td>
                                  <b>{s.product}</b>
                                  <span>{s.unit}</span>
                                </td>
                                {(
                                  [
                                    "opening",
                                    "received",
                                    "sold",
                                    "donated",
                                    "spoiled",
                                    "transferred",
                                    "closing",
                                  ] as const
                                ).map((k) => (
                                  <td key={k}>{s[k]}</td>
                                ))}
                                <td>
                                  <div className="row-actions">
                                    <button
                                      aria-label={`Edit ${s.product}`}
                                      onClick={() =>
                                        setEditor({
                                          kind: "inventory",
                                          record: s,
                                        })
                                      }
                                    >
                                      <Pencil size={15} />
                                    </button>
                                    <button
                                      aria-label={`Delete ${s.product}`}
                                      onClick={() =>
                                        setRemove({
                                          kind: "inventory",
                                          id: s.id,
                                        })
                                      }
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
                    ) : (
                      <Empty
                        title={t("No inventory records yet.", "暂无库存记录。")}
                        detail={t(
                          "Log measured quantities in a consistent unit.",
                          "按一致的实测单位录入商品数量。",
                        )}
                      />
                    )}
                  </section>
                </>
              ) : page === "exchange" ? (
                <Exchange
                  key={mode}
                  t={t}
                  state={state}
                  mode={mode}
                  busy={busy}
                  connected={connected}
                  exportFile={exportFile}
                  mutate={mutate}
                  setError={setError}
                />
              ) : (
                <Planning t={t} />
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              <Leaf size={13} /> Qinghe ·{" "}
              {t(
                "Built for the people behind market day.",
                "服务每一位市集运营者。",
              )}
            </span>
            <span>
              {mode === "demo"
                ? t(
                    "EXAMPLE DATA · NOT OPERATING RESULTS",
                    "演示数据 · 非实际经营结果",
                  )
                : t("LOCAL RECORDS · AMERICA/NEW_YORK", "本地记录 · 纽约时区")}
            </span>
          </footer>
        </div>
      </main>
      {editor && (
        <Editor
          kind={editor.kind}
          record={editor.record}
          t={t}
          busy={busy}
          saveError={error}
          close={() => !busy && setEditor(null)}
          save={(r) => mutate("records/" + editor.kind, { record: r })}
        />
      )}
      {remove && (
        <Modal
          title={t("Delete this record?", "删除这条记录？")}
          close={() => !busy && setRemove(null)}
        >
          <p>
            {t(
              "Export a backup first if you may need this record later.",
              "如果后续还需此记录，请先导出备份。",
            )}
          </p>
          <div className="modal-actions">
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => setRemove(null)}
            >
              {t("Keep record", "保留")}
            </button>
            <button
              className="btn danger"
              disabled={busy}
              onClick={() =>
                mutate(
                  "delete/" + remove.kind + "/" + encodeURIComponent(remove.id),
                  {},
                )
              }
            >
              {t("Delete record", "删除记录")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <article className={"metric " + (accent ? "metric-accent" : "")}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}
function Empty({
  title,
  detail,
  action,
  label,
}: {
  title: string;
  detail: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="empty-state">
      <Database size={29} />
      <h3>{title}</h3>
      <p>{detail}</p>
      {action && (
        <button className="btn primary" onClick={action}>
          {label}
          <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const focus = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button,input,select,textarea,[tabindex="0"]',
        ) ?? [],
      ).filter((e) => !e.hasAttribute("disabled"));
    focus()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const all = focus();
      const first = all[0],
        last = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      old?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="icon-btn"
            aria-label="Close dialog"
            onClick={close}
          >
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Editor({
  kind,
  record,
  t,
  busy,
  saveError,
  close,
  save,
}: {
  kind: "sessions" | "inventory";
  record?: Session | Inventory;
  t: (a: string, b: string) => string;
  busy: boolean;
  saveError: string;
  close: () => void;
  save: (r: Session | Inventory) => Promise<boolean>;
}) {
  const [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const isSession = kind === "sessions";
  const r = record as any;
  function field(
    name: string,
    label: string,
    opts: {
      type?: string;
      value?: any;
      required?: boolean;
      step?: string;
      placeholder?: string;
    } = {},
  ) {
    return (
      <label className="field" key={name}>
        {label}
        <input
          name={name}
          type={opts.type ?? "text"}
          defaultValue={opts.value ?? r?.[name] ?? ""}
          required={opts.required ?? true}
          step={opts.step}
          min={opts.type === "number" ? "0" : undefined}
          placeholder={opts.placeholder}
        />
      </label>
    );
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    try {
      const common = {
        id: r?.id ?? crypto.randomUUID(),
        date: v("date"),
        market: v("market"),
        session: v("session"),
        source_ref: v("source_ref"),
        notes: v("notes"),
      };
      let result: Session | Inventory;
      if (isSession)
        result = sessionSchema.parse({
          ...common,
          format: v("format"),
          status: v("status"),
          transactions:
            v("transactions") === "" ? null : Number(v("transactions")),
          tenders: Object.fromEntries(
            tenderKeys.map((k) => [k, centsFrom(v(k))]),
          ),
          costs: Object.fromEntries(
            costKeys.map((k) => [k, centsFrom(v("cost_" + k), true)]),
          ),
        });
      else
        result = inventorySchema.parse({
          ...common,
          product: v("product"),
          unit: v("unit"),
          ...Object.fromEntries(
            [
              "opening",
              "received",
              "sold",
              "donated",
              "spoiled",
              "transferred",
              "closing",
            ].map((k) => [k, Number(v(k))]),
          ),
        });
      await save(result);
    } catch (e: any) {
      setError(
        e.issues
          ?.map((i: any) => `${i.path.join(".")}: ${i.message}`)
          .join("; ") ?? e.message,
      );
    }
  }
  return (
    <Modal
      title={
        isSession
          ? t(
              record ? "Edit market day" : "Log a market day",
              record ? "编辑场次" : "录入一场市集",
            )
          : t(
              record ? "Edit inventory" : "Log inventory",
              record ? "编辑库存" : "录入库存",
            )
      }
      close={close}
    >
      <form onSubmit={submit} ref={form}>
        <fieldset disabled={busy}>
          <div className="form-grid">
            {field("date", t("Market date", "开市日期"), {
              type: "date",
              value: r?.date ?? today(),
            })}
            {field("market", t("Market / stop name", "市集 / 点位名称"))}
            {field(
              "session",
              t("Session (e.g. AM or Main)", "场次（如 AM 或 Main）"),
              { value: r?.session ?? "Main" },
            )}
            {isSession ? (
              <label className="field">
                {t("Format", "类型")}
                <select name="format" defaultValue={r?.format ?? "mobile"}>
                  <option value="mobile">{t("Mobile", "流动市集")}</option>
                  <option value="onsite">{t("On-site", "固定市集")}</option>
                </select>
              </label>
            ) : (
              field("product", t("Product name", "商品名称"))
            )}
            {isSession ? (
              <label className="field">
                {t("Status", "状态")}
                <select name="status" defaultValue={r?.status ?? "held"}>
                  <option value="held">{t("Held", "已开市")}</option>
                  <option value="cancelled">{t("Cancelled", "已取消")}</option>
                </select>
              </label>
            ) : (
              field("unit", t("Unit (lb, kg, bag…)", "单位（lb、kg、袋等）"))
            )}
            {isSession &&
              field(
                "transactions",
                t("Transactions · blank if unknown", "交易笔数 · 未知留空"),
                { type: "number", step: "1", required: false },
              )}
          </div>
          {isSession ? (
            <>
              <div className="form-section-head">
                <h3>{t("Actual payments · USD", "实际支付构成 · 美元")}</h3>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => {
                    for (const k of tenderKeys) {
                      const el = form.current!.elements.namedItem(
                        k,
                      ) as HTMLInputElement;
                      if (!el.value) el.value = "0";
                    }
                  }}
                >
                  {t(
                    "Confirm empty payment fields as 0",
                    "确认未填支付字段为 0",
                  )}
                </button>
              </div>
              <p className="form-help">
                {t(
                  "Use mutually exclusive net amounts. Include assistance in sales once. Enter 0 for unused tenders.",
                  "各支付金额不重叠，采用退款后净额；援助支付只计入一次。未使用的支付方式填 0。",
                )}
              </p>
              <div className="form-grid three">
                {tenderKeys.map((k, i) =>
                  field(
                    k,
                    [
                      t("Cash", "现金"),
                      t("Credit / debit", "银行卡"),
                      "SNAP / EBT",
                      "Market Bucks",
                      "WIC / FMNP",
                      t("Other", "其他"),
                    ][i],
                    {
                      type: "number",
                      step: "0.01",
                      value:
                        r?.tenders[k] === undefined ? "" : r.tenders[k] / 100,
                    },
                  ),
                )}
              </div>
              <h3 className="form-section-title">
                {t("Session costs · USD", "场次成本 · 美元")}
              </h3>
              <p className="form-help">
                {t(
                  "Unknown costs stay blank. Produce cost means goods consumed including losses; do not count purchases and losses twice.",
                  "未知成本留空。农产品成本指已消耗成本（含损耗），勿把采购与损耗重复计入。",
                )}
              </p>
              <div className="form-grid">
                {costKeys.map((k, i) =>
                  field(
                    "cost_" + k,
                    [
                      t("Produce consumed", "农产品消耗成本"),
                      t("Labor / staff time", "人工 / 工作时间成本"),
                      t("Transport", "运输"),
                      t("Other costs", "其他成本"),
                    ][i],
                    {
                      type: "number",
                      step: "0.01",
                      value: r?.costs[k] == null ? "" : r.costs[k] / 100,
                      required: false,
                    },
                  ),
                )}
              </div>
            </>
          ) : (
            <>
              <h3 className="form-section-title">
                {t(
                  "Measured quantities · use the same unit",
                  "实测数量 · 使用同一单位",
                )}
              </h3>
              <p className="form-help">
                {t(
                  "Opening + received must equal sold + donated + spoiled + transferred out + closing. Enter 0 when confirmed.",
                  "期初 + 入库 = 售出 + 捐赠 + 损耗 + 调出 + 期末。确认无数量时填 0。",
                )}
              </p>
              <div className="form-grid three">
                {[
                  "opening",
                  "received",
                  "sold",
                  "donated",
                  "spoiled",
                  "transferred",
                  "closing",
                ].map((k, i) =>
                  field(
                    k,
                    [
                      t("Opening", "期初"),
                      t("Received", "入库"),
                      t("Sold", "售出"),
                      t("Donated", "捐赠"),
                      t("Spoiled", "损耗"),
                      t("Transferred out", "调出"),
                      t("Closing", "期末"),
                    ][i],
                    { type: "number", step: "any" },
                  ),
                )}
              </div>
            </>
          )}
          {field(
            "source_ref",
            t(
              "Source reference · sheet, receipt or record ID",
              "来源 · 表格、凭证或记录编号",
            ),
            {
              placeholder: t(
                "e.g. Manager log / 2026-11-10",
                "例如：经理台账 / 2026-11-10",
              ),
            },
          )}
          <label className="field">
            {t("Notes (optional)", "备注（选填）")}
            <textarea name="notes" defaultValue={r?.notes ?? ""} rows={2} />
          </label>
          {(error || saveError) && (
            <div className="alert error" role="alert">
              {error || saveError}
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={close}>
              {t("Cancel", "取消")}
            </button>
            <button className="btn primary" type="submit">
              {busy ? t("Saving…", "保存中…") : t("Save record", "保存记录")}
              <Check size={16} />
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
function Exchange({
  t,
  state,
  mode,
  busy,
  connected,
  exportFile,
  mutate,
  setError,
}: {
  t: (a: string, b: string) => string;
  state: State;
  mode: string;
  busy: boolean;
  connected: boolean;
  exportFile: (template?: boolean) => void;
  mutate: (action: string, payload: any) => Promise<boolean>;
  setError: (s: string) => void;
}) {
  const [tables, setTables] = useState<Record<string, RawTable>>({});
  const [sheet, setSheet] = useState("");
  const [file, setFile] = useState("");
  const [kind, setKind] = useState<"sessions" | "inventory">("sessions");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [zero, setZero] = useState(false);
  const [preview, setPreview] = useState<Dataset | null>(null);
  const [reading, setReading] = useState(false);
  const [localError, setLocalError] = useState("");
  const columns = kind === "sessions" ? sessionColumns : inventoryColumns;
  const table = tables[sheet];
  useEffect(() => {
    if (table) setMapping(guessMapping(table.headers, columns));
    setPreview(null);
    setZero(false);
  }, [sheet, kind, tables]);
  async function load(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setReading(true);
    setError("");
    setLocalError("");
    setPreview(null);
    try {
      if (f.name.endsWith(".json")) {
        const v = JSON.parse(await f.text());
        if (v.kind !== "qinghe-operations-backup-v1")
          throw new Error("Not a Market Operations backup");
        if (mode === "actual" && v.provenance === "synthetic")
          throw new Error(
            t(
              "Example backups cannot be imported into actual records.",
              "演示备份不能导入真实记录。",
            ),
          );
        const data = datasetSchema.parse(v.data);
        setPreview(data);
        setTables({});
        setFile(f.name);
        return;
      }
      const result = await readWorkbook(f, mode !== "actual");
      setTables(result);
      setSheet(
        Object.keys(result).find((k) => k === "Market days") ??
          Object.keys(result)[0],
      );
      setFile(f.name);
    } catch (e: any) {
      setLocalError(e.message);
    } finally {
      setReading(false);
      e.target.value = "";
    }
  }
  function validate() {
    try {
      setLocalError("");
      const data = prepareImport(table, mapping, kind, file, zero);
      mergeRecords(state, data);
      setPreview(data);
    } catch (e: any) {
      setPreview(null);
      setLocalError(e.message);
    }
  }
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
                "Excel (.xlsx), CSV or a complete JSON backup.",
                "支持 Excel（.xlsx）、CSV 或完整 JSON 备份。",
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
            accept=".csv,.xlsx,.json"
            onChange={load}
            disabled={reading || busy}
          />
        </label>
        <p className="form-help">
          {t(
            "Use the template for new records, or map columns from your current manager spreadsheet. All payment columns must be mapped or explicitly confirmed as zero.",
            "新记录可用模板；已有经理表格可映射列名。支付列须全部映射，或明确确认缺失列为零。",
          )}
        </p>
        {table && (
          <>
            <div className="form-grid">
              <label className="field">
                {t("Worksheet", "工作表")}
                <select
                  value={sheet}
                  onChange={(e) => setSheet(e.target.value)}
                >
                  {Object.keys(tables).map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t("Record type", "记录类型")}
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as any)}
                >
                  <option value="sessions">{t("Market days", "场次")}</option>
                  <option value="inventory">{t("Inventory", "库存")}</option>
                </select>
              </label>
            </div>
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
                      setPreview(null);
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
            <p className="form-help">
              {t(
                "Unmapped ID = new ID; session = Main; format = mobile; status = held; source = filename. Unknown costs / transactions stay blank. Dates must use YYYY-MM-DD. Inventory quantities cannot be blank.",
                "未映射 ID 自动生成；场次默认为 Main，类型为 mobile，状态为 held，来源为文件名。未知成本和交易笔数留空。日期须为 YYYY-MM-DD，库存数量不可留空。",
              )}
            </p>
            {kind === "sessions" && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={zero}
                  onChange={(e) => {
                    setZero(e.target.checked);
                    setPreview(null);
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
              onClick={validate}
            >
              {t("Validate & preview", "校验并预览")}
              <ArrowRight size={16} />
            </button>
          </>
        )}
        {localError && (
          <div className="alert error" role="alert">
            {localError}
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
              {preview.inventory.length} {t("inventory rows", "库存记录")}
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Market</th>
                    <th>
                      {preview.sessions.length
                        ? "Sales (USD)"
                        : "Product / unit"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...preview.sessions, ...preview.inventory]
                    .slice(0, 8)
                    .map((r, i) => (
                      <tr key={i}>
                        <td>{r.date}</td>
                        <td>{r.market}</td>
                        <td>
                          {"tenders" in r
                            ? money(sales(r))
                            : r.product + " / " + r.unit}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="form-help">
              {t(
                "First 8 rows shown. The entire batch is validated. Existing identical rows skip; conflicts reject the entire import.",
                "显示前 8 行，整批已校验。完全相同的已有行跳过，冲突则整批拒绝。",
              )}
            </p>
            <button
              className="btn primary"
              disabled={
                busy ||
                (mode === "actual" && !connected) ||
                (!preview.sessions.length && !preview.inventory.length)
              }
              onClick={async () => {
                if (await mutate("import", { data: preview })) setPreview(null);
              }}
            >
              {t("Confirm import", "确认导入")}
              <Check size={16} />
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
                  "Exports include the entire selected workspace, regardless of dashboard filters.",
                  "导出包含当前工作区全部记录，不受看板筛选影响。",
                )}
              </p>
            </div>
          </div>
          <div className="export-buttons">
            <button disabled={busy} onClick={() => exportFile()}>
              <span className="file-icon">
                <FileSpreadsheet size={22} />
              </span>
              <span>
                <b>{t("Excel workbook", "Excel 工作簿")}</b>
                <small>
                  {t(
                    "Read me + market days + inventory",
                    "说明页 + 场次 + 库存",
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
                          data: {
                            sessions: state.sessions,
                            inventory: state.inventory,
                          },
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
              <span className="file-icon">
                <Database size={22} />
              </span>
              <span>
                <b>{t("Complete backup", "完整备份")}</b>
                <small>
                  {t(
                    "JSON · import to restore missing records",
                    "JSON · 导入可恢复缺失记录",
                  )}
                </small>
              </span>
              <Download size={18} />
            </button>
            <button disabled={busy} onClick={() => exportFile(true)}>
              <span className="file-icon">
                <NotebookPen size={22} />
              </span>
              <span>
                <b>{t("Blank import template", "空白录入模板")}</b>
                <small>
                  {t(
                    "Standard columns + a plain-language guide",
                    "标准字段 + 通俗说明",
                  )}
                </small>
              </span>
              <Download size={18} />
            </button>
          </div>
        </section>
        <section className="guide-card">
          <Info size={22} />
          <h3>{t("What goes in this tool?", "这里记录什么？")}</h3>
          <p>
            {t(
              "Record the sales made by the mobile market or other seller you are tracking. Vendor gross sales are not automatically the operator’s revenue.",
              "记录流动市集或所跟踪销售主体的销售。独立商户的成交额不自动等于运营方收入。",
            )}
          </p>
          <p>
            {t(
              "SNAP, Market Bucks and WIC are payment methods within sales. Grant receipts, restricted funds and bank cash need their own financial ledger.",
              "SNAP、Market Bucks 和 WIC 是销售中的支付方式。资助到账、专项资金和银行现金需另行记账。",
            )}
          </p>
          <p>
            {t(
              "Actual records start empty. The local service saves them in SQLite; the example workspace stays in this browser. A shared team deployment needs authentication and hosting.",
              "真实记录初始为空，本地服务将其存入 SQLite；演示数据仅保存在浏览器。团队共用需另行配置身份验证及托管。",
            )}
          </p>
        </section>
      </div>
    </div>
  );
}
function Planning({ t }: { t: (a: string, b: string) => string }) {
  const defaults = {
    price: 4.5,
    cost: 2,
    volume: 120,
    shrink: 8,
    labor: 110,
    transport: 35,
    other: 15,
    accessGap: 180,
    support: 0,
  };
  const [p, setP] = useState(defaults);
  const result = crossSubsidy(p);
  const fields: [keyof typeof p, string, string, string][] = [
    ["price", "Standard-stop selling price", "常规点位售价", "USD / unit"],
    ["cost", "Purchase cost", "采购价", "USD / unit"],
    ["volume", "Units purchased", "采购数量", "units"],
    ["shrink", "Unsold / lost before revenue", "未售或损耗占比", "%"],
    ["labor", "Labor / staff time", "人工成本", "USD / session"],
    ["transport", "Transport", "运输成本", "USD / session"],
    ["other", "Other session costs", "其他场次成本", "USD / session"],
    [
      "accessGap",
      "Access-stop funding gap",
      "可及性点位资金缺口",
      "USD / period",
    ],
    [
      "support",
      "Eligible committed support",
      "可用于该期间的已承诺支持",
      "USD / period",
    ],
  ];
  return (
    <>
      <div className="scenario-banner">
        <ChartNoAxesCombined size={21} />
        <div>
          <b>{t("Assumptions, not a forecast.", "这是假设测算，不是预测。")}</b>
          <span>
            {t(
              "Illustrative starting values. No real financial inputs have been loaded. Test a price without changing prices for customers.",
              "起始值仅为示例，尚未载入真实财务数据。调整参数不会改变顾客实际价格。",
            )}
          </span>
        </div>
      </div>
      <div className="planning-grid">
        <section className="card scenario-inputs">
          <div className="card-head">
            <div>
              <h2>
                {t("Can one stop support another?", "一个点位能支持另一个吗？")}
              </h2>
              <p>
                {t(
                  "A first-pass contribution model for the cross-subsidy idea raised in the meeting.",
                  "把会议里的跨点位补贴想法，拆成可检查的场次贡献测算。",
                )}
              </p>
            </div>
          </div>
          <div className="form-grid">
            {fields.map(([key, en, cn, unit]) => (
              <label className="field" key={key}>
                {t(en, cn)}
                <div className="input-with-unit">
                  <input
                    type="number"
                    min="0"
                    max={key === "shrink" ? 100 : 1000000}
                    step={key === "volume" ? "1" : "0.01"}
                    value={p[key]}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (
                        Number.isFinite(v) &&
                        v <= 1000000 &&
                        v >= 0 &&
                        (key !== "shrink" || v <= 100)
                      )
                        setP({ ...p, [key]: v });
                    }}
                  />
                  <span>{unit}</span>
                </div>
              </label>
            ))}
          </div>
          <button className="text-btn" onClick={() => setP(defaults)}>
            {t("Reset illustrative assumptions", "重置示例假设")}
          </button>
        </section>
        <div className="scenario-results">
          <section className="scenario-result-card">
            <div className="eyebrow">
              {t("STANDARD-STOP CONTRIBUTION", "常规点位场次贡献")}
            </div>
            <strong className={result.contribution < 0 ? "negative" : ""}>
              {amount(result.contribution)}
            </strong>
            <p>
              {t(
                "Per held session, before any transfer to an access stop.",
                "每场扣除所列成本后、向可及性点位补贴之前。",
              )}
            </p>
            <div>
              <span>
                {t("Sales after assumed loss", "按假设损失后的销售额")}
              </span>
              <b>{amount(result.revenue)}</b>
            </div>
            <div>
              <span>
                {t("Purchasing + operating costs", "采购 + 所列运营成本")}
              </span>
              <b>{amount(result.cost)}</b>
            </div>
          </section>
          <section className="card result-details">
            <h3>{t("What would it take?", "需要多少场？")}</h3>
            <p className="visits-number">
              {result.visits ?? "—"}{" "}
              <span>{t("standard-stop sessions", "个常规点位场次")}</span>
            </p>
            <p>
              {result.visits === null
                ? t(
                    "This stop does not generate a positive contribution. More sessions with the same economics will not fund the access stop.",
                    "此点位贡献不为正，相同经营条件下增加场次无法补贴可及性点位。",
                  )
                : t(
                    "Rounded up to cover the access-stop gap after eligible support.",
                    "按扣除合格支持后的资金缺口向上取整。",
                  )}
            </p>
            <div className="gap-row">
              <span>
                {t(
                  "Gap after one standard session + support",
                  "一场常规点位与支持后的剩余缺口",
                )}
              </span>
              <b>{amount(result.gap)}</b>
            </div>
            <p className="form-help">
              {t(
                "Quantity and price are independent assumptions here. This does not estimate demand elasticity. It excludes tax, debt, capital replacement and grant restrictions beyond your entered eligible amount.",
                "数量与价格在此独立假设，未估计需求弹性；未单独计税、债务、设备更新，资助仅计入你确认合格的可用金额。",
              )}
            </p>
          </section>
        </div>
      </div>
      <section className="card next-models">
        <div className="card-head">
          <div>
            <h2>
              {t("Where to take the modeling next", "接下来值得做的建模")}
            </h2>
            <p>
              {t(
                "Extend your existing financial and weather models with operational decisions.",
                "在已有财务与天气模型上，增加能回答运营决策的问题。",
              )}
            </p>
          </div>
        </div>
        <div className="model-options">
          {[
            [
              "01",
              "Procurement & loss",
              "采购与损耗",
              "How much should we buy, and when should surplus move to an on-site market? Start with 4–8 weeks of product-level sales and stock records.",
              "采购多少、何时将余货转回固定市场？先积累 4–8 周逐商品销售与库存，做单周期订货和损耗比较。",
            ],
            [
              "02",
              "Supplier delivered cost",
              "供应商到岸成本",
              "Compare like-for-like pack sizes, minimum order rules, delivery fees and packing labor. Confirm whether $500 means an order minimum or a fee.",
              "统一包装单位，比较最低订单、运费与分装人工。先核实转录中的 $500 是起送额还是配送费。",
            ],
            [
              "03",
              "Access & cross-subsidy",
              "可及性与交叉补贴",
              "Measure each stop’s contribution and service cost before testing a mixed weekly schedule. Use affordability constraints, not neighborhood income as a proxy for willingness to pay.",
              "先测各点位贡献和服务成本，再比较一周组合；设置可负担性约束，不用地区收入替代个人支付意愿。",
            ],
          ].map(([n, en, cn, body, zh]) => (
            <article key={n}>
              <span>{n}</span>
              <h3>{t(en, cn)}</h3>
              <p>{t(body, zh)}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
