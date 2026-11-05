import { useEffect, useState } from "react";
import { api } from "./api";
import { useLanguage, type Message } from "./i18n";
import ProductDemand from "./ProductDemand";
import type { ProductPerformance } from "./types";

export default function VendorAnalytics({ revision }: { revision: number }) {
  const { t } = useLanguage();
  const [range, setRange] = useState("30");
  const [result, setResult] = useState<{ from: string; to: string; products: ProductPerformance[]; sampleData: boolean }>();
  const [error, setError] = useState<Message>("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setResult(undefined); setError("");
    api<NonNullable<typeof result>>(`/retailer/analytics?range=${range}`).then((value) => { if (!cancelled) setResult(value); })
      .catch((e) => { if (!cancelled) setError(e); });
    return () => { cancelled = true; };
  }, [range, revision, retry]);
  return <div className="vendor-decision-analytics"><div className="decision-period"><div><h3>{t("用真实购买记录安排下一次备货")}</h3><p>{result ? `${result.from} — ${result.to} · America/New_York` : t("按自提日期汇总")}</p></div><label>{t("商品分析周期")}<select aria-label={t("商品分析周期")} value={range} onChange={(e) => setRange(e.target.value)}><option value="7">{t("最近 7 天")}</option><option value="30">{t("最近 30 天")}</option><option value="90">{t("最近 90 天")}</option></select></label></div>
    {error ? <div className="error-panel" role="alert">{t(error)}<button className="text-button" onClick={() => setRetry((n) => n + 1)}>{t("重新加载")}</button></div> : !result ? <p className="decision-loading" role="status">{t("正在汇总经营数据…")}</p> : <>{result.sampleData && <p className="decision-source-note">{t("合成演示样本，不代表真实销量。")}</p>}<ProductDemand key={range} products={result.products} /></>}
  </div>;
}
