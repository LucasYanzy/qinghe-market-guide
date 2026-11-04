import { matchesSearch } from "./translations/translate";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Check, CheckCircle2, CircleHelp, LoaderCircle, MapPin, Plus, Search, Settings2, Store, X } from "lucide-react";
import { api } from "./api";
import { useLanguage, type Message } from "./i18n";
import { marketColors, marketStatus } from "./CommunityAtlas";
import SnapProgram from "./SnapProgram";
import type { Market, SchoolOverview } from "./types";

type NetworkMarket = SchoolOverview["markets"][number];
const emptyDraft = { name: "", subtitle: "", address: "", latitude: "", longitude: "", hours: "", description: "", community: "", coverage_radius_km: "3", active: true, preorders_enabled: true };
type Draft = typeof emptyDraft;
function draftFor(m?: Market): Draft {
  return m ? { name: m.name, subtitle: m.subtitle, address: m.address, latitude: String(m.latitude), longitude: String(m.longitude), hours: m.hours, description: m.description,
    community: m.community, coverage_radius_km: String(m.coverage_radius_km), active: !!m.active, preorders_enabled: !!m.preorders_enabled } : { ...emptyDraft };
}

export default function MarketManagement({ data, selectedId, onSelect, onSaved }: {
  data: SchoolOverview; selectedId: number | null; onSelect: (id: number | null) => void; onSaved: (message?: string) => void;
}) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState<number | null>(selectedId ?? data.markets[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [checked, setChecked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Message>("");
  const [tab, setTab] = useState<"settings" | "vendors" | "snap">("settings");
  useEffect(() => { if (selectedId !== null) { setEditing(selectedId); setTab("settings"); } }, [selectedId]);
  const market = data.markets.find((m) => m.id === editing);
  const shown = data.markets.filter((m) => matchesSearch(search, m.name, m.community, m.address)
    && (status === "all" || (status === "enabled" ? !!m.active : status === "paused" ? !!m.active && !m.preorders_enabled : !m.active)));
  const bulk = async (preorders_enabled: boolean) => {
    if (busy || !checked.length) return;
    setBusy(true); setError("");
    try {
      await api("/admin/markets/status", { method: "PATCH", body: JSON.stringify({ ids: checked, preorders_enabled }) });
      setChecked([]); onSaved(preorders_enabled ? "所选市场已开放预购" : "所选市场已暂停预购");
    } catch (e) { setError(e as Error); } finally { setBusy(false); }
  };
  return <>
    <div className="school-section-heading"><div><span className="eyebrow">MARKET OPERATIONS</span><h2>{t("多个市场，一套清晰的管理方式。")}</h2><p>{t("先配置市场，再分配商户；商品、预购与统计各归其位。")}</p></div>
      <button className="button primary" disabled={busy} onClick={() => { setEditing(null); setTab("settings"); }}><Plus size={17} />{t("新增市场")}</button></div>
    <div className="market-steps"><div><b>01</b><span>{t("建立市场")}<small>{t("地址 · 服务范围 · 预购状态")}</small></span></div><ArrowRight size={17} /><div><b>02</b><span>{t("分配商户")}<small>{t("同一商户可入驻多个市场")}</small></span></div><ArrowRight size={17} /><div><b>03</b><span>{t("按市场运营")}<small>{t("商品归属 · 独立统计 · 对比表现")}</small></span></div></div>
    <div className="market-list-toolbar"><label className="market-search"><Search size={16} /><input aria-label={t("搜索市场")} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("搜索名称、社区或地址")} /></label>
      <select aria-label={t("筛选市场状态")} value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">{t("全部状态")}</option><option value="enabled">{t("已启用")}</option><option value="paused">{t("暂停预购")}</option><option value="disabled">{t("已停用")}</option></select>
      <span>{t("共 {0} 个市场", { 0: shown.length })}</span></div>
    {!!checked.length && <div className="market-bulk"><span><Check size={16} />{t("已选择 {0} 个市场", { 0: checked.length })}</span><button disabled={busy} onClick={() => void bulk(false)}>{t("批量暂停预购")}</button><button disabled={busy} onClick={() => void bulk(true)}>{t("批量开放预购")}</button><button disabled={busy} onClick={() => setChecked([])} aria-label={t("清空市场选择")}><X size={16} /></button></div>}
    {error && <p className="form-error" role="alert">{t(error)}</p>}
    <div className="market-portfolio">{shown.map((m) => <article className={`market-portfolio-card ${editing === m.id ? "selected" : ""}`} key={m.id}
      style={{ "--market-color": marketColors[data.markets.findIndex((item) => item.id === m.id) % marketColors.length] } as React.CSSProperties}>
      <div className="market-card-top"><span className={`school-badge ${m.active && m.preorders_enabled ? "" : "muted"}`}>{t(marketStatus(m))}</span>
        <label className="market-check"><input type="checkbox" disabled={busy} aria-label={`${t("批量选择")} ${t(m.name)}`} checked={checked.includes(m.id)} onChange={(e) => setChecked((ids) => e.target.checked ? [...ids, m.id] : ids.filter((id) => id !== m.id))} /></label></div>
      <button className="market-card-main" disabled={busy} aria-pressed={editing === m.id} onClick={() => { setEditing(m.id); setTab("settings"); }}>
        <span className="market-card-icon"><Store size={27} /></span><h3>{t(m.name)}</h3><p><MapPin size={12} />{t(m.community || m.address)}</p>
        <div className="market-card-counts"><span><strong>{m.vendors}</strong>{t("商户")}</span><span><strong>{m.activeProducts}</strong>{t("今日商品")}</span><span><strong>{m.orders}</strong>{t("预购")}</span></div>
        <span className="market-card-action">{t("管理市场")}<ArrowRight size={15} /></span>
      </button>
    </article>)}</div>
    {!shown.length && <p className="school-empty">{t("没有符合条件的市场，可修改筛选或新增市场。")}</p>}
    <section className="panel market-detail-panel" id="market-detail-panel">
      <div className="school-section-heading"><div><span className="eyebrow">{market ? `MARKET ${String(data.markets.findIndex((m) => m.id === market.id) + 1).padStart(2, "0")}` : "NEW MARKET"}</span><h2>{t(market?.name ?? "新增市场")}</h2></div>
        {market && <button className="text-button" onClick={() => onSelect(market.id)}>{t("设为当前统计市场")}<ArrowRight size={15} /></button>}</div>
      <div className="market-detail-tabs" role="tablist" aria-label={t("市场管理分区")}>
        <button role="tab" aria-selected={tab === "settings"} aria-controls="market-settings-content" onClick={() => setTab("settings")}><Settings2 size={15} />{t("基础设置")}</button>
        <button role="tab" aria-selected={tab === "vendors"} aria-controls="market-vendors-content" disabled={!market} onClick={() => setTab("vendors")}><Store size={15} />{t("入驻商户")}{market && <span>{market.vendors}</span>}</button>
        <button role="tab" aria-selected={tab === "snap"} aria-controls="market-snap-content" disabled={!market} onClick={() => setTab("snap")}>SNAP / EBT</button>
      </div>
      {tab === "settings" ? <div role="tabpanel" id="market-settings-content"><MarketEditor key={`${market?.id ?? "new"}:${market?.active}:${market?.preorders_enabled}`} market={market} onSaved={(m) => { setEditing(m.id); onSaved(); }} /></div>
        : market && (tab === "vendors" ? <div role="tabpanel" id="market-vendors-content"><VendorAssignments key={market.id} market={market} vendors={data.vendors} onSaved={onSaved} /></div>
          : <div role="tabpanel" id="market-snap-content"><SnapProgram key={market.id} market={market} vendors={data.vendors} onSaved={onSaved} /></div>)}
    </section>
  </>;
}

function MarketEditor({ market, onSaved }: { market?: NetworkMarket; onSaved: (market: Market) => void }) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<Draft>(() => draftFor(market));
  const [busy, setBusy] = useState(false), [error, setError] = useState<Message>("");
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      const saved = await api<Market>(market ? `/admin/markets/${market.id}` : "/admin/markets", { method: market ? "PUT" : "POST", body: JSON.stringify({ ...draft,
        latitude: Number(draft.latitude), longitude: Number(draft.longitude), coverage_radius_km: Number(draft.coverage_radius_km) }) });
      setDraft(draftFor(saved)); onSaved(saved);
    } catch (e) { setError(e as Error); } finally { setBusy(false); }
  };
  return <form className="form-stack" onSubmit={save} aria-label={t("市场设置表单")}><fieldset className="form-fields form-stack" disabled={busy}>
    <div className="market-editor-layout"><div className="market-editor-fields">
      <div className="market-form-pair"><label>{t("市场名称")}<input required maxLength={100} value={t(draft.name)} onChange={(e) => set("name", e.target.value)} /></label>
      <label>{t("服务社区")}<input maxLength={150} placeholder={t("例如：Rutgers 校园 / North Brunswick")} value={t(draft.community)} onChange={(e) => set("community", e.target.value)} /></label></div>
      <label>{t("市场副标题")}<input maxLength={150} value={t(draft.subtitle)} onChange={(e) => set("subtitle", e.target.value)} /></label>
      <label>{t("市场地址")}<input required maxLength={250} value={draft.address} onChange={(e) => set("address", e.target.value)} /></label>
      <label>{t("营业与自提说明")}<input required maxLength={200} value={t(draft.hours)} onChange={(e) => set("hours", e.target.value)} /></label>
      <div className="school-form-row"><label>{t("纬度")}<input type="number" required step="any" min={-85} max={85} value={draft.latitude} onChange={(e) => set("latitude", e.target.value)} /></label>
        <label>{t("经度")}<input type="number" required step="any" min={-180} max={180} value={draft.longitude} onChange={(e) => set("longitude", e.target.value)} /></label>
        <label>{t("规划半径（km）")}<input type="number" required step="0.1" min={0.1} max={100} value={draft.coverage_radius_km} onChange={(e) => set("coverage_radius_km", e.target.value)} /></label></div>
      <label>{t("市场介绍")}<textarea rows={3} maxLength={1000} value={t(draft.description)} onChange={(e) => set("description", e.target.value)} /></label>
    </div><aside className="market-editor-aside"><span className="eyebrow">OPERATION CONTROLS</span>
      <label className="school-toggle"><span><strong>{t("启用市场")}</strong><small>{t("停用后隐藏该市场的可预购商品，保留历史数据。")}</small></span><input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} /></label>
      <label className="school-toggle"><span><strong>{t("接受新预购")}</strong><small>{t("关闭后阻止新订单，已有订单仍可履约。")}</small></span><input type="checkbox" checked={draft.preorders_enabled} onChange={(e) => set("preorders_enabled", e.target.checked)} /></label>
      <p className="school-method"><CircleHelp size={16} />{t("运营设置不覆盖官网目录。服务半径为规划范围，营业说明不自动生成自提时段。")}</p>
      {!market && <p className="school-footnote">{t("保存后，在「入驻商户」中分配商户，商户即可在上架时选择此市场。")}</p>}
    </aside></div>
    {error && <p className="form-error" role="alert">{t(error)}</p>}
    <div className="market-editor-footer"><span>{t("市场、商品与历史订单分别记录，调整设置会保留历史。")}</span><button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />}{t(busy ? "正在保存…" : "保存市场设置")}</button></div>
  </fieldset></form>;
}

