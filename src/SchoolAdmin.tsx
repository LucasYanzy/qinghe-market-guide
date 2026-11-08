import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, CircleHelp, Globe2, LoaderCircle, MapPin, RefreshCw, RotateCcw, School, ShoppingBag, Users, Wallet } from "lucide-react";
import { matchesSearch } from "./translations/translate";
import { api, money } from "./api";
import { useLanguage, type Message } from "./i18n";
import type { Page } from "./navigation";
import type { SchoolOverview } from "./types";
import CommunityAtlas, { marketColors } from "./CommunityAtlas";
import { SnapImpact } from "./SnapProgram";
import MarketManagement from "./MarketManagement";
import SchoolDashboard from "./SchoolDashboard";
import SchoolOperations from "./SchoolOperations";
import SchoolWorkflows from './SchoolWorkflows';
import { readReportFilters, reportToday, reportDate, type ReportRange } from "./schoolReports";
import "./school-admin.css";
import { DemoAnalyticsData } from "./browser-demo/Controls";

export default function SchoolAdmin({ page, demo, navigate, refresh, notify }: {
  page: Page; demo: boolean; navigate: (page: Page) => void; refresh: () => void; notify: (message: string) => void;
}) {
  const { t } = useLanguage();
  const [filters, setFilters] = useState(readReportFilters);
  const { range, from, to } = filters;
  const [dateDraft, setDateDraft] = useState({ from, to });
  const [dateError, setDateError] = useState("");
  const [planningOpen, setPlanningOpen] = useState(false);
  const [marketId, setMarketId] = useState<number | null>(() => {
    const value = Number(new URLSearchParams(window.location.search).get("market"));
    return Number.isInteger(value) && value > 0 ? value : null;
  });
  useEffect(() => {
    const restore = () => {
      const value = Number(new URLSearchParams(window.location.search).get("market"));
      setMarketId(Number.isInteger(value) && value > 0 ? value : null);
      const restored = readReportFilters(); setFilters(restored); setDateDraft({ from: restored.from, to: restored.to });
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (marketId) url.searchParams.set("market", String(marketId)); else url.searchParams.delete("market");
    if (range !== "30") url.searchParams.set("range", range); else url.searchParams.delete("range");
    if (range === "custom") { url.searchParams.set("from", from); url.searchParams.set("to", to); }
    else { url.searchParams.delete("from"); url.searchParams.delete("to"); }
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [marketId, page, range, from, to]);
  const [data, setData] = useState<SchoolOverview>();
  const [error, setError] = useState<Message>("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [automatic, setAutomatic] = useState(true);
  const [hidden, setHidden] = useState(() => document.hidden);
  const inFlight = useRef(false), lastAttempt = useRef(0);
  const reload = () => setRevision((r) => r + 1);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    inFlight.current = true; lastAttempt.current = Date.now();
    setLoading(true);
    setError("");
    api<SchoolOverview>(`/admin/overview?range=${range}${marketId ? `&marketId=${marketId}` : ""}${range === "custom" ? `&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : ""}`, { signal: controller.signal })
      .then((d) => { if (current) setData(d); })
      .catch((e: Error) => { if (current) setError(e); })
      .finally(() => { clearTimeout(timeout); if (current) { setLoading(false); inFlight.current = false; } });
    return () => { current = false; clearTimeout(timeout); controller.abort(); inFlight.current = false; };
  }, [range, from, to, revision, marketId]);
  useEffect(() => {
    if (page !== "school") return;
    setHidden(document.hidden);
    let timer: number | undefined;
    const update = () => {
      if (automatic && !document.hidden && !inFlight.current && Date.now() - lastAttempt.current > 1000)
        setRevision(value => value + 1);
    };
    const visibility = () => {
      setHidden(document.hidden); window.clearInterval(timer);
      if (!document.hidden && automatic) { update(); timer = window.setInterval(update, 30000); }
    };
    if (!document.hidden && automatic) timer = window.setInterval(update, 30000);
    document.addEventListener("visibilitychange", visibility); window.addEventListener("focus", update);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("focus", update); };
  }, [automatic, page]);
  const matching = data && data.marketId === marketId && data.range === range && (range !== "custom" || (data.from === from && data.to === to));
  const saved = (message = "市场设置已保存") => { reload(); refresh(); notify(message); };
  const manage = (id: number) => { setMarketId(id); navigate("school-markets"); };
  return <div className={`school-workspace ${page === "school" ? "analytics-workspace" : ""}`}>
    {page === "school" && <DemoAnalyticsData onLoaded={() => { reload(); refresh(); }} />}
    {page === "school" && <div className="analytics-live-toolbar"><span className={error ? "is-stale" : ""}><i/>{t(error ? "更新失败，正在显示上次汇总" : loading ? "正在更新汇总…" : !automatic ? "自动更新已暂停" : hidden ? "页面隐藏，刷新已暂停" : "每 30 秒自动汇总，操作后重新计算")}</span><button type="button" aria-pressed={automatic} onClick={() => { setAutomatic(value => !value); if (!automatic) reload(); }}>{t(automatic ? "暂停自动更新" : "恢复自动更新")}</button></div>}
    <div className="school-toolbar">
      <span className="school-access"><School size={16} />{t("学校管理方")}<span> / </span>{t("跨市场管理")}</span>
      <div>
        {page === "school" && <div className="analytics-quick-periods" role="group" aria-label={t("快捷统计周期")}>{["7", "30", "90"].map((n) => <button key={n} aria-pressed={range === n} onClick={() => { setFilters((f) => ({ ...f, range: n as ReportRange })); setDateError(""); }}>{t("{count} 天", { count: n })}</button>)}</div>}
        <label className="school-range">{t("当前市场")}<select aria-label={t("当前市场")} value={marketId ?? "all"} onChange={(e) => setMarketId(e.target.value === "all" ? null : Number(e.target.value))}>
          <option value="all">{t("全部市场")}</option>{data?.markets.map((m) => <option key={m.id} value={m.id}>{t(m.name)}</option>)}
        </select></label>
        {page !== "school-markets" && page !== "school-operations" && <label className="school-range">{t("统计周期")}
          <select aria-label={t("统计周期")} value={range} onChange={(e) => { setFilters((f) => ({ ...f, range: e.target.value as ReportRange })); setDateError(""); }}>
            <option value="7">{t("最近 7 天")}</option><option value="30">{t("最近 30 天")}</option>
            <option value="90">{t("最近 90 天")}</option><option value="all">{t("全部时间")}</option><option value="custom">{t("自定义日期")}</option>
          </select>
        </label>}
        {page === "school" && (marketId || range !== "30") && <button className="analytics-clear-all" onClick={() => { const dates = { from: reportDate(reportToday(), -29), to: reportToday() }; setMarketId(null); setFilters({ range: "30", ...dates }); setDateDraft(dates); setDateError(""); }}><RotateCcw size={13} />{t("重置全部筛选")}</button>}
        <button className="button" disabled={loading} onClick={reload} aria-label={t("刷新管理数据")}><RefreshCw size={15} />{t("刷新")}</button>
      </div>
    </div>
    {range === "custom" && page !== "school-markets" && page !== "school-operations" && <form className="analytics-date-filter" aria-label={t("自定义统计日期")} onSubmit={(e) => {
      e.preventDefault();
      if (dateDraft.from > dateDraft.to || dateDraft.to > reportToday()) return setDateError("请选择有效的起止日期，结束日期不能晚于今天。");
      if ((Date.parse(dateDraft.to) - Date.parse(dateDraft.from)) / 86400000 >= 366) return setDateError("自定义统计最多支持 366 天。");
      setDateError(""); setFilters((f) => ({ ...f, ...dateDraft }));
    }}><label>{t("开始日期")}<input type="date" required min="1970-01-01" max={reportToday()} value={dateDraft.from} onChange={(e) => setDateDraft((d) => ({ ...d, from: e.target.value }))} /></label><label>{t("结束日期")}<input type="date" required min="1970-01-01" max={reportToday()} value={dateDraft.to} onChange={(e) => setDateDraft((d) => ({ ...d, to: e.target.value }))} /></label><button className="button primary">{t("应用日期范围")}</button>{dateError && <p className="form-error" role="alert">{t(dateError)}</p>}</form>}
    {error && matching && <div className="analytics-refresh-error" role="alert">{t(error)} <button className="text-button" onClick={reload}>{t("重新加载")}</button></div>}
    {error && !matching ? <div className="error-panel" role="alert">{t(error)} <button className="text-button" onClick={reload}>{t("重新加载")}</button></div>
      : !data || !matching ? <div className="loading-panel" role="status"><LoaderCircle className="spin" />{t("正在汇总全盘数据…")}</div>
      : <>
        {data.sampleData && page !== "school" && <div className="analytics-sample"><CircleHelp size={17} /><div><strong>{t("合成演示样本")}</strong><span>{t("当前交易、顾客与付款意向为生成样例，用于评审统计功能，不代表真实运营或 SNAP 核销。")}</span></div></div>}
        {page !== "school-markets" && page !== "school-operations" && <p className="school-period">{t(demo ? "演示数据库" : "运营数据库")} · {data.from ?? t("全部时间")} — {data.to} · {t(page === "school" ? "订单按自提日期、运营收支按发生日期统计，美国东部时间" : "按自提日期统计，美国东部时间")}</p>}
        {page === "school-operations" && <SchoolOperations data={data} selectedMarketId={marketId} refresh={refresh} />}
        {page === 'school-community' && <SchoolWorkflows data={data} marketId={marketId} onSaved={reload} />}
        {page === "school" && <SchoolDashboard onSaved={reload} data={data} navigate={navigate} selectMarket={setMarketId} />}
        {page === "school-vendors" && <Vendors data={data} manage={manage} />}
        {page === "school-impact" && <Impact data={data} selectMarket={setMarketId} manage={manage} planningOpen={planningOpen} setPlanningOpen={setPlanningOpen} />}
        {page === "school-markets" && <MarketManagement data={data} selectedId={marketId} onSelect={setMarketId} onSaved={saved} />}
      </>}
  </div>;
}

function Metric({ label, value, note, icon }: { label: string; value: string | number; note: string; icon: ReactNode }) {
  return <article className="school-metric"><div><span>{label}</span>{icon}</div><strong>{value}</strong><p>{note}</p></article>;
}

function MarketTable({ markets }: { markets: SchoolOverview["markets"] }) {
  const { t } = useLanguage();
  return <div className="school-table-wrap"><table className="school-table"><thead><tr>{["市场 / 社区", "状态", "商户", "预购订单", "已完成订单", "参与顾客", "已完成交易额"].map((label) => <th key={label} scope="col">{t(label)}</th>)}</tr></thead>
    <tbody>{markets.map((m) => <tr key={m.id}><td><strong>{t(m.name)}</strong><small>{t(m.community || "尚未设置服务社区")}</small></td>
      <td><span className={`school-badge ${m.active && m.preorders_enabled ? "" : "muted"}`}>{t(!m.active ? "已停用" : m.preorders_enabled ? "开放预购" : "暂停预购")}</span></td>
      <td>{m.vendors}</td><td>{m.orders}</td><td>{m.completed}</td><td>{m.participants}</td><td>{money(m.revenueCents)}</td></tr>)}</tbody></table>
    {!markets.length && <p className="school-empty">{t("尚未配置市场，请先在市场设置中新增。")}</p>}
  </div>;
}

function Vendors({ data, manage }: { data: SchoolOverview; manage: (id: number) => void }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const vendors = data.vendors.filter((v) => (!data.marketId || v.marketIds.includes(data.marketId) || v.orders > 0 || v.products > 0) && matchesSearch(search, v.name, v.email));
  return <section className="panel"><div className="school-section-heading"><div><span className="eyebrow">VENDOR NETWORK</span><h2>{t("所有商户，一处掌握。")}</h2><p>{t("查看所有商户的商品、履约和交易表现。")}</p></div>
    <label className="school-search">{t("搜索商户")}<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("商户名称或邮箱")} /></label></div>
    <div className="school-table-wrap"><table className="school-table"><thead><tr>{["商户", "所属市场", "今日可预购商品", "预购订单", "已完成订单", "参与顾客", "已完成交易额"].map((label) => <th key={label} scope="col">{t(label)}</th>)}</tr></thead>
      <tbody>{vendors.map((v) => <tr key={v.id}><td><strong>{t(v.name)}</strong><small>{v.email}</small></td><td><div className="vendor-market-chips">{v.marketIds.length ? v.marketIds.map((id) => <button key={id} onClick={() => manage(id)}>{t(data.markets.find((m) => m.id === id)?.name)}<ArrowRight size={11} /></button>) : t("尚未分配市场")}</div></td><td>{v.activeProducts} / {v.products}</td><td>{v.orders}</td><td>{v.completed}</td><td>{v.participants}</td><td>{money(v.revenueCents)}</td></tr>)}</tbody></table></div>
    {!vendors.length && <p className="school-empty">{t(search ? "没有符合搜索条件的商户。" : "尚无商户，入驻后会显示在这里。")}</p>}
    <p className="school-footnote">{t("今日可预购商品仅统计启用且开放预购市场中的当日上架商品。商户交易额按订单商品快照计算。")}</p>
  </section>;
}

function Impact({ data, selectMarket, manage, planningOpen, setPlanningOpen }: { data: SchoolOverview; selectMarket: (id: number | null) => void; manage: (id: number) => void; planningOpen: boolean; setPlanningOpen: (open: boolean) => void }) {
  const { t } = useLanguage();
  const s = data.summary;
  return <>

    <div className="school-metrics">
      <Metric label={t("实际参与顾客")} value={s.participants} note={t(data.marketId ? "当前市场去重，至少完成一次自提" : "跨市场去重，至少完成一次自提")} icon={<Users size={18} />} />
      <Metric label={t("再次参与顾客")} value={s.repeatParticipants} note={t("所选周期完成两笔及以上订单")} icon={<CheckCircle2 size={18} />} />
      <Metric label={t("已完成社区预购")} value={s.completed} note={t("取消和未履约订单不计入")} icon={<ShoppingBag size={18} />} />
      <Metric label={t("支持商户交易额")} value={money(s.revenueCents)} note={t("已完成订单的商品金额")} icon={<Wallet size={18} />} />
    </div>
    <details className="impact-planning" open={planningOpen} onToggle={(e) => setPlanningOpen(e.currentTarget.open)}><summary>{t("查看市场规划示意图")}</summary><p>{t("仅用于规划位置与半径，不作为现场导航、实际覆盖或工作完成凭证。")}</p><CommunityAtlas markets={data.markets} selectedId={data.marketId} onSelect={selectMarket} onManage={manage} /></details>
    <div className="impact-lower-grid"><section className="panel"><div className="panel-heading"><h3>{t("社区参与对比")}</h3><Users size={18} /></div>
      <div className="impact-comparison">{data.markets.map((m, i) => <button key={m.id} onClick={() => selectMarket(m.id)}><span><i style={{ background: marketColors[i % marketColors.length] }} />{t(m.community || m.name)}</span><div><i style={{ width: `${m.participants / Math.max(1, ...data.markets.map((item) => item.participants)) * 100}%`, background: marketColors[i % marketColors.length] }} /></div><strong>{m.participants}</strong></button>)}</div>
      <p className="school-footnote">{t("已完成订单的去重顾客数")}</p></section>
      <section className="panel impact-notes"><span className="eyebrow">UNDERSTANDING THE IMPACT</span><h3>{t("规划范围与实际参与，各有依据。")}</h3><p><MapPin size={17} />{t("服务圆圈来自市场坐标与规划半径，不推算覆盖人口。")}</p><p><Users size={17} />{t("各市场参与人数分别去重，全盘人数跨市场去重，不直接相加。")}</p><p><CircleHelp size={17} />{t("市场连线只表示同属学校的运营网络，不表示道路或运输路线。")}</p></section>
    </div>
    <SnapImpact data={data} manage={manage} />
    <section className="panel"><div className="panel-heading"><h3>{t("各社区的实际参与")}</h3><Globe2 size={18} /></div><MarketTable markets={data.markets.filter((m) => !data.marketId || data.marketId === m.id)} />
      <p className="school-footnote">{t("每个市场的参与人数分别去重；同一顾客可参与多个市场，全盘人数单独去重，不能直接相加。暂无住址、食品援助核销或减碳记录，因此不推算这些影响。")}</p>
    </section>
  </>;
}
