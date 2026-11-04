import { useEffect, useRef, useState } from "react";
import { Activity, ArrowLeft, ArrowUpRight, CheckCircle2, Clock3, Expand, Minimize, Leaf, Pause, Play, RefreshCw, ShoppingBag, Store, Users, Wallet } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LanguageSwitcher, useLanguage, type Message } from "./i18n";
import { api, money, shortDate } from "./api";
import type { SchoolOverview } from "./types";
import "./school-screen.css";
import SchoolScreenOperations from "./SchoolScreenOperations";
import type { OperatingFollowup } from "./schoolScreenTypes";

type ReceiptTotals = { count: number; cashCents: number; cardCents: number; snapCents: number };
type Counts = { orders: number; pending: number; confirmed: number; completed: number; cancelled: number; participants: number; snapIntentOrders: number; completedCents: number; listed: number; available: number; lowStock: number; soldOut: number; overdue: number; receipts: ReceiptTotals };
type Session = { id: number; market_id: number; marketName: string; date: string; starts_at: string; ends_at: string; cutoff: string; capacity: number; orders: number; booking: string };
type LiveData = { date: string; generatedAt: string; summary: Counts; followup: OperatingFollowup; markets: (Counts & { id: number; name: string; active: number; preorders_enabled: number; vendors: number; session: Session | null })[]; sessions: Session[]; worklist: { marketId: number; marketName: string; date: string; count: number; pending: number }[] };
type ScreenOverview = Pick<SchoolOverview, "range" | "from" | "to" | "summary" | "sampleData" | "timeline"> & { analytics: { current: { completionRate: number | null }; products: SchoolOverview["analytics"]["products"] } };
type ScreenData = { overview: ScreenOverview; live: LiveData };
const bookingLabels: Record<string, string> = { open: "接单中", cancelled: "场次已取消", draft: "草稿", closed: "停止接单", cutoff: "接单已截止", ended: "当日场次已结束", inactive: "市场已停用", paused: "预购已暂停", unscheduled: "今日未排期" };
export const operationsUrl = (marketId: number | null, date: string, tab = "orders") => `/admin/operations?${new URLSearchParams({ ...(marketId ? { market: String(marketId) } : {}), date, tab })}`;