function VendorAssignments({ market, vendors, onSaved }: { market: Market; vendors: SchoolOverview["vendors"]; onSaved: (message?: string) => void }) {
  const { t } = useLanguage();
  const assigned = vendors.filter((v) => v.marketIds.includes(market.id)).map((v) => v.id);
  const assignmentKey = assigned.join(",");
  const [ids, setIds] = useState(assigned), [busy, setBusy] = useState(false), [error, setError] = useState<Message>("");
  useEffect(() => { setIds(assignmentKey ? assignmentKey.split(",").map(Number) : []); }, [assignmentKey]);
  const removed = assigned.filter((id) => !ids.includes(id));
  const save = async () => {
    setBusy(true); setError("");
    try { await api(`/admin/markets/${market.id}/vendors`, { method: "PUT", body: JSON.stringify({ vendorIds: ids }) }); onSaved("商户入驻已保存"); }
    catch (e) { setError(e as Error); } finally { setBusy(false); }
  };
  return <div className="market-vendor-manager"><div><h3>{t("为这座市场选择入驻商户")}</h3><p>{t("商户可以同时入驻多个市场，每份商品只属于一个市场。")}</p></div>
    <div className="market-vendor-choices">{vendors.map((v) => <label key={v.id} className={ids.includes(v.id) ? "selected" : ""}>
      <span className="vendor-choice-avatar"><Store size={20} /></span><span><strong>{t(v.name)}</strong><small>{v.email}</small></span>
      <input type="checkbox" disabled={busy} aria-label={`${t("分配商户")} ${t(v.name)}`} checked={ids.includes(v.id)} onChange={(e) => setIds((current) => e.target.checked ? [...current, v.id] : current.filter((id) => id !== v.id))} />
    </label>)}</div>
    {!vendors.length && <p className="school-empty">{t("尚无商户，入驻后会显示在这里。")}</p>}
    {!!removed.length && <p className="school-method"><CircleHelp size={16} />{t("移出商户会将其在本市场的商品下架；已有订单仍可履约，历史数据保留。重新入驻后需手动上架。")}</p>}
    {error && <p className="form-error" role="alert">{t(error)}</p>}
    <div className="market-editor-footer"><span>{t("已选择 {0} 家商户", { 0: ids.length })}</span><button className="button primary" disabled={busy} onClick={() => void save()}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{t("保存商户入驻")}</button></div>
  </div>;
}
