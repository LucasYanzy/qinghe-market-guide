import { useId, useState } from "react";
import { ArrowRight, Layers3, LocateFixed, MapPin, Minus, Plus, Store, Users } from "lucide-react";
import { money } from "./api";
import { useLanguage } from "./i18n";
import type { SchoolOverview } from "./types";

export const marketColors = ["#51795d", "#be8651", "#7487a6", "#9c7f9f", "#8a9551", "#5c9796"];
type NetworkMarket = SchoolOverview["markets"][number];
export function marketStatus(m: { active: number; preorders_enabled: number }) {
  return !m.active ? "已停用" : m.preorders_enabled ? "开放预购" : "暂停预购";
}

function MarketStall({ color, selected }: { color: string; selected: boolean }) {
  return <g aria-hidden="true">
    <ellipse cy="8" rx="43" ry="15" fill="#244832" opacity="0.12" />
    <path d="M-30,-12 L3,-25 L34,-11 L1,3Z" fill="#f8f5e5" stroke="#b8c5ae" />
    <path d="M-30,-12 L1,3 L1,-28 L-30,-43Z" fill="#f8f6ec" stroke="#d5dbc8" />
    <path d="M1,3 L34,-11 L34,-42 L1,-28Z" fill="#d9e1ce" stroke="#bdccb3" />
    <path d="M-36,-45 L-4,-65 L40,-43 L7,-24Z" fill={color} />
    <path d="M-36,-45 L7,-24 L7,-16 L-36,-37Z" fill={color} />
    <path d="M7,-24 L40,-43 L40,-35 L7,-16Z" fill={color} opacity="0.8" />
    {[-27, -9, 9].map((x) => <path key={x} d={`M${x},${-48 + (x + 27) * 0.5} l8,4 l32,-20 l-8,-4Z`} fill="#fff9e7" opacity="0.82" />)}
    <path d="M-24,-12V-34 M-3,-2V-23 M27,-15V-35" stroke="#49634b" strokeWidth="3" />
    <path d="M-23,-17 L-2,-7 L-2,-13 L-23,-23Z" fill="#d1b278" />
    <circle cx="-17" cy="-22" r="3" fill="#b4c878" /><circle cx="-9" cy="-18" r="3" fill="#d39765" />
    {selected && <><path d="M2,-83 v-23" stroke={color} strokeWidth="2" /><path d="M3,-106 l20,7 l-20,5Z" fill={color} /></>}
  </g>;
}