export default function SchoolScreen({ demo }: { demo: boolean }) {
  const { t } = useLanguage();
  const q = new URLSearchParams(window.location.search);
  const [market, setMarket] = useState(() => /^\d+$/.test(q.get("market") ?? "") && Number(q.get("market")) > 0 ? q.get("market")! : "all");
  const [view, setView] = useState(() => q.get("view") === "operations" ? "operations" : "overview");
  const [range, setRange] = useState(() => ["7", "30", "90"].includes(q.get("range") ?? "") ? q.get("range")! : "30");
  const [interval, setIntervalSeconds] = useState(30), [paused, setPaused] = useState(false), [tick, setTick] = useState(0);
  const [data, setData] = useState<ScreenData>(), [error, setError] = useState<Message>(""), [busy, setBusy] = useState(true), [clock, setClock] = useState(new Date());
  const [marketPage, setMarketPage] = useState(0), [fullError, setFullError] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [marketOptions, setMarketOptions] = useState<{ id: number; name: string }[]>([]);
  const inFlight = useRef(false), scope = useRef(`${market}:${range}`), root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (market === "all") url.searchParams.delete("market"); else url.searchParams.set("market", market);
    if (view === "operations") url.searchParams.set("view", view); else url.searchParams.delete("view");
    url.searchParams.set("range", range); window.history.replaceState(null, "", url.pathname + url.search);
    setMarketPage(0);
  }, [market, range, view]);
  useEffect(() => {
    const restore = () => { const query = new URLSearchParams(window.location.search); const id = query.get("market"); setView(query.get("view") === "operations" ? "operations" : "overview"); setMarket(id && /^\d+$/.test(id) && Number(id) > 0 ? id : "all"); setRange(["7", "30", "90"].includes(query.get("range") ?? "") ? query.get("range")! : "30"); };
    window.addEventListener("popstate", restore); return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    let current = true;
    api<{ id: number; name: string }[]>("/admin/markets").then((rows) => { if (current) setMarketOptions(rows); }).catch(() => {});
    return () => { current = false; };
  }, [tick]);
  useEffect(() => {
    let current = true; const controller = new AbortController(); inFlight.current = true; setBusy(true); setError("");
    const key = `${market}:${range}`; if (scope.current !== key) { setData(undefined); scope.current = key; }
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    api<ScreenData>(`/admin/screen?range=${range}${market === "all" ? "" : `&marketId=${market}`}`, { signal: controller.signal })
      .then((next) => { if (current) setData(next); }).catch((e) => { if (current) setError(e as Error); })
      .finally(() => { clearTimeout(timeout); if (current) { setBusy(false); inFlight.current = false; } });
    return () => { current = false; clearTimeout(timeout); controller.abort(); inFlight.current = false; };
  }, [market, range, tick]);
  useEffect(() => { const timer = window.setInterval(() => setClock(new Date()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const changed = () => setIsFullscreen(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  useEffect(() => {
    const refresh = () => { if (!paused && !document.hidden && !inFlight.current) setTick((n) => n + 1); };
    const timer = window.setInterval(refresh, interval * 1000); document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [paused, interval]);
  const fullscreen = async () => {
    setFullError("");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (root.current?.requestFullscreen) {
        await root.current.requestFullscreen();
        if (document.fullscreenElement !== root.current) setFullError("当前浏览器不支持全屏，可使用浏览器的全屏功能。");
      } else setFullError("当前浏览器不支持全屏，可使用浏览器的全屏功能。");
    }
    catch { setFullError("未能进入全屏，可使用浏览器的全屏功能。"); }
  };
  const l = data?.live, a = data?.overview, s = l?.summary;
  const displayTime = (date: Date) => date.toLocaleTimeString([], { timeZone: "America/New_York", hour12: false });
  return <div className={`school-screen${data ? " screen-ready" : ""}`} ref={root}>
    <header className="screen-header"><div className="screen-brand"><Leaf size={27} /><div><span>QINGHE / UNIVERSITY OPERATIONS</span><h1>{t("学校市场管理大屏")}</h1></div></div><div className="screen-clock"><strong>{displayTime(clock)}</strong><span>{clock.toLocaleDateString("en-CA", { timeZone: "America/New_York" })} · ET</span></div><div className="screen-tools"><LanguageSwitcher /><a href="/admin" className="screen-button"><ArrowLeft size={16} />{t("返回管理")}</a><button className="screen-button" onClick={() => void fullscreen()}>{isFullscreen ? <Minimize size={16} /> : <Expand size={16} />}{t(isFullscreen ? "退出全屏" : "全屏展示")}</button></div></header>
    <div className="screen-toolbar"><div><span className={`screen-live-dot ${error ? "offline" : paused ? "paused" : ""}`} /><strong>{t(error ? "刷新失败" : busy ? "更新中" : paused ? "已暂停自动刷新" : "自动刷新中")}</strong><span>{t(demo ? "演示数据库" : "运营数据库")}</span>{a?.sampleData && <b className="screen-sample">{t("合成演示样本")}</b>}<span className="screen-updated">{t("最近成功更新")} {l ? displayTime(new Date(l.generatedAt)) : "—"}</span></div><div><label>{t("当前市场")}<select aria-label={t("大屏市场范围")} value={market} onChange={(e) => setMarket(e.target.value)}><option value="all">{t("全部市场")}</option>{marketOptions.map((m) => <option key={m.id} value={m.id}>{t(m.name)}</option>)}</select></label>{view === "overview" && <label>{t("趋势周期")}<select aria-label={t("大屏趋势周期")} value={range} onChange={(e) => setRange(e.target.value)}>{["7", "30", "90"].map((n) => <option key={n} value={n}>{t("最近 {count} 天", { count: n })}</option>)}</select></label>}<select aria-label={t("大屏刷新间隔")} value={interval} onChange={(e) => setIntervalSeconds(Number(e.target.value))}>{[30, 60, 120].map((n) => <option key={n} value={n}>{t("每 {count} 秒", { count: n })}</option>)}</select><button className="screen-button" aria-pressed={paused} onClick={() => setPaused((v) => !v)}>{paused ? <Play size={14} /> : <Pause size={14} />}{t(paused ? "恢复刷新" : "暂停刷新")}</button><button className="screen-button" aria-label={t("立即刷新大屏")} disabled={busy} onClick={() => setTick((n) => n + 1)}><RefreshCw size={15} />{t("刷新")}</button></div></div>
    {(error || fullError) && <p className="screen-error" role="alert">{error ? <>{t(error)} {t("当前显示最近成功更新的数据，请核对更新时间。")}</> : t(fullError)}</p>}
    {!data ? <div className="screen-loading" role="status">{t(error ? "暂时无法读取管理大屏，请点击刷新重试。" : "正在读取市场运营记录…")}</div> : <>
      <div className="screen-section-label"><span>{t("今日运营")}</span><small>{l!.date} · {t(view === "operations" ? "出摊与销售按营业日期统计，美国东部时间" : "按自提日期统计，美国东部时间")}</small><div className="screen-view-switch" role="group" aria-label={t("大屏视图")}><button aria-pressed={view === "overview"} onClick={() => setView("overview")}>{t("预购与交付")}</button><button aria-pressed={view === "operations"} onClick={() => setView("operations")}>{t("出摊与经营")}</button></div></div>
      {view === "operations" ? <SchoolScreenOperations data={l!.followup} marketId={market === "all" ? null : Number(market)} date={l!.date} /> : <>
      <section className="screen-kpis" aria-label={t("今日运营指标")}>
        {[{ label: "今日预购", value: s!.orders, note: "含取消订单", icon: ShoppingBag }, { label: "待确认 / 待交付", value: `${s!.pending} / ${s!.confirmed}`, note: "点击进入现场处理", icon: Clock3, href: operationsUrl(market === "all" ? null : Number(market), l!.date) }, { label: "今日已交付", value: s!.completed, note: "完成自提订单", icon: CheckCircle2 }, { label: "现场收款登记合计", value: money(s!.receipts.cashCents + s!.receipts.cardCents + s!.receipts.snapCents), note: "已登记的小票金额", icon: Wallet }, { label: "今日参与顾客", value: s!.participants, note: "完成订单跨市场去重", icon: Users }, { label: "往日未结订单", value: s!.overdue, note: "下方待办可直达处理", icon: Activity }].map((k) => <article key={k.label} className={`screen-kpi ${k.label === "往日未结订单" && s!.overdue ? "attention" : ""}`}><span>{t(k.label)}<k.icon size={17} /></span><strong>{k.value}</strong>{k.href ? <a href={k.href}>{t(k.note)}<ArrowUpRight size={12} /></a> : <small>{t(k.note)}</small>}</article>)}
      </section>
      <div className="screen-primary-grid"><section className="screen-panel screen-markets"><PanelTitle title="市场运营总览" kicker="MARKET NETWORK" /><div className="screen-market-grid">{l!.markets.slice(marketPage * 4, marketPage * 4 + 4).map((m) => <article key={m.id} className="screen-market-card"><div><h3 title={t(m.name)}>{t(m.name)}</h3><span className={`screen-status ${m.session?.booking === "open" ? "open" : ""}`}>{t(bookingLabels[m.session?.booking ?? (!m.active ? "inactive" : !m.preorders_enabled ? "paused" : "unscheduled")])}</span></div><p>{m.session ? `${m.session.starts_at}–${m.session.ends_at} ET` : t("通过现场运营设置实际场次")}</p><div className="screen-market-numbers"><span><strong>{m.orders}</strong>{t("今日预购")}</span><span><strong>{m.completed}</strong>{t("已交付")}</span><span><strong>{m.available}</strong>{t("可供货商品")}</span><span><strong>{m.vendors}</strong>{t("入驻商户")}</span></div><div className="screen-progress" aria-label={t("{market} 交付进度", { market: t(m.name) })}><i style={{ width: `${m.orders ? m.completed / m.orders * 100 : 0}%` }} /></div><footer><span>{t("待确认 {pending} · 待交付 {confirmed}", { pending: m.pending, confirmed: m.confirmed })}</span><a href={operationsUrl(m.id, l!.date)}>{t("进入处理")}<ArrowUpRight size={13} /></a></footer></article>)}</div>{!l!.markets.length && <Empty text="尚未配置市场，请先在市场设置中新增。" />}{l!.markets.length > 4 && <div className="screen-pagination"><button disabled={marketPage === 0} onClick={() => setMarketPage((n) => n - 1)}>{t("上一页")}</button><span>{marketPage + 1} / {Math.ceil(l!.markets.length / 4)}</span><button disabled={(marketPage + 1) * 4 >= l!.markets.length} onClick={() => setMarketPage((n) => n + 1)}>{t("下一页")}</button></div>}</section>
      <section className="screen-panel screen-trend"><PanelTitle title="预购与履约趋势" kicker="ORDERS OVER TIME" /><p className="screen-caption">{a!.from} — {a!.to} · {t("含取消订单；按当前履约状态汇总")}</p>{a!.summary.orders ? <div className="screen-chart" role="img" aria-label={t("预购与完成订单趋势")}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={a!.timeline} margin={{ top: 20, right: 15, left: -20, bottom: 0 }}><defs><linearGradient id="screen-trend-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#a7d77f" stopOpacity={0.34} /><stop offset="100%" stopColor="#a7d77f" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#ffffff0c" /><XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: "#a9bcb3", fontSize: 11 }} minTickGap={30} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: "#a9bcb3", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ color: "#edf6e9", background: "#1d3730", borderColor: "#456154", borderRadius: 8 }} /><Area isAnimationActive={false} dataKey="orders" name={t("预购订单")} type="linear" stroke="#b9df91" strokeWidth={2} fill="url(#screen-trend-area)" /><Line isAnimationActive={false} dataKey="completed" name={t("已完成订单")} type="linear" stroke="#64cdb2" strokeWidth={2} dot={false} /></ComposedChart></ResponsiveContainer></div> : <Empty text="所选周期暂无订单，真实记录会在这里形成趋势。" />}<div className="screen-trend-totals"><span>{t("周期完成交易额")}<strong>{money(a!.summary.revenueCents)}</strong></span><span>{t("周期去重顾客")}<strong>{a!.summary.participants}</strong></span><span>{t("周期完成率")}<strong>{a!.analytics.current.completionRate === null ? "—" : `${a!.analytics.current.completionRate.toFixed(1)}%`}</strong></span></div><div className="screen-legend"><span><i />{t("预购订单")}</span><span><i />{t("已完成订单")}</span></div></section></div>
      <div className="screen-secondary-grid"><section className="screen-panel"><PanelTitle title="现场收款与食品援助" kicker="PAYMENT RECORDS · TODAY" /><div className="screen-payment-list">{[["现金", s!.receipts.cashCents], ["银行卡", s!.receipts.cardCents], ["SNAP / EBT", s!.receipts.snapCents]].map(([label, amount]) => <div key={label}><span>{t(String(label))}</span><strong>{money(Number(amount))}</strong></div>)}</div><div className="screen-mini-stats"><span>{t("SNAP 付款意向")}<b>{s!.snapIntentOrders}</b></span><span>{t("缺少收款记录的完成单")}<b>{s!.completed - s!.receipts.count}</b></span></div><p className="screen-caption">{t("现场金额仅为登记，不代表银行到账或 EBT 核销；付款意向不计作实收。")}</p></section>
      <section className="screen-panel"><PanelTitle title="畅销商品与库存" kicker="PRODUCTS & SUPPLY" /><div className="screen-inventory"><span>{t("今日可供货")}<b>{s!.available}</b></span><span>{t("低库存商品")}<b>{s!.lowStock}</b></span><span>{t("售罄商品")}<b>{s!.soldOut}</b></span></div><p className="screen-caption">{t("库存为今日已上架商品；各单位数量分别计算。")}</p>{a!.analytics.products.length ? <ol className="screen-rank">{a!.analytics.products.slice(0, 4).map((p, i) => <li key={`${p.productId}:${p.name}:${p.unit}`}><b>{String(i + 1).padStart(2, "0")}</b><span>{t(p.name)}<small>{t(p.vendorName)} · {p.quantity} {t(p.unit)}</small></span><strong>{money(p.revenueCents)}</strong></li>)}</ol> : <Empty text="所选周期暂无完成订单" />}<p className="screen-caption">{t("排行按所选周期的完成交易额排序")}</p></section>
      <section className="screen-panel"><PanelTitle title="运营待办" kicker="ACTION REQUIRED" /><p className="screen-caption">{t("包含全部往日未结单，不受趋势周期限制")}</p>{l!.worklist.length ? <div className="screen-worklist">{l!.worklist.slice(0, 5).map((w) => <a key={`${w.marketId}:${w.date}`} href={operationsUrl(w.marketId, w.date)}><span><strong>{t(w.marketName)}</strong><small>{w.date} · {w.date < l!.date ? t("逾期未结") : t("今日待处理")}</small></span><b>{t("{count} 单", { count: w.count })}<ArrowUpRight size={13} /></b></a>)}</div> : <Empty text="当前没有待处理订单" />}{l!.worklist.length > 5 && <p className="screen-caption">{t("显示最早的 5 组，共 {count} 组待办", { count: l!.worklist.length })}</p>}<a className="screen-text-link" href={operationsUrl(market === "all" ? null : Number(market), l!.date)}>{t("打开现场运营")}<ArrowUpRight size={14} /></a></section></div>
      </>}
      <section className="screen-panel screen-sessions"><PanelTitle title="未来七天的实际场次" kicker="PUBLISHED OPERATIONS" />{l!.sessions.length ? <div className="screen-session-list">{l!.sessions.map((session) => <a key={session.id} href={operationsUrl(session.market_id, session.date, "sessions")}><span>{shortDate(session.date)}</span><strong>{t(session.marketName)}</strong><small>{session.starts_at}–{session.ends_at} ET</small><b className={`screen-status ${session.booking === "open" ? "open" : ""}`}>{t(bookingLabels[session.booking])}</b><small>{t("已接 {count} 单", { count: session.orders })} · {t("每时段 {count} 单", { count: session.capacity })}</small></a>)}</div> : <Empty text="未来七天尚未配置实际场次" />}</section>
      <footer className="screen-footer"><span><Store size={13} />{t("大屏仅显示汇总数据，不展示顾客姓名、联系方式或取货码。")}</span><span>{t("库存与营业设置为当前状态，趋势按自提日期汇总。")}</span></footer>
    </>}
  </div>;
}
function PanelTitle({ title, kicker }: { title: string; kicker: string }) { const { t } = useLanguage(); return <div className="screen-panel-title"><span>{kicker}</span><h2>{t(title)}</h2></div>; }
function Empty({ text }: { text: string }) { const { t } = useLanguage(); return <p className="screen-empty">{t(text)}</p>; }
