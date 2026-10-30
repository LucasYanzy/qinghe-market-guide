import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, BarChart3, ChevronDown, LoaderCircle, TrendingUp, Wallet } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, money, shortDate } from "./api";
import { useLanguage, type Message } from "./i18n";
import type { PriceData, Product } from "./types";
import ReferencePrices from "./ReferencePrices";
import Stat from "./Stat";

function Empty({ title, text }: { title: string; text: string; icon?: unknown }) {
  return <div className="empty-state"><div className="empty-icon"><BarChart3 /></div><h3>{title}</h3><p>{text}</p></div>;
}

export default function Prices({
  products,
  revision,
}: {
  products: Product[];
  revision: number;
}) {
  const { t } = useLanguage();
  const [view, setView] = useState<"archive" | "forecast">("archive");
  return (
    <>
      <div className="category-tabs price-view-tabs" aria-label={t("价格资料类型")}>
        <button
          className={view === "archive" ? "selected" : ""}
          onClick={() => setView("archive")}
        >{t("Externship 采价档案")}</button>
        <button
          className={view === "forecast" ? "selected" : ""}
          onClick={() => setView("forecast")}
        >{t("演示价格趋势与预测")}</button>
      </div>
      {view === "archive" ? (
        <ReferencePrices />
      ) : (
        <ForecastPrices products={products} revision={revision} />
      )}
    </>
  );
}