export default function CommunityAtlas({ markets, selectedId, onSelect, onManage, compact = false }: {
  markets: NetworkMarket[]; selectedId: number | null; onSelect: (id: number | null) => void;
  onManage: (id: number) => void; compact?: boolean;
}) {
  const { t } = useLanguage();
  const uid = useId().replaceAll(":", "");
  const [coverage, setCoverage] = useState(true);
  const [isometric, setIsometric] = useState(true);
  const [zoom, setZoom] = useState(1);
  const selected = markets.find((m) => m.id === selectedId) ?? markets.find((m) => m.active) ?? markets[0];
  const originLat = markets.length ? markets.reduce((n, m) => n + m.latitude, 0) / markets.length : 0;
  const originLon = markets[0]?.longitude ?? 0;
  const positions = markets.map((m, i) => ({ ...m, index: i,
    x: (m.longitude - originLon) * 111.32 * Math.cos(originLat * Math.PI / 180),
    y: -(m.latitude - originLat) * 111.32,
  }));
  const minX = Math.min(0, ...positions.map((m) => m.x - m.coverage_radius_km));
  const maxX = Math.max(1, ...positions.map((m) => m.x + m.coverage_radius_km));
  const minY = Math.min(0, ...positions.map((m) => m.y - m.coverage_radius_km));
  const maxY = Math.max(1, ...positions.map((m) => m.y + m.coverage_radius_km));
  const scale = Math.min(360 / (maxX - minX), 310 / (maxY - minY));
  const project = (x: number, y: number) => {
    const dx = (x - (minX + maxX) / 2) * scale;
    const dy = (y - (minY + maxY) / 2) * scale;
    return isometric ? { x: 465 + dx + dy * 0.65, y: 278 - dx * 0.36 + dy * 0.62 }
      : { x: 465 + dx * 1.3, y: 270 + dy };
  };
  const point = (x: number, y: number) => { const p = project(x, y); return `${p.x},${p.y}`; };
  const corners = isometric ? "100,234 489,74 834,290 444,458" : "160,95 775,95 775,445 160,445";
  const lower = isometric ? "100,234 444,458 834,290 834,310 444,478 100,254" : "160,445 775,445 775,463 160,463";
  const borderColor = selected ? marketColors[markets.findIndex((m) => m.id === selected.id) % marketColors.length] : marketColors[0];
  return <section className={`community-atlas ${compact ? "atlas-compact" : ""}`}>
    <div className="atlas-heading"><div><span className="eyebrow">THE COMMUNITY ATLAS</span><h2>{t("一张地图，看见校园与社区。")}</h2><p>{t("选择一座市场，查看它连接的商户与社区。")}</p></div>
      <span className="atlas-live"><i />{markets.length} {t("个运营市场")}</span></div>
    <div className="atlas-layout"><div className="atlas-stage">
      <div className="atlas-controls"><div className="atlas-view-switch" role="group" aria-label={t("地图视角")}>
        <button aria-pressed={isometric} onClick={() => setIsometric(true)}>2.5D</button><button aria-pressed={!isometric} onClick={() => setIsometric(false)}>{t("俯视")}</button>
      </div><button className={`atlas-layer ${coverage ? "selected" : ""}`} aria-pressed={coverage} onClick={() => setCoverage((v) => !v)}><Layers3 size={15} />{t("服务范围")}</button></div>
      <svg className="atlas-svg" viewBox="0 0 940 550" role="group" aria-label={t("市场规划服务范围示意图")}>
        <title>{t("按市场坐标绘制，点击市场节点查看详情")}</title>
        <defs>
          <linearGradient id={`${uid}-land`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f0f1d8" /><stop offset="1" stopColor="#d9e5cc" /></linearGradient>
          <filter id={`${uid}-shadow`} x="-50%" y="-50%" width="200%" height="220%"><feDropShadow dx="0" dy="15" stdDeviation="13" floodColor="#486441" floodOpacity="0.16" /></filter>
          <clipPath id={`${uid}-clip`}><polygon points={corners} /></clipPath>
        </defs>
        <g transform={`translate(${470 * (1 - zoom)},${275 * (1 - zoom)}) scale(${zoom})`}>
          <g filter={`url(#${uid}-shadow)`}><polygon points={lower} fill="#a9bea0" /><polygon points={corners} fill={`url(#${uid}-land)`} stroke="#cad7b9" /></g>
          <g clipPath={`url(#${uid}-clip)`}>
            {Array.from({ length: 21 }, (_, i) => { const x = 60 + i * 43; return <g key={i} opacity="0.5">
              <path d={isometric ? `M${x},50 l450,500` : `M${x},60 v440`} stroke="#c2d1b4" strokeWidth="1" />
              <path d={isometric ? `M50,${40 + i * 28} l850,-350` : `M120,${60 + i * 25} h700`} stroke="#c2d1b4" strokeWidth="1" />
            </g>; })}
            {coverage && positions.map((m) => { const color = marketColors[m.index % marketColors.length];
              const boundary = Array.from({ length: 64 }, (_, i) => point(m.x + Math.cos(i / 64 * Math.PI * 2) * m.coverage_radius_km, m.y + Math.sin(i / 64 * Math.PI * 2) * m.coverage_radius_km)).join(" ");
              return <g key={m.id} opacity={!m.active ? 0.3 : 1}>
                <polygon points={boundary} fill={color} fillOpacity={selected?.id === m.id ? 0.18 : 0.09} stroke={color} strokeWidth={selected?.id === m.id ? 2 : 1.2} strokeDasharray="5 5" />
              </g>;
            })}
            {positions.length > 1 && <polyline points={positions.map((m) => point(m.x, m.y)).join(" ")} fill="none" stroke="#8fa386" strokeWidth="2" strokeDasharray="4 7" opacity="0.65" />}
          </g>
          {positions.slice().sort((a, b) => project(a.x, a.y).y - project(b.x, b.y).y).map((m) => {
            const p = project(m.x, m.y), color = marketColors[m.index % marketColors.length], isSelected = selected?.id === m.id;
            return <g key={m.id} transform={`translate(${p.x},${p.y})`} role="button" tabIndex={0}
              aria-label={`${t("选择市场")}：${t(m.name)}`} aria-pressed={selectedId === m.id}
              onClick={() => onSelect(m.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(m.id); } }}
              className={`atlas-market-node ${!m.active ? "node-inactive" : ""}`}>
              <circle cy="-25" r="66" fill="transparent" />
              <ellipse cy="6" rx={isSelected ? 54 : 42} ry={isSelected ? 22 : 16} fill="none" stroke={color} strokeWidth={isSelected ? 2 : 0} />
              <g transform={isSelected ? undefined : "scale(0.8)"}><MarketStall color={m.active ? color : "#9ba69b"} selected={isSelected} /></g>
              <g transform="translate(-13,20)"><rect width="26" height="25" rx="8" fill={color} /><text x="13" y="17" fill="white" textAnchor="middle" fontSize="12" fontWeight="600">{String(m.index + 1).padStart(2, "0")}</text></g>
              {isSelected && <text x="0" y="65" textAnchor="middle" fill="#354b34" fontSize="12" fontWeight="600" stroke="#f5f7ed" strokeWidth="4" paintOrder="stroke">{t(m.community || m.name).slice(0, 22)}</text>}
            </g>;
          })}
        </g>
        <g transform="translate(850,418)" fill="#6e8165"><path d="M0,18 V-14 M-6,-6 L0,-16 L6,-6" stroke="currentColor" fill="none" strokeWidth="1.5" /><text y="-25" textAnchor="middle" fontSize="11">N</text><text x="-12" y="43" textAnchor="end" fontSize="10">{t("坐标示意")}</text></g>
        {!markets.length && <text x="470" y="270" textAnchor="middle" fill="#6a8060" fontSize="16">{t("添加市场，建立校园网络")}</text>}
      </svg>
      <div className="atlas-bottom"><span>{t("范围示意 · 非导航地图")}</span><div>
        <button onClick={() => setZoom((v) => Math.max(0.75, v - 0.25))} disabled={zoom <= 0.75} aria-label={t("缩小地图")}><Minus size={16} /></button>
        <button onClick={() => setZoom(1)} aria-label={t("重置地图")}><LocateFixed size={16} /></button>
        <button onClick={() => setZoom((v) => Math.min(1.75, v + 0.25))} disabled={zoom >= 1.75} aria-label={t("放大地图")}><Plus size={16} /></button>
      </div></div>
    </div>
    {selected && <aside className="atlas-detail" style={{ "--market-color": borderColor } as React.CSSProperties}>
      <div className="atlas-detail-kicker"><span>{t("市场档案")}</span><b>{String(markets.findIndex((m) => m.id === selected.id) + 1).padStart(2, "0")}</b></div>
      <span className={`school-badge ${selected.active && selected.preorders_enabled ? "" : "muted"}`}><i />{t(marketStatus(selected))}</span>
      <h3>{t(selected.name)}</h3><p><MapPin size={13} />{t(selected.community || selected.address)}</p>
      <div className="atlas-radius"><strong>{selected.coverage_radius_km}<small> km</small></strong><span>{t("规划服务半径")}</span></div>
      <div className="atlas-detail-stats"><div><Store size={16} /><strong>{selected.vendors}</strong><span>{t("入驻商户")}</span></div><div><Users size={16} /><strong>{selected.participants}</strong><span>{t("实际参与")}</span></div></div>
      <dl><div><dt>{t("已完成订单")}</dt><dd>{selected.completed}</dd></div><div><dt>{t("已完成交易额")}</dt><dd>{money(selected.revenueCents)}</dd></div><div><dt>{t("今日可预购商品")}</dt><dd>{selected.activeProducts}</dd></div>
        <div><dt>SNAP / EBT</dt><dd>{t(selected.snap_status === "accepted" ? "已确认接受" : selected.snap_status === "unavailable" ? "暂不接受" : "尚未确认")}</dd></div></dl>
      <button className="button primary" onClick={() => onManage(selected.id)}>{t("管理此市场")}<ArrowRight size={15} /></button>
      {selectedId !== null && <button className="text-button atlas-show-all" onClick={() => onSelect(null)}>{t("返回全部市场")}</button>}
    </aside>}
    </div>
    <div className="atlas-market-tabs" aria-label={t("市场地图图例")}>{markets.map((m, i) => <button key={m.id} aria-pressed={selectedId === m.id} onClick={() => onSelect(m.id)}>
      <i style={{ background: marketColors[i % marketColors.length] }} /><span>{t(m.name)}</span><small>{m.coverage_radius_km} km</small>
    </button>)}</div>
  </section>;
}
