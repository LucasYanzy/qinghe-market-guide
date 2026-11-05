import { useRef, useState } from "react";
import { ArrowDown, ArrowRight, BarChart3, Check, ChevronLeft, ChevronRight, GitCompareArrows, Leaf, RotateCcw, Search, X } from "lucide-react";
import { money } from "./api";
import { useLanguage } from "./i18n";
import { changePercent } from "./schoolReports";
import { matchesSearch, quantityUnit } from "./translations/translate";
import type { ProductPerformance } from "./types";
import "./decision-charts.css";

const metrics = { buyers: "购买人数", revenueCents: "完成交易额", orders: "完成订单数", repeatBuyers: "跨场次复购买家" };
type Metric = keyof typeof metrics;
const identity = (p: ProductPerformance) => JSON.stringify([p.productId, p.marketId, p.vendorId, p.name, p.unit]);
const perUnit = (p: ProductPerformance) => p.quantity ? Math.round(p.revenueCents / p.quantity) : 0;

export default function ProductDemand({ products, previousProducts, compact = false, onExpand }: {
  products: ProductPerformance[]; previousProducts?: ProductPerformance[] | null; compact?: boolean; onExpand?: () => void;
}) {
  const { t, language } = useLanguage();
  const [metric, setMetric] = useState<Metric>("buyers"), [query, setQuery] = useState("");
  const [market, setMarket] = useState("all"), [repeatOnly, setRepeatOnly] = useState(false);
  const [selected, setSelected] = useState(""), [page, setPage] = useState(0);
  const [comparison, setComparison] = useState<string[]>([]), [compareOpen, setCompareOpen] = useState(false);
  const ranking = useRef<HTMLDivElement>(null);
  const sorted = [...products].filter((p) => matchesSearch(query, p.name, p.marketName, p.vendorName)
    && (market === "all" || p.marketId === Number(market)) && (!repeatOnly || p.repeatBuyers > 0))
    .sort((a, b) => b[metric] - a[metric] || b.buyers - a.buyers || identity(a).localeCompare(identity(b)));
  const pageSize = compact ? 5 : 8, pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pages - 1), start = currentPage * pageSize;
  const visible = sorted.slice(start, start + pageSize);
  const active = visible.find((p) => identity(p) === selected) ?? visible[0];
  const compared = comparison.flatMap((id) => { const p = products.find((p) => identity(p) === id); return p ? [p] : []; });
  const markets = [...new Map(products.map((p) => [p.marketId, p.marketName])).entries()];
  const max = sorted[0]?.[metric] ?? 0;
  const format = (value: number) => metric === "revenueCents" ? money(value) : value.toLocaleString(language === "en" ? "en-US" : "zh-CN");
  const reset = () => { setQuery(""); setMarket("all"); setRepeatOnly(false); setPage(0); };
  const toggleCompare = (p: ProductPerformance) => {
    const id = identity(p);
    setComparison((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : ids.length < 3 ? [...ids, id] : ids);
  };
  const prior = active && previousProducts?.find((p) => identity(p) === identity(active));
  const growth = active && prior ? changePercent(active.revenueCents, prior.revenueCents) : null;
  const change = growth === null ? t(prior ? "暂无可比数据" : "上期无完成记录") : `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%`;
  const filtered = !!query || market !== "all" || repeatOnly;
  return <section className={`panel decision-products ${compact ? "is-compact" : ""}`} aria-label={t("商品需求分析")}>
    <div className="decision-heading"><div className="decision-heading-title"><span className="decision-section-icon"><Leaf size={19} /></span><div><span className="eyebrow">PRODUCT INTELLIGENCE</span><h3>{t("哪些菜更受欢迎")}</h3><p>{t("从购买人数到成交价格，找到下一场的备货依据。")}</p></div></div>{onExpand ? <button className="text-button" onClick={onExpand}>{t("查看全部")}<ArrowRight size={15} /></button> : <span className="decision-record-count">{t("{count} 项商品记录", { count: products.length })}</span>}</div>
    <div className="decision-toolbar"><div className="decision-switch" role="group" aria-label={t("商品分析指标")}>{Object.entries(metrics).filter(([key]) => !compact || key !== "repeatBuyers").map(([key, label]) => <button key={key} aria-pressed={metric === key} onClick={() => { setMetric(key as Metric); setPage(0); }}>{t(label)}</button>)}</div>
      {!compact && <label className="decision-search"><Search size={16} /><span className="sr-only">{t("搜索商品分析")}</span><input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder={t("搜索商品、商户或市场")} /></label>}
    </div>
    {!compact && <div className="decision-filterbar"><div>{markets.length > 1 && <select aria-label={t("筛选商品市场")} value={market} onChange={(e) => { setMarket(e.target.value); setPage(0); }}><option value="all">{t("全部市场")}</option>{markets.map(([id, name]) => <option key={id} value={id}>{t(name)}</option>)}</select>}<button className="decision-filter-chip" aria-pressed={repeatOnly} onClick={() => { setRepeatOnly((v) => !v); setPage(0); }}>{repeatOnly && <Check size={13} />}{t("有跨场次复购")}</button>{filtered && <button className="decision-reset" onClick={reset}><RotateCcw size={13} />{t("重置筛选")}</button>}</div><span>{t("点击行查看详情 · 最多对比 3 项")}</span></div>}
    {!compact && compared.length > 0 && <div className="decision-compare-tray"><GitCompareArrows size={17} /><span className="sr-only" role="status">{t("已选择 {count} 项商品", { count: compared.length })}</span><div>{compared.map((p) => <button key={identity(p)} onClick={() => toggleCompare(p)} aria-label={t("移除对比：{name}", { name: t(p.name) })}>{t(p.name)}<X size={12} /></button>)}</div><button className="decision-compare-open" disabled={compared.length < 2} aria-expanded={compareOpen && compared.length >= 2} onClick={() => setCompareOpen((v) => !v)}>{t(compareOpen && compared.length >= 2 ? "收起对比" : "对比 {count} 项", { count: compared.length })}<ArrowRight size={14} /></button><button className="decision-icon-button" aria-label={t("清空对比")} onClick={() => { setComparison([]); setCompareOpen(false); }}><X size={16} /></button></div>}
    {!compact && compareOpen && compared.length >= 2 && <div className="decision-comparison" role="region" aria-label={t("商品对比")}><div className="school-table-wrap"><table><caption>{t("商品对比")} <small>{t("不同单位的交付数量请分别判断。")}</small></caption><thead><tr><th scope="col">{t("指标")}</th>{compared.map((p) => <th scope="col" key={identity(p)}><strong>{t(p.name)}</strong><small>{t(p.marketName)} · {t(p.vendorName)}</small></th>)}</tr></thead><tbody>{[
      ["购买人数", (p: ProductPerformance) => p.buyers], ["完成交易额", (p: ProductPerformance) => money(p.revenueCents)],
      ["完成订单数", (p: ProductPerformance) => p.orders], ["成交均价 / 单位", (p: ProductPerformance) => `${money(perUnit(p))} / ${quantityUnit(language, p.unit, 1)}`],
      ["每单平均购买量", (p: ProductPerformance) => `${(p.quantity / p.orders).toFixed(2)} ${quantityUnit(language, p.unit, p.quantity / p.orders)}`],
      ["跨场次复购买家", (p: ProductPerformance) => `${p.repeatBuyers} / ${p.buyers}`], ["有成交的日期数", (p: ProductPerformance) => p.sellingDays],
    ].map(([label, value]) => <tr key={String(label)}><th scope="row">{t(String(label))}</th>{compared.map((p) => <td key={identity(p)}>{(value as (p: ProductPerformance) => string | number)(p)}</td>)}</tr>)}</tbody></table></div></div>}
    {!visible.length ? <div className="decision-empty"><BarChart3 size={28} /><strong>{t(filtered ? "没有符合条件的商品" : "完成首笔订单后，这里开始记录需求")}</strong><p>{t("仅显示已完成订单；取消和未履约预购不计入。")}</p>{filtered && <button className="text-button" onClick={reset}>{t("重置筛选")}</button>}</div> : <>
      <div className="decision-product-layout"><div className="decision-ranking" ref={ranking} role="group" aria-label={t("商品需求排行")}>
        <div className="decision-ranking-caption"><span>{t("商品 / 市场")}</span><span>{t(metrics[metric])}<ArrowDown size={12} /></span></div>
        {visible.map((p, i) => <div className="decision-ranking-item" key={identity(p)}><button className="decision-bar-row" data-rank-select aria-pressed={identity(active) === identity(p)} onClick={() => setSelected(identity(p))} onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          e.preventDefault(); const index = (i + (e.key === "ArrowDown" ? 1 : -1) + visible.length) % visible.length;
          setSelected(identity(visible[index])); ranking.current?.querySelectorAll<HTMLButtonElement>("[data-rank-select]")[index]?.focus();
        }}>
          <span className="decision-bar-rank">{String(start + i + 1).padStart(2, "0")}</span><span className="decision-bar-content"><span className="decision-bar-name"><strong>{t(p.name)}</strong><b>{format(p[metric])}</b></span><span className="decision-bar-track"><i style={{ width: `${max ? p[metric] / max * 100 : 0}%` }} /></span><small>{t(p.marketName)} · {t(p.vendorName)}</small></span><ChevronRight className="decision-row-chevron" size={15} />
        </button>{!compact && <button className="decision-row-compare" aria-label={t("对比商品：{name}", { name: t(p.name) })} aria-pressed={comparison.includes(identity(p))} disabled={!comparison.includes(identity(p)) && compared.length >= 3} title={t("最多对比 3 项")} onClick={() => toggleCompare(p)}>{comparison.includes(identity(p)) ? <Check size={14} /> : <GitCompareArrows size={14} />}</button>}</div>)}
        {!compact && <div className="decision-pagination"><span role="status">{t("第 {page} / {pages} 页 · {count} 项", { page: currentPage + 1, pages, count: sorted.length })}</span><div><button aria-label={t("上一页商品")} disabled={currentPage === 0} onClick={() => { setPage(currentPage - 1); setSelected(""); }}><ChevronLeft size={16} /></button><button aria-label={t("下一页商品")} disabled={currentPage === pages - 1} onClick={() => { setPage(currentPage + 1); setSelected(""); }}><ChevronRight size={16} /></button></div></div>}
      </div>
      {!compact && active && <aside className="decision-product-detail" aria-label={t("选中商品详情")} aria-live="polite"><div className="decision-detail-topline"><span className="eyebrow">PRODUCT PROFILE</span><span>{t("本期")}</span></div><h4>{t(active.name)}</h4><p>{t(active.marketName)} · {t(active.vendorName)}</p>
        <div className="decision-detail-lead"><span>{t(metrics[metric])}</span><strong>{format(active[metric])}</strong>{previousProducts && <small className={growth !== null && growth < 0 ? "negative" : ""}>{change} <span>{t("成交额较上期")}</span></small>}</div>
        <dl>{[["购买人数", active.buyers], ["完成交易额", money(active.revenueCents)], ["完成订单数", active.orders], ["完成交付数量", `${active.quantity} ${quantityUnit(language, active.unit, active.quantity)}`], ["成交均价 / 单位", `${money(perUnit(active))} / ${quantityUnit(language, active.unit, 1)}`], ["成交单价范围", `${money(active.minPriceCents)}–${money(active.maxPriceCents)}`], ["每单平均购买量", `${(active.quantity / active.orders).toFixed(2)} ${quantityUnit(language, active.unit, active.quantity / active.orders)}`], ["有成交的日期数", active.sellingDays], ["最近成交日期", active.lastSoldOn], ["跨场次复购买家", `${active.repeatBuyers} / ${active.buyers}`]].map(([label, value]) => <div key={String(label)}><dt>{t(String(label))}</dt><dd>{value}</dd></div>)}</dl>
        <button className="decision-detail-compare" aria-pressed={comparison.includes(identity(active))} disabled={!comparison.includes(identity(active)) && compared.length >= 3} onClick={() => toggleCompare(active)}><GitCompareArrows size={15} />{t(comparison.includes(identity(active)) ? "已加入对比" : "加入对比")}</button>
        <p className="decision-detail-note">{t("均价为成交额除以交付数量；成交日期数不代表出摊次数。")}</p>
      </aside>}
      </div>
      <p className="decision-caption">{compact && t("排行显示前 {count} 项，共 {total} 项。", { count: visible.length, total: sorted.length })} {t("按商品、成交市场及原始单位分别比较；买家跨商品不可相加。仅反映平台记录。")}</p>
      {!compact && <details className="decision-data-table"><summary>{t("查看商品数据明细")} <span>{visible.length} / {sorted.length}</span></summary><div className="school-table-wrap"><table className="school-table"><caption className="sr-only">{t("商品数据明细")}</caption><thead><tr>{["商品 / 商户", "成交市场", "购买人数", "完成订单数", "完成交付数量", "已完成交易额", "成交均价 / 单位", "跨场次复购买家"].map((label) => <th key={label} scope="col">{t(label)}</th>)}</tr></thead><tbody>{visible.map((p) => <tr key={identity(p)}><td><strong>{t(p.name)}</strong><small>{t(p.vendorName)}</small></td><td>{t(p.marketName)}</td><td>{p.buyers}</td><td>{p.orders}</td><td>{p.quantity} {quantityUnit(language, p.unit, p.quantity)}</td><td>{money(p.revenueCents)}</td><td>{money(perUnit(p))} / {quantityUnit(language, p.unit, 1)}</td><td>{p.repeatBuyers}</td></tr>)}</tbody></table></div><p className="decision-caption">{t("当前页商品明细；导出 CSV 可查看完整记录。")}</p></details>}
    </>}
  </section>;
}
