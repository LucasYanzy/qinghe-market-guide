import { useRef } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { useLanguage } from "./i18n";
import "./distribution-chart.css";

export interface DistributionItem { id: string; label: string; value: number | null; color: string }

// A fixed SVG size bounds rendering work. The native legend provides the same
// selection on touch, keyboard and screen readers as clicking a chart segment.
export default function DistributionChart({ items, selected, onSelect, label, totalLabel, format = String, clearable = false }: {
  items: DistributionItem[]; selected: string; onSelect: (id: string) => void;
  label: string; totalLabel: string; format?: (value: number) => string;
  clearable?: boolean;
}) {
  const { t } = useLanguage();
  const legend = useRef<HTMLDivElement>(null);
  const total = items.reduce((sum, item) => sum + Math.max(0, item.value ?? 0), 0);
  const active = items.find(item => item.id === selected);
  const positive = items.filter(item => item.value !== null && item.value > 0);
  const known = items.every(item => item.value !== null);
  const percent = (value: number | null) => total && value !== null ? `${(value / total * 100).toFixed(1)}%` : "—";
  const choose = (id: string) => onSelect(clearable && id === selected ? "" : id);
  return <div className="distribution-chart" role="group" aria-label={label}>
    <div className="distribution-visual">
      <div aria-hidden="true">
        {total ? <PieChart width={224} height={224} accessibilityLayer={false}>
          <Pie data={positive} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={78} outerRadius={99}
            startAngle={90} endAngle={-270} paddingAngle={positive.length > 1 ? 3 : 0} cornerRadius={4}
            isAnimationActive={false} rootTabIndex={-1} onClick={(_item, index) => choose(positive[index].id)}>
            {positive.map(item => <Cell key={item.id} fill={item.color} stroke={item.id === selected ? item.color : "#fff"}
              strokeWidth={item.id === selected ? 3 : 1} fillOpacity={!active || item.id === selected ? 1 : 0.4} />)}
          </Pie>
        </PieChart> : <svg width="224" height="224" viewBox="0 0 224 224"><circle cx="112" cy="112" r="88" fill="none" stroke="#e8edf2" strokeWidth="21" /></svg>}
      </div>
      <div className="distribution-center" aria-live="polite" aria-atomic="true"><span>{active?.label ?? totalLabel}</span><strong>{active ? active.value === null ? "—" : format(active.value) : known ? format(total) : "—"}</strong><small>{active ? percent(active.value) : t("合计")}</small></div>
    </div>
    <div className="distribution-legend" ref={legend}>
      <p>{t("点击扇区或类别查看 · 方向键切换")}</p>
      {items.map((item, index) => <button type="button" className="distribution-option" key={item.id} aria-label={item.label}
        aria-pressed={item.id === selected} onClick={() => choose(item.id)} onKeyDown={event => {
          if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1) + items.length) % items.length;
          onSelect(items[next].id); legend.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
        }}>
        <i style={{ background: item.color }} aria-hidden="true" /><span>{item.label}</span><b>{item.value === null ? "—" : format(item.value)}<small>{percent(item.value)}</small></b>
      </button>)}
      {!total && <p className="distribution-empty" role="status">{t(known ? "当前分类合计为零，暂无占比。" : "尚无分类记录，金额未知。")}</p>}
    </div>
  </div>;
}
