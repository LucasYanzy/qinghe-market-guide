import { useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { money } from "./api";
import { useLanguage } from "./i18n";
import type { SchoolOverview } from "./types";
import "./decision-charts.css";

export default function MarketComparison({ data, selectMarket }: { data: SchoolOverview; selectMarket: (id: number | null) => void }) {
  const { t } = useLanguage();
  const [metric, setMetric] = useState<"revenueCents" | "orders" | "participants">("orders");
  const markets = [...data.markets].sort((a, b) => b[metric] - a[metric] || a.id - b.id);
  const max = markets[0]?.[metric] ?? 0;
  return <section className="panel decision-market-comparison"><div className="decision-heading"><div><span className="eyebrow">MARKET COMPARISON</span><h3>{t("跨市场经营对比")}</h3><p>{t("保留总订单，也看购买人数与成交额。")}</p></div><select aria-label={t("市场对比排序")} value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)}><option value="orders">{t("按预购订单")}</option><option value="participants">{t("按参与顾客")}</option><option value="revenueCents">{t("按完成交易额")}</option></select></div>
    <div className="market-selection-status"><span>{t(data.markets.find((m) => m.id === data.marketId)?.name ?? "全部市场")} · {t("点击市场查看详情")}</span>{data.marketId && <button onClick={() => selectMarket(null)}><X size={13} />{t("全部市场")}</button>}</div><div className="decision-markets">{markets.map((m, i) => <button key={m.id} className="decision-market-row" aria-pressed={m.id === data.marketId} onClick={() => selectMarket(m.id === data.marketId ? null : m.id)}><span className="decision-market-index">{String(i + 1).padStart(2, "0")}</span><span className="decision-market-content"><span className="decision-market-title"><strong>{t(m.name)}</strong><b>{metric === "revenueCents" ? money(m[metric]) : m[metric]}</b><ArrowUpRight size={15} /></span><span className="decision-market-track"><i style={{ width: `${max ? m[metric] / max * 100 : 0}%` }} /></span><span className="decision-market-meta"><span>{t("预购订单")} <b>{m.orders}</b></span><span>{t("购买人数")} <b>{m.participants}</b></span><span>{t("完成交易额")} <b>{money(m.revenueCents)}</b></span></span></span></button>)}</div>
    {!markets.length && <p className="decision-empty">{t("尚未配置市场，请先在市场设置中新增。")}</p>}
    <p className="decision-caption">{t("同一日期范围的总量对比。实际营业小时尚未采集，不能据此判断经营效率；预购含取消，买家仅计完成订单。")}</p>
  </section>;
}
