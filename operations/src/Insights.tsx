import { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ReferenceLine,
} from "recharts";
import {
  type Session,
  type Inventory,
  totalCosts,
  costKeys,
} from "../shared/domain.ts";
import { performance } from "../shared/analytics.ts";
type T = (en: string, cn: string) => string;
const usd = (v: number | null) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(v / 100);
const palette = ["#315c48", "#94b29d", "#db9c46", "#9f7770", "#a5a6c3"];
export function Insights({ rows, t }: { rows: Session[]; t: T }) {
  const sites = performance(rows),
    held = rows.filter((s) => s.status === "held"),
    complete = held.filter((s) => totalCosts(s) !== null);
  const chart = sites.map((s) => ({
    ...s,
    cohortSales: s.cohortSales / 100,
    cohortCosts: s.cohortCosts / 100,
    contribution: s.contribution == null ? null : s.contribution / 100,
  }));
  return (
    <section className="card insights-card">
      <div className="card-head">
        <div>
          <h2>
            {t("Market performance & data quality", "点位表现与数据完整度")}
          </h2>
          <p>
            {t(
              "Contribution uses only held sessions with all four cost categories recorded. Both sales and costs use that same cohort.",
              "场次贡献仅使用四类成本完整的已开市场次，销售与成本使用同一组记录。",
            )}
          </p>
        </div>
      </div>
      <div className="insight-grid">
        <div>
          <div className="quality-head">
            <strong>
              {complete.length} / {held.length}
            </strong>
            <span>
              {t("held sessions with complete costs", "个已开市场次成本完整")}
            </span>
          </div>
          <progress
            aria-label={t("Cost completeness", "成本完整度")}
            value={complete.length}
            max={Math.max(1, held.length)}
          />
          <ul className="quality-list">
            {costKeys.map((k) => (
              <li key={k}>
                <span>
                  {
                    {
                      produce: t("Produce consumed", "商品耗用"),
                      labor: t("Labor", "人工"),
                      transport: t("Transport", "运输"),
                      other: t("Other costs", "其他成本"),
                    }[k]
                  }
                </span>
                <b>
                  {held.filter((s) => s.costs[k] === null).length}{" "}
                  {t("missing", "项待补")}
                </b>
              </li>
            ))}
          </ul>
          <p className="form-help">
            {t(
              "Unknown costs stay unavailable. Cancelled sessions and their known costs are listed separately in the Excel report.",
              "未知成本保持未知。取消场次及其已知成本另列于 Excel 报表。",
            )}
          </p>
        </div>
        <div role="img" aria-label="Complete-cost market comparison">
          <ResponsiveContainer width="100%" height={265}>
            <BarChart data={chart} margin={{ left: 4, right: 10, bottom: 10 }}>
              <CartesianGrid vertical={false} stroke="#e9ece6" />
              <XAxis
                dataKey="market"
                tickFormatter={(v) =>
                  v.length > 17 ? v.slice(0, 17) + "…" : v
                }
                tick={{ fontSize: 11 }}
              />
              <YAxis tickFormatter={(v) => "$" + v} width={65} />
              <Tooltip formatter={(v: any) => "$" + Number(v).toFixed(2)} />
              <Legend />
              <ReferenceLine y={0} stroke="#888" />
              <Bar
                isAnimationActive={false}
                dataKey="cohortSales"
                name={t("Cohort sales", "完整成本组销售")}
                fill={palette[0]}
              />
              <Bar
                isAnimationActive={false}
                dataKey="cohortCosts"
                name={t("Cohort costs", "完整成本组成本")}
                fill={palette[1]}
              />
              <Bar
                isAnimationActive={false}
                dataKey="contribution"
                name={t("Contribution", "场次贡献")}
                fill={palette[2]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {[
                t("Market", "点位"),
                t("Held", "开市场次"),
                t("All sales", "全部销售"),
                t("Cost-complete", "成本完整"),
                t("Cohort sales", "完整组销售"),
                t("Cohort costs", "完整组成本"),
                t("Contribution", "贡献"),
                t("Basket*", "每笔金额*"),
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.market}>
                <td>{s.market}</td>
                <td>{s.sessions}</td>
                <td>{usd(s.sales)}</td>
                <td>
                  {s.complete} / {s.sessions}
                </td>
                <td>{s.complete ? usd(s.cohortSales) : "—"}</td>
                <td>{s.complete ? usd(s.cohortCosts) : "—"}</td>
                <td className={(s.contribution ?? 0) < 0 ? "negative" : ""}>
                  {usd(s.contribution)}
                </td>
                <td>{usd(s.basket)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="form-help">
        {t(
          "*Basket = sales from sessions with a known transaction count / their transactions. Missing transaction counts are excluded from both sides.",
          "*每笔金额 = 已知交易笔数场次的销售 ÷ 这些场次的交易笔数，分子分母同时排除笔数未知场次。",
        )}
      </p>
    </section>
  );
}
export function InventoryVisuals({ rows, t }: { rows: Inventory[]; t: T }) {
  const [id, setId] = useState("");
  const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  const r = rows.find((r) => r.id === id) ?? sorted[0];
  if (!r) return null;
  const labels = {
    sold: t("Sold", "售出"),
    donated: t("Donated", "捐赠"),
    spoiled: t("Spoiled", "损耗"),
    transferred: t("Transferred out", "调出"),
    closing: t("Closing", "期末"),
  };
  const flow = (Object.keys(labels) as (keyof typeof labels)[]).map((k, i) => ({
    name: labels[k],
    value: r[k],
    color: palette[i],
  }));
  const available = r.opening + r.received;
  const groups = new Map<
    string,
    {
      name: string;
      unit: string;
      sold: number;
      spoiled: number;
      donated: number;
      transferred: number;
    }
  >();
  for (const s of rows) {
    const key =
        s.product.trim().toLowerCase() + "\u001f" + s.unit.trim().toLowerCase(),
      g = groups.get(key) ?? {
        name: s.product,
        unit: s.unit,
        sold: 0,
        spoiled: 0,
        donated: 0,
        transferred: 0,
      };
    for (const k of ["sold", "spoiled", "donated", "transferred"] as const)
      g[k] += s[k];
    groups.set(key, g);
  }
  return (
    <section className="card inventory-visuals">
      <div className="card-head">
        <div>
          <h2>{t("Where the stock went", "库存去向")}</h2>
          <p>
            {t(
              "One measured product, unit and session at a time.",
              "按单个商品、单位和场次查看实测流向。",
            )}
          </p>
        </div>
        <select
          aria-label="Inventory chart record"
          value={r.id}
          onChange={(e) => setId(e.target.value)}
        >
          {sorted.map((s) => (
            <option key={s.id} value={s.id}>
              {s.date} · {s.market} · {s.session} · {s.product} / {s.unit}
            </option>
          ))}
        </select>
      </div>
      <div className="insight-grid">
        <div>
          <div className="quality-head">
            <strong>
              {available.toLocaleString()} {r.unit}
            </strong>
            <span>
              {r.product} · {t("opening + received", "期初 + 入库")}
            </span>
          </div>
          <ul className="quality-list">
            {flow.map((f) => (
              <li key={f.name}>
                <span>
                  <i className="legend-dot" style={{ background: f.color }} />
                  {f.name}
                </span>
                <b>
                  {f.value} {r.unit}{" "}
                  {available
                    ? "(" + ((f.value / available) * 100).toFixed(1) + "%)"
                    : ""}
                </b>
              </li>
            ))}
          </ul>
        </div>
        <div role="img" aria-label="Inventory disposition chart">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={flow.filter((f) => f.value > 0)}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={95}
                isAnimationActive={false}
              >
                {flow
                  .filter((f) => f.value > 0)
                  .map((f) => (
                    <Cell key={f.name} fill={f.color} />
                  ))}
              </Pie>
              <Tooltip
                formatter={(v: any) =>
                  Number(v).toLocaleString() + " " + r.unit
                }
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <details>
        <summary>
          {t(
            "Cumulative outbound quantities by product / unit",
            "按商品与单位查看累计流出数量",
          )}
        </summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  t("Product / unit", "商品 / 单位"),
                  ...["sold", "donated", "spoiled", "transferred"].map(
                    (k) => labels[k as keyof typeof labels],
                  ),
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...groups.values()].map((g) => (
                <tr key={g.name + g.unit}>
                  <td>
                    {g.name} / {g.unit}
                  </td>
                  <td>{g.sold}</td>
                  <td>{g.donated}</td>
                  <td>{g.spoiled}</td>
                  <td>{g.transferred}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="form-help">
          {t(
            "Outbound movements across selected rows, not unique purchases. Transfers can later be sold at another stop. Opening and closing stock are not summed across dates.",
            "以上为筛选记录的累计流出，不能等同于独立采购量。调出商品可能在其他点位再次售出；期初、期末库存不跨日期相加。",
          )}
        </p>
      </details>
    </section>
  );
}
