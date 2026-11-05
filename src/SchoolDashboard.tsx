import { useEffect, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, CheckCircle2, CircleHelp, Clock3, CreditCard, Download, Layers3, Package, ShoppingBag, Store, Users, Wallet } from "lucide-react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, ReferenceLine, XAxis, YAxis } from "recharts";
import { money, shortDate } from "./api";
import { useLanguage } from "./i18n";
import type { Page } from "./navigation";
import type { SchoolOverview } from "./types";
import { aggregateTimeline, changePercent, csvText, type DashboardView } from "./schoolReports";
import { marketColors } from "./CommunityAtlas";
import { SnapImpact } from "./SnapProgram";
import { quantityUnit } from "./translations/translate";
import ProductDemand from "./ProductDemand";
import MarketComparison from "./MarketComparison";
import BusinessAnalytics from "./BusinessAnalytics";
import ReportCenter from "./ReportCenter";
import FinanceReport, { financeCategoryNames } from "./FinanceReport";
import "./reports.css";
import { tenderChannels } from '../server/tenders.mjs';
import "./school-dashboard.css";
import "./analytics-experience.css";

const viewNames = { overview: "数据总览", network: "市场与商户", products: "商品与库存", snap: "SNAP 与服务", business: "经营与覆盖", reports: "报表中心", finance: "运营收支" };
const reportNames = { summary: "核心指标", daily: "每日趋势", markets: "市场对比", vendors: "商户表现", products: "商品排行", slots: "自提时段", snap: "付款意向", business: "经营与覆盖", finance: "运营收支" };
type ExportKind = keyof typeof reportNames;
const rate = (n: number | null) => n === null ? "—" : `${n.toFixed(1)}%`;

