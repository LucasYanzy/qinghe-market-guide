// Ordinary least squares over actual observed dates. No synthetic future observations.
function fit(points) {
  const n = points.length;
  const meanX = points.reduce((a, p) => a + p.x, 0) / n;
  const meanY = points.reduce((a, p) => a + p.y, 0) / n;
  const variance = points.reduce((a, p) => a + (p.x - meanX) ** 2, 0);
  const slope = variance
    ? points.reduce((a, p) => a + (p.x - meanX) * (p.y - meanY), 0) / variance
    : 0;
  return (x) => meanY + slope * (x - meanX);
}

export function forecastPrices(history) {
  const ordered = [...history]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-28);
  if (ordered.length < 7)
    return {
      points: [],
      maeCents: null,
      sampleSize: ordered.length,
      method: "最近 28 天线性回归",
      message: "至少需要 7 天历史价格，暂不生成预测。",
    };
  const start = Date.parse(`${ordered[0].date}T00:00:00Z`);
  const data = ordered.map((p) => ({
    x: (Date.parse(`${p.date}T00:00:00Z`) - start) / 86400000,
    y: p.price_cents,
  }));
  const predict = fit(data);
  const last = data.at(-1);
  const errors = data.map((p) => p.y - predict(p.x));
  const residual = Math.sqrt(
    errors.reduce((sum, v) => sum + v * v, 0) / Math.max(1, data.length - 2),
  );
  // Rolling one-step holdout MAE; do not report in-sample accuracy as backtest accuracy.
  const validation = [];
  for (let i = Math.max(5, data.length - 7); i < data.length; i++) {
    validation.push(Math.abs(fit(data.slice(0, i))(data[i].x) - data[i].y));
  }
  return {
    method: "最近 28 天线性回归",
    sampleSize: data.length,
    maeCents: Math.round(
      validation.reduce((a, b) => a + b, 0) / validation.length,
    ),
    message:
      "趋势仅供参考，非价格承诺；区间为模型残差估计，未包含天气、供需等外部因素。",
    points: Array.from({ length: 7 }, (_, i) => {
      const date = new Date(`${ordered.at(-1).date}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + i + 1);
      const price = Math.max(1, Math.round(predict(last.x + i + 1)));
      const spread = Math.ceil(
        1.96 * residual * Math.sqrt(1 + (i + 1) / data.length),
      );
      return {
        date: date.toISOString().slice(0, 10),
        price_cents: price,
        low_cents: Math.max(1, price - spread),
        high_cents: price + spread,
      };
    }),
  };
}