function ForecastPrices({
  products,
  revision,
}: {
  products: Product[];
  revision: number;
}) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState(products[0]?.id ?? 0);
  const [data, setData] = useState<PriceData>();
  const [error, setError] = useState<Message>("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setBusy(true);
    setError("");
    api<PriceData>(`/products/${selected}/prices`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e as Error);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, revision]);
  if (!products.length)
    return (
      <Empty
        icon={<BarChart3 />}
        title={t("还没有可观察的价格")}
        text={t("商品上架后，可以查看已记录的历史价格与预测。")}
      />
    );
  const first = data?.history[0]?.price_cents ?? 0;
  const latest = data?.history.at(-1)?.price_cents ?? 0;
  const change = first ? ((latest - first) / first) * 100 : 0;
  const chart: {
    date: string;
    actual?: number;
    predicted?: number;
    range?: [number, number];
  }[] =
    data?.history.map((h) => ({ date: h.date, actual: h.price_cents / 100 })) ??
    [];
  if (data?.forecast.points.length) {
    chart[chart.length - 1] = {
      ...chart[chart.length - 1],
      predicted: latest / 100,
    };
    chart.push(
      ...data.forecast.points.map((p) => ({
        date: p.date,
        predicted: p.price_cents / 100,
        range: [p.low_cents / 100, p.high_cents / 100] as [number, number],
      })),
    );
  }
  return (
    <>
      <div className="price-toolbar">
        <div className="price-selector">
          <span>{t("选择观察蔬菜")}</span>
          <select
            aria-label={t("选择观察蔬菜")}
            value={selected}
            onChange={(e) => setSelected(Number(e.target.value))}
          >
            {products.map((p) => (
              <option value={p.id} key={p.id}>
                {t("{product} · 每{unit}", { product: t(p.name), unit: { unit: p.unit, count: 1 } })}
              </option>
            ))}
          </select>
          <ChevronDown size={16} />
        </div>
        <span className="helper-text">{t("价格单位：美元（USD） / 商品标示单位")}</span>
      </div>
      {error ? (
        <div className="error-panel" role="alert">
          {t(error)}
          <button
            className="text-button"
            onClick={() => setSelected(products[0].id)}
          >{t("查看首个商品")}</button>
        </div>
      ) : busy ? (
        <div className="loading-panel">
          <LoaderCircle className="spin" />{t("正在分析价格记录…")}</div>
      ) : (
        data && (
          <>
            <div className="stat-grid price-stat-grid">
              <Stat
                label={t("当前售价")}
                value={money(data.product.price_cents)}
                note={t("每{0} · 最新记录 {1}", {0: { unit: data.product.unit, count: 1 }, 1: t(shortDate(data.history.at(-1)?.date ?? ""))})}
                icon={<Wallet />}
              />
              <Stat
                label={t("历史期间变化")}
                value={`${change > 0 ? "+" : ""}${change.toFixed(1)}%`}
                note={t("对比 {0} 首条记录", {0: t(shortDate(data.history[0]?.date ?? ""))})}
                icon={change > 0 ? <ArrowUpRight /> : <ArrowDownRight />}
              />
              <Stat
                label={t("7 天后预测")}
                value={
                  data.forecast.points.length
                    ? money(data.forecast.points.at(-1)!.price_cents)
                    : "数据不足"
                }
                note={t("模型估算，不代表实际成交价")}
                icon={<TrendingUp />}
              />
              <Stat
                label={t("回测平均绝对误差")}
                value={
                  data.forecast.maeCents !== null
                    ? money(data.forecast.maeCents)
                    : "—"
                }
                note={t("{0} 条历史记录 · 滚动单步回测", {0: data.forecast.sampleSize})}
                icon={<BarChart3 />}
              />
            </div>
            <section className="panel chart-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">A CLEARER VIEW OF FRESHNESS</span>
                  <h2>{t("{product} · 价格走势", { product: t(data.product.name) })}</h2>
                </div>
                <div className="chart-legend">
                  <span>
                    <i />{t("历史价格")}</span>
                  <span>
                    <i className="predicted" />{t("趋势预测")}</span>
                </div>
              </div>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chart}
                    margin={{ top: 20, right: 18, left: 0, bottom: 12 }}
                  >
                    <defs>
                      <linearGradient
                        id="priceFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#718b67"
                          stopOpacity={0.2}
                        />
                        <stop
                          offset="100%"
                          stopColor="#718b67"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      vertical={false}
                      stroke="#eceee6"
                      strokeDasharray="4 4"
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={shortDate}
                      tick={{ fontSize: 11, fill: "#8a9084" }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={35}
                    />
                    <YAxis
                      tickFormatter={(v) => `$${v}`}
                      tick={{ fontSize: 11, fill: "#8a9084" }}
                      axisLine={false}
                      tickLine={false}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      labelFormatter={(v) => `${v}`}
                      formatter={(value, name) => [
                        Array.isArray(value)
                          ? `${money(Number(value[0]) * 100)} – ${money(Number(value[1]) * 100)}`
                          : money(Number(value) * 100),
                        name === "actual"
                          ? t("历史价格")
                          : name === "range"
                            ? t("估计区间")
                            : t("趋势预测"),
                      ]}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #e6e9df",
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="range"
                      fill="#e4c9a3"
                      fillOpacity={0.25}
                      stroke="none"
                    />
                    <Area
                      type="monotone"
                      dataKey="actual"
                      stroke="#53764f"
                      strokeWidth={2.5}
                      fill="url(#priceFill)"
                    />
                    <Line
                      type="monotone"
                      dataKey="predicted"
                      stroke="#c7975a"
                      strokeWidth={2.5}
                      strokeDasharray="6 5"
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="forecast-note">
                <TrendingUp size={19} />
                <div>
                  <strong>{t(data.forecast.method)}</strong>
                  <p>
                    {t(data.forecast.message)}{t(" ")}{t("演示模式下的历史记录为生成的示例数据。")}</p>
                </div>
              </div>
            </section>
            <section className="panel forecast-table">
              <div className="panel-heading">
                <h3>{t("未来 7 天参考价格")}</h3>
                <span className="muted">{t("含模型估计区间")}</span>
              </div>
              {data.forecast.points.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{t("日期")}</th>
                        <th>{t("参考价格 / ")}{t(data.product.unit)}</th>
                        <th>{t("估计区间")}</th>
                        <th>{t("相对当前售价")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.forecast.points.map((p) => (
                        <tr key={p.date}>
                          <td>{t(p.date)}</td>
                          <td>
                            <strong>{t(money(p.price_cents))}</strong>
                          </td>
                          <td>
                            {t(money(p.low_cents))} – {t(money(p.high_cents))}
                          </td>
                          <td>
                            <span
                              className={
                                p.price_cents <= latest
                                  ? "trend-down"
                                  : "trend-up"
                              }
                            >
                              {t(p.price_cents > latest ? "+" : "")}
                              {t(money(p.price_cents - latest))}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="helper-text">{t("积累至少 7 天的价格记录后显示预测结果。")}</p>
              )}
            </section>
          </>
        )
      )}
    </>
  );
}