export default function SchoolDashboard({ data, navigate, selectMarket, onSaved }: {
  data: SchoolOverview; navigate: (page: Page) => void; selectMarket: (id: number | null) => void; onSaved: () => void;
}) {
  const { t, language } = useLanguage();
  const [view, setView] = useState<DashboardView>(() => {
    const value = new URLSearchParams(window.location.search).get("view") as DashboardView;
    return value && value in viewNames ? value : "overview";
  });
  const [exportKind, setExportKind] = useState<ExportKind>("summary");
  const [exported, setExported] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (view === "overview") url.searchParams.delete("view"); else url.searchParams.set("view", view);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [view]);
  const a = data.analytics, s = data.summary, current = a.current, prev = a.previous;
  const exportReport = () => {
    const vendors = data.vendors.filter((v) => !data.marketId || v.marketIds.includes(data.marketId) || v.orders > 0 || v.products > 0);
    const content: Record<ExportKind, (string | number | null)[][]> = {
      finance: [[t('日期'),t('所属市场'),t('收支类别'),t('金额（USD）'),t('说明'),t('来源')],...a.finance.entries.map(r=>[r.date,r.marketName?t(r.marketName):t('全校公共'),t(financeCategoryNames[r.category]),(r.kind==='expense'?-1:1)*r.amountCents/100,r.description,t(r.source==='invoice'?'商户账单收款':'人工登记')])],
      business: [[t("指标"), t("本期")], ...([
        ["现金登记", a.business.receipts.cashCents / 100], ["银行卡登记", a.business.receipts.cardCents / 100],
        ["SNAP/EBT 登记", a.business.receipts.snapCents / 100], ["缺收款记录的完成订单", current.completed - a.business.receipts.orders],
        ["本期登记的费用收款", a.business.fees.periodReceiptsCents / 100], ["到期账单金额", a.business.fees.billedCents / 100],
        ["到期账单当前未收", a.business.fees.outstandingCents / 100], ["其中已逾期未收", a.business.fees.overdueCents / 100],
        ["已签到商户场次", a.business.attendance.checkedIn], ["已登记缺席", a.business.attendance.absent],
        ["尚未确认出勤", a.business.attendance.unconfirmed], ["待补销售填报", a.business.attendance.checkedIn - a.business.reports.reports],
        ["商户申报销售额", a.business.reports.reports ? a.business.reports.grossCents / 100 : null],
        ["商户申报交易笔数", a.business.reports.reports ? a.business.reports.transactions : null],
        ["已登记运营收入", a.finance.current.incomeEntries ? a.finance.current.incomeCents / 100 : null], ["已登记运营支出", a.finance.current.expenseEntries ? a.finance.current.expenseCents / 100 : null], ["已登记净收支", a.finance.current.netCents === null ? null : a.finance.current.netCents / 100],
      ] as [string, number | null][]).map(([label, value]) => [t(label), value]),
        ...tenderChannels.map(c => [`${t('商户申报收款分类')} · ${c.label}`, a.business.tenderMix.reports ? a.business.tenderMix.channels[c.key] / 100 : null]),
        [t('已分类填报'), a.business.tenderMix.reports],
        [t('已分类销售额'), a.business.tenderMix.reports ? a.business.tenderMix.classifiedCents / 100 : null],
        [t('未分类销售额'), a.business.reports.reports ? a.business.tenderMix.unclassifiedCents / 100 : null],
        [t("统计说明"), t("经营 CSV 的金额单位为 USD；商户申报、平台订单与运营费用不可相加。缺失值留空。")]],
      summary: [[t("指标"), t("本期"), t("上期")], ...([
        ["预购订单", current.orders, prev?.orders], ["已完成交易额（USD）", current.revenueCents / 100, prev ? prev.revenueCents / 100 : null],
        ["实际参与顾客", current.participants, prev?.participants], ["平均完成订单金额（USD）", current.averageOrderCents === null ? null : current.averageOrderCents / 100, prev?.averageOrderCents == null ? null : prev.averageOrderCents / 100],
        ["订单完成率（%）", current.completionRate, prev?.completionRate], ["订单取消率（%）", current.cancellationRate, prev?.cancellationRate],
        ["待履约金额（USD）", current.reservedCents / 100, prev ? prev.reservedCents / 100 : null], ["有完成订单的商户", a.sellingVendors, null],
      ] as [string, number | null, number | null | undefined][]).map(([label, value, prior]) => [t(label), value, prior ?? null])],
      daily: [[t("自提日期"), t("预购订单"), t("已完成订单"), t("已取消"), t("已完成交易额（USD）"), t("SNAP 意向订单"), t("每日去重顾客")], ...data.timeline.map((d) => [d.date, d.orders, d.completed, d.cancelled, d.revenueCents / 100, d.snapOrders, d.participants ?? null])],
      markets: [[t("市场"), t("预购订单"), t("已完成订单"), t("已取消"), t("参与顾客"), t("已完成交易额（USD）")], ...data.markets.map((m) => [t(m.name), m.orders, m.completed, m.cancelled, m.participants, m.revenueCents / 100])],
      vendors: [[t("商户"), t("预购订单"), t("已完成订单"), t("参与顾客"), t("已完成交易额（USD）")], ...vendors.map((v) => [t(v.name), v.orders, v.completed, v.participants, v.revenueCents / 100])],
      products: [[t("商品"), t("市场"), t("商户"), t("购买人数"), t("完成订单数"), t("完成交付数量"), t("单位"), t("已完成交易额（USD）"), t("跨场次复购买家"), t("成交均价（USD）"), t("最低成交单价（USD）"), t("最高成交单价（USD）"), t("每单平均购买量"), t("有成交的日期数"), t("最近成交日期")], ...a.products.map((p) => [t(p.name), t(p.marketName), t(p.vendorName), p.buyers, p.orders, p.quantity, quantityUnit(language, p.unit, p.quantity), p.revenueCents / 100, p.repeatBuyers, p.quantity ? Math.round(p.revenueCents / p.quantity) / 100 : null, p.minPriceCents / 100, p.maxPriceCents / 100, p.quantity / p.orders, p.sellingDays, p.lastSoldOn])],
      slots: [[t("自提时段"), t("有效预购"), t("已完成订单"), t("已完成交易额（USD）")], ...a.slots.map((p) => [p.slot, p.orders, p.completed, p.revenueCents / 100])],
      snap: [[t("付款意向"), t("有效预购"), t("意向商品金额（USD）"), t("合资格食品预估（USD）"), t("其他方式预估（USD）")], ...a.payments.map((p) => [t(p.method === "snap_ebt" ? "现场 SNAP/EBT 付款意向" : "到场选择其他付款方式"), p.orders, p.totalCents / 100, p.method === "snap_ebt" ? p.eligibleCents / 100 : null, p.method === "snap_ebt" ? p.otherCents / 100 : null])],
    };
    const rows = [[t("学校运营统计报表"), t(data.sampleData ? "合成演示样本" : "数据库记录")],
      [t("统计范围"), exportKind === "markets" ? t("全部市场对比") : t(data.markets.find((m) => m.id === data.marketId)?.name ?? "全部市场")],
      [t(exportKind === "finance" ? "发生日期" : "自提日期"), data.from ?? t("全部时间"), data.to, "America/New_York"],
      [t("上期"), prev?.from ?? "", prev?.to ?? ""], [t("生成时间"), data.updatedAt],
      [t("统计说明"), t("当前订单状态；完成交易额不等同于支付到账。SNAP 仅为付款意向，非核销记录。")], [], ...content[exportKind]];
    const url = URL.createObjectURL(new Blob([csvText(rows)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `qinghe-${exportKind}-${data.marketId ?? "all"}-${data.from ?? "all"}-${data.to}.csv`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000); setExported(true);
  };
  return <div className="analytics-dashboard">
    <section className="analytics-intro"><div><span className="eyebrow">QINGHE / ANALYTICS</span><h2>{t("市场经营分析")}</h2><p>{t("价格与销量看需求，出勤与收款看经营。")}</p></div><div className="analytics-export"><label className="sr-only" htmlFor="analytics-export-kind">{t("选择导出报表")}</label><select id="analytics-export-kind" value={exportKind} onChange={(e) => { setExportKind(e.target.value as ExportKind); setExported(false); }}>{Object.entries(reportNames).map(([value, name]) => <option key={value} value={value}>{t(name)}</option>)}</select><button className="button primary" onClick={exportReport}><Download size={15} />{t("导出 CSV")}</button>{exported && <span role="status" className="analytics-export-status">{t("报表已生成")}</span>}</div></section>
    {data.sampleData && <div className="analytics-sample"><Layers3 size={17} /><div><strong>{t("合成演示样本")}</strong><span>{t("当前交易、顾客与付款意向为生成样例，用于评审统计功能，不代表真实运营或 SNAP 核销。")}</span></div></div>}
    <button className="report-open-summary business-link" onClick={()=>setView("reports")}>{t("打开经营摘要与报表目录")}<ArrowRight size={15}/></button>
    <div className="analytics-metrics">
      <Stat label={t("已完成交易额")} value={money(current.revenueCents)} icon={<Wallet size={18} />} note={t("仅计已完成自提订单")} delta={changePercent(current.revenueCents, prev?.revenueCents)} comparable={!!prev} baselineZero={prev?.revenueCents === 0} prominent />
      <Stat label={t(data.marketId ? "当前市场预购" : "全平台预购")} value={current.orders} icon={<ShoppingBag size={18} />} note={t("含待履约、已完成与已取消订单")} delta={changePercent(current.orders, prev?.orders)} comparable={!!prev} baselineZero={prev?.orders === 0} />
      <Stat label={t("实际参与顾客")} value={current.participants} icon={<Users size={18} />} note={t("已完成订单的去重顾客数")} delta={changePercent(current.participants, prev?.participants)} comparable={!!prev} baselineZero={prev?.participants === 0} />
      <Stat label={t("平均完成订单金额")} value={current.averageOrderCents === null ? "—" : money(current.averageOrderCents)} icon={<BarChart3 size={18} />} note={t("完成交易额 ÷ 完成订单数")} delta={changePercent(current.averageOrderCents, prev?.averageOrderCents)} comparable={!!prev} baselineZero={prev?.averageOrderCents === 0} />
      <Stat label={t("订单完成率")} value={rate(current.completionRate)} icon={<CheckCircle2 size={18} />} note={`${s.completed} / ${s.orders} ${t("预购订单")}`} />
      <Stat label={t("订单取消率")} value={rate(current.cancellationRate)} icon={<CircleHelp size={18} />} note={`${s.cancelled} / ${s.orders} ${t("预购订单")}`} />
      <Stat label={t("待履约金额")} value={money(current.reservedCents)} icon={<Clock3 size={18} />} note={t("待确认与待自提订单金额")} />
      <Stat label={t("有完成订单的商户")} value={a.sellingVendors} icon={<Store size={18} />} note={t("{0} 家已分配商户 · {1} 款完成交易商品", { 0: s.totalVendors, 1: a.soldProducts })} />
    </div>
    <div className="analytics-period-detail"><span>{prev ? `${t("对比上期")} ${prev.from} — ${prev.to}` : t("全部时间不计算上期增幅")}</span><span>{t("数据更新")} {new Date(data.updatedAt).toLocaleTimeString(language === "en" ? "en-US" : "zh-CN", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" })} ET</span></div>
    <div className="analytics-tabs" role="tablist" aria-label={t("统计看板分区")}>{Object.entries(viewNames).map(([key, label]) => <button key={key} id={`analytics-tab-${key}`} role="tab" aria-selected={view === key} aria-controls={`analytics-${key}`} onClick={() => setView(key as DashboardView)}>{t(label)}{key === "products" && a.inventory.lowStock + a.inventory.soldOut > 0 && <span>{a.inventory.lowStock + a.inventory.soldOut}</span>}</button>)}</div>
    <div className="analytics-tab-content" id={`analytics-${view}`} role="tabpanel" aria-labelledby={`analytics-tab-${view}`}>
      {view === "overview" && <>
        <div className="analytics-primary-grid"><Trend data={data} /><Fulfillment data={data} /></div>
        <div className="analytics-decision-grid"><ProductDemand products={a.products} previousProducts={a.previousProducts} compact onExpand={() => setView("products")} /><MarketComparison data={data} selectMarket={selectMarket} /></div>
        <div className="analytics-secondary-grid"><Demand data={data} /><Customers data={data} /></div>
        <Operations data={data} />
      </>}
      {view === "network" && <Network data={data} selectMarket={selectMarket} navigate={navigate} />}
      {view === "products" && <Products data={data} />}
      {view === "business" && <BusinessAnalytics data={data} navigate={navigate} />}
      {view === "reports" && <ReportCenter data={data} open={setView}/>}
      {view === "finance" && <FinanceReport key={`${data.marketId}:${data.from}:${data.to}`} finance={a.finance} data={data} onSaved={onSaved}/>}
      {view === "snap" && <>
        <SnapImpact data={data} manage={(id) => { selectMarket(id); navigate("school-markets"); }} />
        <Payments data={data} />
        <div className="analytics-note"><CircleHelp size={17} /><p>{t("网站未连接支付结算、代币核销、顾客住址、食品重量或碳排数据，因此不推算到账金额、援助领取资格、实际覆盖人口或减碳成效。")}</p></div>
      </>}
    </div>
    <details className="analytics-definitions"><summary><CircleHelp size={15} />{t("统计口径与数据边界")}</summary><div><p>{t("订单按美国东部时间的自提日期及当前状态汇总；订单之后完成或取消，会改变历史周期的统计。")}</p><p>{t("完成率与取消率均以全部预购订单为分母。平均订单金额只计算已完成订单。上期为紧接本期之前、天数相同的日期区间；上期为零时不显示百分比增幅。")}</p><p>{t("新参与指首次完成订单发生在本期，回访指此前已有完成订单，均在当前市场范围内判断。复购频次只统计本期完成订单，不代表留存率。")}</p><p>{t("库存、入驻关系及接受状态反映当前配置，不随历史日期回溯。商品数量按各自单位展示，不把磅、袋、个直接相加。")}</p><p>{t("当前订单状态；完成交易额不等同于支付到账。SNAP 仅为付款意向，非核销记录。")}</p></div></details>
  </div>;
}

function Stat({ label, value, icon, note, delta, comparable, baselineZero, prominent }: { label: string; value: string | number; icon: ReactNode; note: string; delta?: number | null; comparable?: boolean; baselineZero?: boolean; prominent?: boolean }) {
  const { t } = useLanguage();
  return <article className={`analytics-stat ${prominent ? "analytics-stat-primary" : ""}`}><div className="analytics-stat-label"><span>{label}</span>{icon}</div><strong>{value}</strong><p>{note}</p>{comparable && <div className={`analytics-delta ${delta !== null && delta !== undefined && delta < 0 ? "down" : ""}`}>{delta === null || delta === undefined ? t(baselineZero ? "上期为零，暂无增幅" : "暂无可比数据") : <>{delta < 0 ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}{Math.abs(delta).toFixed(1)}% <span>{t("较上期")}</span></>}</div>}</article>;
}
function EmptyData({ text = "所选周期暂无完成订单" }: { text?: string }) { const { t } = useLanguage(); return <p className="analytics-empty">{t(text)}</p>; }

function Trend({ data }: { data: SchoolOverview }) {
  const { t } = useLanguage();
  const [metric, setMetric] = useState("orders"), [interval, setInterval] = useState<"day" | "week" | "month">("day");
  const [selected, setSelected] = useState("");
  const [showCompleted, setShowCompleted] = useState(true);
  const chart = aggregateTimeline(data.timeline, interval);
  const active = chart.find((row) => row.date === selected) ?? chart[chart.length - 1];
  const activeIndex = Math.max(0, chart.findIndex((row) => row.date === active?.date));
  const mainLabel = metric === "revenue" ? "完成交易额" : metric === "snap" ? "SNAP 意向订单" : "预购订单";
  const total = metric === "revenue" ? money(data.summary.revenueCents) : metric === "snap" ? data.summary.snapIntentOrders : data.summary.orders;
  return <section className="panel analytics-trend"><div className="analytics-panel-head"><div><span className="eyebrow">PERFORMANCE OVER TIME</span><h3>{t("预购与履约趋势")}</h3></div><select aria-label={t("趋势汇总粒度")} value={interval} onChange={(e) => { setInterval(e.target.value as typeof interval); setSelected(""); }}><option value="day">{t("按日")}</option><option value="week">{t("按周")}</option><option value="month">{t("按月")}</option></select></div>
    <div className="analytics-segments" role="group" aria-label={t("趋势指标")}><button aria-pressed={metric === "orders"} onClick={() => setMetric("orders")}>{t("预购与完成")}</button><button aria-pressed={metric === "revenue"} onClick={() => setMetric("revenue")}>{t("完成交易额")}</button><button aria-pressed={metric === "snap"} onClick={() => setMetric("snap")}>{t("SNAP 意向")}</button></div>
    <div className="decision-trend-summary"><strong>{total}</strong><span>{t(mainLabel)} · {t("本期")}</span></div>
    <div className="decision-chart-legend"><span><i className={metric === "orders" ? "legend-orders" : "legend-completed"} />{t(mainLabel)}</span>{metric === "orders" && <button className="legend-toggle" aria-pressed={showCompleted} onClick={() => setShowCompleted((v) => !v)}><i className="legend-line" />{t("已完成订单")}</button>}<small>{t("自提日期 · 美国东部时间")}</small></div>
    {data.summary.orders ? <><div className="analytics-chart" aria-label={t("按自提日期的经营趋势图")}><ResponsiveContainer width="100%" height="100%"><ComposedChart accessibilityLayer data={chart} onClick={(state) => { if (state.activeLabel) setSelected(String(state.activeLabel)); }} margin={{ top: 12, right: 10, left: 0, bottom: 6 }}>
      <CartesianGrid vertical={false} stroke="#dfe6e2" strokeDasharray="3 4" /><XAxis dataKey="date" tickFormatter={shortDate} minTickGap={32} tick={{ fontSize: 11, fill: "#52685d" }} tickLine={false} axisLine={false} />
      <YAxis width={metric === "revenue" ? 64 : 38} domain={[0, "auto"]} allowDecimals={false} tickFormatter={metric === "revenue" ? (v) => `$${Number(v) / 100}` : undefined} tick={{ fontSize: 11, fill: "#52685d" }} tickLine={false} axisLine={false} />
      <Tooltip labelFormatter={(v) => String(v)} formatter={(v) => metric === "revenue" ? money(Number(v)) : v} contentStyle={{ fontSize: 12, borderRadius: 10, borderColor: "#d3dfd6", color: "#234633" }} />
      {metric === "orders" ? <Bar isAnimationActive={false} dataKey="orders" name={t("预购订单")} fill="#a1b9cb" radius={[3,3,0,0]} maxBarSize={32} /> : <Area isAnimationActive={false} type="linear" dataKey={metric === "revenue" ? "revenueCents" : "snapOrders"} name={t(mainLabel)} stroke="#28694b" strokeWidth={2.5} fill="#e0eee3" dot={chart.length === 1 ? { r: 5, fill: "#28694b" } : false} />}
      {active && <ReferenceLine x={active.date} stroke="#0f766e" strokeDasharray="3 3" />}
      {metric === "orders" && showCompleted && <Line isAnimationActive={false} type="linear" dataKey="completed" name={t("已完成订单")} stroke="#235e41" strokeWidth={2.5} dot={chart.length < 10 ? { r: 3, fill: "#235e41" } : false} />}
    </ComposedChart></ResponsiveContainer></div>{active && <div className="trend-inspector"><div className="trend-inspector-heading"><label htmlFor="trend-date-selector">{t(interval === "day" ? "选中日期" : "选中周期起始日")} <strong>{active.date}</strong></label><span>{t("点击图表或拖动查看")}</span></div><input id="trend-date-selector" type="range" aria-label={t("选择趋势日期")} min={0} max={Math.max(0, chart.length - 1)} value={activeIndex} onChange={(e) => setSelected(chart[Number(e.target.value)].date)} /><dl>{[["预购订单", active.orders], ["已完成订单", active.completed], ["完成交易额", money(active.revenueCents)], ["已取消", active.cancelled]].map(([label, value]) => <div key={String(label)}><dt>{t(String(label))}</dt><dd>{value}</dd></div>)}</dl></div>}<details className="decision-data-table"><summary>{t("查看趋势数据明细")}</summary><div className="school-table-wrap"><table className="school-table"><caption className="sr-only">{t("趋势数据明细")}</caption><thead><tr>{["自提日期", "预购订单", "已完成订单", "完成交易额", "SNAP 意向订单"].map((label) => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{chart.map((row) => <tr key={row.date}><td>{row.date}</td><td>{row.orders}</td><td>{row.completed}</td><td>{money(row.revenueCents)}</td><td>{row.snapOrders}</td></tr>)}</tbody></table></div></details></> : <EmptyData text="所选周期暂无订单，真实记录会在这里形成趋势。" />}
    <p className="school-footnote">{t("按自提日期及当前订单状态；周从周一开始，首尾可能为不足一周或一月的汇总。")}</p>
  </section>;
}
function Fulfillment({ data }: { data: SchoolOverview }) {
  const { t } = useLanguage(); const s = data.summary;
  const states = [["pending", "待商户确认", "#c1b18c"], ["confirmed", "待到场自提", "#9dac88"], ["completed", "已完成", "#355a40"], ["cancelled", "已取消", "#c4b4a6"]] as const;
  return <section className="panel analytics-fulfillment"><div className="analytics-panel-head"><div><span className="eyebrow">FULFILLMENT</span><h3>{t("订单履约")}</h3></div><CheckCircle2 size={18} /></div><div className="analytics-fulfillment-number"><strong>{rate(data.analytics.current.completionRate)}</strong><span>{t("订单完成率")}</span></div>
    <div className="analytics-status-track">{states.map(([key, label, color]) => <i key={key} title={`${t(label)} ${s[key]}`} style={{ width: `${s[key] / Math.max(1, s.orders) * 100}%`, background: color }} />)}</div>
    <div className="analytics-status-rows">{states.map(([key, label, color]) => <div key={key}><span><i style={{ background: color }} />{t(label)}</span><strong>{s[key]}</strong><small>{s.orders ? `${Math.round(s[key] / s.orders * 100)}%` : "—"}</small></div>)}</div>
    <div className="analytics-alert-line"><Clock3 size={15} /><span>{t("已过自提日期仍待履约")}</span><strong>{data.analytics.operations.overdue}</strong></div>
  </section>;
}
function Demand({ data }: { data: SchoolOverview }) {
  const { t } = useLanguage(), a = data.analytics;
  const [selected, setSelected] = useState<{ weekday: number; slot: string } | null>(null);
  const slots = [...new Set(a.slots.map((s) => s.slot))].sort();
  const max = Math.max(1, ...a.heatmap.map((c) => c.orders));
  const days = [[1, "周一"], [2, "周二"], [3, "周三"], [4, "周四"], [5, "周五"], [6, "周六"], [0, "周日"]] as const;
  const peak = [...a.heatmap].sort((x, y) => y.orders - x.orders || x.weekday - y.weekday || x.slot.localeCompare(y.slot))[0];
  const active = selected ? a.heatmap.find((c) => c.weekday === selected.weekday && c.slot === selected.slot) : peak;
  const activeDay = days.find(([key]) => key === (selected?.weekday ?? active?.weekday));
  return <section className="panel"><div className="analytics-panel-head"><div><span className="eyebrow">PICKUP DEMAND</span><h3>{t("哪天、哪个时段更忙")}</h3></div><Clock3 size={18} /></div>{slots.length ? <>
    <div className="decision-demand-readout" role="status"><span>{t(selected ? "选中时段" : "预购最集中的时段")}</span><strong>{activeDay ? t(activeDay[1]) : "—"} {selected?.slot ?? active?.slot}</strong><b>{t("{count} 笔有效预购", { count: active?.orders ?? 0 })}</b></div>
    <div className="school-table-wrap"><table className="analytics-heatmap" aria-label={t("每周自提时段预购分布")}><thead><tr><th>{t("自提时段")}</th>{days.map(([key, label]) => <th key={key} scope="col">{t(label)}</th>)}</tr></thead><tbody>{slots.map((slot) => <tr key={slot}><th scope="row">{slot}</th>{days.map(([weekday, label]) => { const n = a.heatmap.find((c) => c.slot === slot && c.weekday === weekday)?.orders ?? 0; const level = n ? Math.ceil(n / max * 4) : 0; return <td key={weekday}><button className={`heat-level-${level}`} aria-label={`${t(label)} ${slot}: ${n}`} aria-pressed={selected?.weekday === weekday && selected.slot === slot} onClick={() => setSelected({ weekday, slot })}>{n}</button></td>; })}</tr>)}</tbody></table></div>
    <div className="decision-heat-legend"><span>0</span>{[0,1,2,3,4].map((level) => <i key={level} className={`heat-level-${level}`} />)}<span>{max} {t("有效预购")}</span></div></> : <EmptyData text="所选周期暂无有效预购" />}
    <p className="school-footnote">{t("累计有效预购数，排除取消；演示时段不表示官网营业时间或实际容量。")}</p><p className="school-footnote">{t("0 表示无有效预购记录，不表示市场开门却无人购买。")}</p></section>;
}
function Customers({ data }: { data: SchoolOverview }) {
  const { t } = useLanguage(), a = data.analytics, c = a.customers;
  const entries = [["本期完成 1 次", c.once], ["本期完成 2–3 次", c.twoToThree], ["本期完成 4 次及以上", c.fourPlus]] as const;
  const repeatRate = c.participants ? (c.twoToThree + c.fourPlus) / c.participants * 100 : null;
  return <section className="panel"><div className="analytics-panel-head"><div><span className="eyebrow">COMMUNITY PARTICIPATION</span><h3>{t("新参与与回访")}</h3></div><Users size={18} /></div><div className="analytics-customer-totals"><div><strong>{c.newParticipants}</strong><span>{t("首次参与顾客")}</span></div><div><strong>{c.returningParticipants}</strong><span>{t("此前已参与顾客")}</span></div><div><strong>{rate(repeatRate)}</strong><span>{t("本期多次参与占比")}</span></div></div><div className="analytics-frequency">{entries.map(([label, n], i) => <div key={label}><span>{t(label)}</span><div><i style={{ width: `${n / Math.max(1, c.participants) * 100}%`, background: marketColors[i] }} /></div><strong>{n}</strong></div>)}</div><p className="school-footnote">{t("仅统计已完成订单的去重顾客；在当前市场范围内判断首次参与与回访。")}</p></section>;
}
function Operations({ data }: { data: SchoolOverview }) {
  const { t } = useLanguage(), a = data.analytics;
  return <section className="panel"><div className="analytics-panel-head"><div><span className="eyebrow">OPERATIONS WATCH</span><h3>{t("待处理预购")}</h3></div><span className="school-badge">{data.summary.pending + data.summary.confirmed} {t("待履约")}</span></div>
    {a.operations.outstanding.length ? <div className="school-table-wrap"><table className="school-table"><thead><tr>{["订单编号", "市场", "自提日期 / 时段", "状态", "预购金额"].map((label) => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{a.operations.outstanding.map((o) => <tr key={o.id}><td>{o.id}</td><td>{t(o.marketName)}</td><td>{o.date}<small>{o.slot} ET</small></td><td><span className={`school-badge ${o.date < reportTodayLocal() ? "muted" : ""}`}>{t(o.status === "pending" ? "待商户确认" : "待到场自提")}</span></td><td>{money(o.totalCents)}</td></tr>)}</tbody></table></div> : <EmptyData text="所选周期没有待履约预购" />}
    <p className="school-footnote">{t("按自提日期从早到晚显示，最多 20 笔；由所属商户处理确认和履约。")}</p>
  </section>;
}
const reportTodayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

function Network({ data, selectMarket, navigate }: { data: SchoolOverview; selectMarket: (id: number | null) => void; navigate: (page: Page) => void }) {
  const { t } = useLanguage();
  const markets = [...data.markets].sort((a, b) => b.revenueCents - a.revenueCents || a.id - b.id);
  const total = data.markets.reduce((n, m) => n + m.revenueCents, 0);
  const vendors = data.vendors.filter((v) => !data.marketId || v.marketIds.includes(data.marketId) || v.orders > 0 || v.products > 0);
  return <>
    <MarketComparison data={data} selectMarket={selectMarket} />
    <section className="panel"><h3 className="decision-table-heading">{t("市场数据明细")}</h3>
      <div className="school-table-wrap"><table className="school-table"><thead><tr>{["市场", "预购订单", "已完成订单", "订单完成率", "订单取消率", "参与顾客", "平均完成订单金额", "交易额占比"].map((x) => <th key={x}>{t(x)}</th>)}</tr></thead><tbody>{markets.map((m) => <tr key={m.id}><td><button className="text-button" onClick={() => selectMarket(m.id)}>{t(m.name)}</button></td><td>{m.orders}</td><td>{m.completed}</td><td>{rate(m.orders ? m.completed / m.orders * 100 : null)}</td><td>{rate(m.orders ? m.cancelled / m.orders * 100 : null)}</td><td>{m.participants}</td><td>{m.completed ? money(Math.round(m.revenueCents / m.completed)) : "—"}</td><td>{rate(total ? m.revenueCents / total * 100 : null)}</td></tr>)}</tbody></table></div>
      <p className="school-footnote">{t("对比保留全部市场，使用同一日期范围；点击市场可切换全局统计范围。参与人数跨市场不能直接相加。")}</p>
    </section>
    <section className="panel"><div className="analytics-panel-head"><div><span className="eyebrow">VENDOR PERFORMANCE</span><h3>{t("商户经营排行")}</h3></div><button className="text-button" onClick={() => navigate("school-vendors")}>{t("管理商户网络")}<ArrowRight size={14} /></button></div><div className="school-table-wrap"><table className="school-table"><thead><tr>{["商户", "今日商品 / 全部商品", "预购订单", "已完成订单", "参与顾客", "已完成交易额"].map((x) => <th key={x}>{t(x)}</th>)}</tr></thead><tbody>{vendors.map((v, i) => <tr key={v.id}><td><span className="analytics-rank">{String(i + 1).padStart(2, "0")}</span>{t(v.name)}</td><td>{v.activeProducts} / {v.products}</td><td>{v.orders}</td><td>{v.completed}</td><td>{v.participants}</td><td><strong>{money(v.revenueCents)}</strong></td></tr>)}</tbody></table></div><p className="school-footnote">{t("按所选市场范围的完成交易额排序；历史订单使用商品成交快照。")}</p></section>
  </>;
}
function Products({ data }: { data: SchoolOverview }) {
  const { t, language } = useLanguage(); const a = data.analytics;
  return <>
    <div className="analytics-stock-cards">{[["今日上架商品", a.inventory.listed], ["今日可预购商品数", a.inventory.available], ["低库存商品", a.inventory.lowStock], ["可预购库存为零", a.inventory.soldOut]].map(([label, n]) => <article key={label}><Package size={18} /><strong>{n}</strong><span>{t(String(label))}</span></article>)}</div>
    <ProductDemand key={`${data.marketId}:${data.from}:${data.to}`} products={a.products} previousProducts={a.previousProducts} />
    <div className="analytics-secondary-grid"><section className="panel"><div className="analytics-panel-head"><div><span className="eyebrow">LIVE INVENTORY</span><h3>{t("预购库存提醒")}</h3></div><span className="school-badge">{t("当前快照")}</span></div>
      {a.inventory.alerts.length ? <div className="analytics-stock-list">{a.inventory.alerts.map((p) => <div key={p.id}><span><strong>{t(p.name)}</strong><small>{t(p.marketName)} · {t(p.vendorName)}</small></span><span className={`school-badge ${p.stock === 0 ? "muted" : ""}`}>{p.stock === 0 ? t("可预购库存为零") : `${p.stock} ${quantityUnit(language, p.unit, p.stock)}`}</span></div>)}</div> : <EmptyData text="当前没有低库存或售罄提醒" />}<p className="school-footnote">{t("今日上架商品的可预购库存；0 不代表实物售罄，1–5 为固定提醒阈值。最多显示 20 项。")}</p></section>
      <section className="panel"><div className="analytics-panel-head"><div><span className="eyebrow">CATALOG MIX</span><h3>{t("当前商品结构")}</h3></div><Package size={18} /></div><div className="analytics-category-list">{a.inventory.categories.map((c, i) => <div key={c.name}><span><i style={{ background: marketColors[i % marketColors.length] }} />{t(c.name)}</span><strong>{c.products}</strong><small>{rate(a.inventory.listed ? c.products / a.inventory.listed * 100 : null)}</small></div>)}</div>{!a.inventory.listed && <EmptyData text="当前没有今日上架商品" />}<div className="analytics-alert-line"><CreditCard size={15} /><span>{t("食品资格待核实商品")}</span><strong>{a.inventory.snapUnknown}</strong></div><p className="school-footnote">{t("反映今日商品结构与食品资格标记，不作为历史销量或 SNAP 接受证明。")}</p></section></div>
  </>;
}
function Payments({ data }: { data: SchoolOverview }) {
  const { t } = useLanguage(); const snap = data.analytics.payments.find((p) => p.method === "snap_ebt");
  const all = data.analytics.payments.reduce((n, p) => n + p.orders, 0);
  return <section className="panel"><div className="analytics-panel-head"><div><span className="eyebrow">PAYMENT INTENTIONS</span><h3>{t("现场付款意向分析")}</h3></div><CreditCard size={18} /></div><div className="analytics-snap-numbers"><div><strong>{rate(all ? (snap?.orders ?? 0) / all * 100 : null)}</strong><span>{t("SNAP 意向占有效预购")}</span></div><div><strong>{money(snap?.eligibleCents ?? 0)}</strong><span>{t("合资格食品意向预估")}</span></div><div><strong>{money(snap?.otherCents ?? 0)}</strong><span>{t("混合购物袋其他方式预估")}</span></div><div><strong>{snap?.customers ?? 0}</strong><span>{t("SNAP 意向顾客（去重）")}</span></div></div>
    <div className="school-table-wrap"><table className="school-table"><thead><tr>{["付款意向", "有效预购", "已完成自提", "意向商品金额", "合资格食品预估"].map((x) => <th key={x}>{t(x)}</th>)}</tr></thead><tbody>{data.analytics.payments.map((p) => <tr key={p.method}><td>{t(p.method === "snap_ebt" ? "现场 SNAP/EBT 付款意向" : "到场选择其他付款方式")}</td><td>{p.orders}</td><td>{p.completed}</td><td>{money(p.totalCents)}</td><td>{p.method === "snap_ebt" ? money(p.eligibleCents) : "—"}</td></tr>)}</tbody></table></div>{!all && <EmptyData text="所选周期暂无有效预购" />}<p className="school-footnote">{t("排除取消订单。食品预估来自提交时的资格与价格快照，未读取福利余额；全部金额均不代表 EBT 已扣款或实际援助核销。")}</p>
  </section>;
}
