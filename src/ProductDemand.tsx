import { useState } from "react";
import { ArrowDown, ArrowRight, BarChart3, Search, Users } from "lucide-react";
import { money } from "./api";
import { useLanguage } from "./i18n";
import { matchesSearch, quantityUnit } from "./translations/translate";
import type { ProductPerformance } from "./types";
import "./decision-charts.css";

const metrics = { buyers: "购买人数", revenueCents: "完成交易额", orders: "完成订单数" };
type Metric = keyof typeof metrics;
const identity = (p: ProductPerformance) => JSON.stringify([p.productId, p.marketId, p.vendorId, p.name, p.unit]);

export default function ProductDemand({ products, compact = false, onExpand }: {
  products: ProductPerformance[]; compact?: boolean; onExpand?: () => void;
}) {
  const { t, language } = useLanguage();
  const [metric, setMetric] = useState<Metric>("buyers");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const sorted = [...products].filter((p) => matchesSearch(query, p.name, p.marketName, p.vendorName))
    .sort((a, b) => b[metric] - a[metric] || b.buyers - a.buyers || identity(a).localeCompare(identity(b)));
  const visible = sorted.slice(0, compact ? 5 : 8);
  const active = visible.find((p) => identity(p) === selected) ?? visible[0];
  const max = visible[0]?.[metric] ?? 0;
  const format = (value: number) => metric === "revenueCents" ? money(value) : value.toLocaleString(language === "en" ? "en-US" : "zh-CN");
  return <section className={`panel decision-products ${compact ? "is-compact" : ""}`} aria-label={t("商品需求分析")}>
    <div className="decision-heading"><div><span className="eyebrow">PRODUCT DEMAND</span><h3>{t("哪些菜更受欢迎")}</h3><p>{t("买的人多，还是单笔买得多？切换指标对照。")}</p></div>{onExpand ? <button className="text-button" onClick={onExpand}>{t("查看全部")}<ArrowRight size={15} /></button> : <BarChart3 size={21} />}</div>
    <div className="decision-toolbar"><div className="decision-switch" role="group" aria-label={t("商品分析指标")}>{Object.entries(metrics).map(([key, label]) => <button key={key} aria-pressed={metric === key} onClick={() => setMetric(key as Metric)}>{t(label)}</button>)}</div>
      {!compact && <label className="decision-search"><Search size={15} /><span className="sr-only">{t("搜索商品分析")}</span><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("搜索商品、商户或市场")} /></label>}
    </div>
    {!visible.length ? <div className="decision-empty"><BarChart3 size={28} /><strong>{t(query ? "没有符合条件的商品" : "完成首笔订单后，这里开始记录需求")}</strong><p>{t("仅显示已完成订单；取消和未履约预购不计入。")}</p></div> : <>
      <div className="decision-product-layout"><div className="decision-ranking" role="group" aria-label={t("商品需求排行")}>
        <div className="decision-ranking-caption"><span>{t("商品 / 市场")}</span><span>{t(metrics[metric])}<ArrowDown size={12} /></span></div>
        {visible.map((p, i) => <button className="decision-bar-row" key={identity(p)} aria-pressed={identity(active) === identity(p)} onClick={() => setSelected(identity(p))}>
          <span className="decision-bar-rank">{String(i + 1).padStart(2, "0")}</span><span className="decision-bar-content"><span className="decision-bar-name"><strong>{t(p.name)}</strong><b>{format(p[metric])}</b></span><span className="decision-bar-track"><i style={{ width: `${max ? p[metric] / max * 100 : 0}%` }} /></span><small>{t(p.marketName)} · {t(p.vendorName)}</small></span>
        </button>)}
      </div>
      {!compact && active && <aside className="decision-product-detail" aria-label={t("选中商品详情")} aria-live="polite"><span className="eyebrow">SELECTED PRODUCT</span><h4>{t(active.name)}</h4><p>{t(active.marketName)} · {t(active.vendorName)}</p>
        <div className="decision-detail-lead"><Users size={19} /><strong>{active.buyers}</strong><span>{t("去重购买账号")}</span></div>
        <dl><div><dt>{t("完成交易额")}</dt><dd>{money(active.revenueCents)}</dd></div><div><dt>{t("完成订单数")}</dt><dd>{active.orders}</dd></div><div><dt>{t("完成交付数量")}</dt><dd>{active.quantity} {quantityUnit(language, active.unit, active.quantity)}</dd></div><div><dt>{t("跨场次复购买家")}</dt><dd>{active.repeatBuyers} / {active.buyers}</dd></div></dl>
        <p className="decision-detail-note">{t("同一场拆单只算一次购买场次。旧订单按市场与自提日期识别场次。")}</p>
      </aside>}
      </div>
      <p className="decision-caption">{t("排行显示前 {count} 项，共 {total} 项。", { count: visible.length, total: sorted.length })} {t("按商品、成交市场及原始单位分别比较；买家跨商品不可相加。仅反映平台记录。")}</p>
      {!compact && <details className="decision-data-table"><summary>{t("查看商品数据明细")} <span>{sorted.length}</span></summary><div className="school-table-wrap"><table className="school-table"><caption className="sr-only">{t("商品数据明细")}</caption><thead><tr>{["商品 / 商户", "成交市场", "购买人数", "完成订单数", "完成交付数量", "已完成交易额", "跨场次复购买家"].map((label) => <th key={label} scope="col">{t(label)}</th>)}</tr></thead><tbody>{sorted.slice(0, 50).map((p) => <tr key={identity(p)}><td><strong>{t(p.name)}</strong><small>{t(p.vendorName)}</small></td><td>{t(p.marketName)}</td><td>{p.buyers}</td><td>{p.orders}</td><td>{p.quantity} {quantityUnit(language, p.unit, p.quantity)}</td><td>{money(p.revenueCents)}</td><td>{p.repeatBuyers}</td></tr>)}</tbody></table></div><p className="decision-caption">{t("明细显示前 50 项；学校商品 CSV 可导出全部记录。")}</p></details>}
    </>}
  </section>;
}
