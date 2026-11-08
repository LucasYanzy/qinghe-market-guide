import { useId, useRef, useState, type ReactNode } from "react";
import { BarChart3, Check, ChevronLeft, ChevronRight, CircleDot, RotateCcw } from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";
import { useLanguage } from "./i18n";
import "./distribution-chart.css";

export interface DistributionItem { id: string; label: string; value: number | null; color: string }

// One selected category is shared by the chart, keyboard legend and details.
// Pointer previews are temporary and never change a parent's data filter.
export default function DistributionChart({ items, selected, onSelect, label, totalLabel, format = String, clearable = false, renderDetail, detailClassName = "" }: {
  items: DistributionItem[]; selected: string; onSelect: (id: string) => void;
  label: string; totalLabel: string; format?: (value: number) => string;
  clearable?: boolean; renderDetail?: (item: DistributionItem) => ReactNode; detailClassName?: string;
}) {
  const { t } = useLanguage();
  const helpId = useId();
  const legend = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState("donut");
  const [preview, setPreview] = useState<{ id: string; scope: string }>();
  const scope = JSON.stringify(items.map(item => [item.id, item.value]));
  const total = items.reduce((sum, item) => sum + Math.max(0, item.value ?? 0), 0);
  const pinned = items.find(item => item.id === selected);
  const hovered = preview?.scope === scope ? items.find(item => item.id === preview.id) : undefined;
  const active = hovered ?? pinned;
  const previewing = !!hovered && hovered.id !== pinned?.id;
  const positive = items.filter(item => item.value !== null && item.value > 0);
  const known = items.every(item => item.value !== null);
  const percent = (value: number | null) => total && value !== null ? `${(value / total * 100).toFixed(1)}%` : "—";
  const display = (value: number | null) => value === null ? "—" : format(value);
  const choose = (id: string, toggle = true) => { setPreview(undefined); onSelect(clearable && toggle && id === selected ? "" : id); };
  const index = items.findIndex(item => item.id === selected);
  const value = active ? display(active.value) : known ? format(total) : "—";
  return <div className="distribution-chart" role="group" aria-label={label} data-mode={mode}
    onPointerLeave={() => setPreview(undefined)} onKeyDown={event => { if (event.key === "Escape") setPreview(undefined); }}>
    <div className="distribution-toolbar">
      <div className="distribution-total"><span>{totalLabel}</span><strong>{known ? format(total) : "—"}</strong></div>
      <div className="distribution-view" role="group" aria-label={t("图表样式")}>
        <button type="button" aria-pressed={mode === "donut"} onClick={() => { setMode("donut"); setPreview(undefined); }}><CircleDot size={14}/>{t("环图")}</button>
        <button type="button" aria-pressed={mode === "bars"} onClick={() => { setMode("bars"); setPreview(undefined); }}><BarChart3 size={14}/>{t("条形图")}</button>
      </div>
    </div>
    <div className="distribution-layout">
      <div className="distribution-stage">
        {mode === "donut" && <div className="distribution-visual">
          <div aria-hidden="true" onPointerLeave={() => setPreview(undefined)}>
            {total ? <PieChart width={240} height={240} accessibilityLayer={false}>
              <Pie data={positive} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={81} outerRadius={103}
                startAngle={90} endAngle={-270} paddingAngle={positive.length > 1 ? 2 : 0} cornerRadius={3}
                isAnimationActive={false} rootTabIndex={-1} onClick={(_item, i) => choose(positive[i].id)}
                onMouseEnter={(_item, i) => setPreview({ id: positive[i].id, scope })}>
                {positive.map(item => <Cell key={item.id} fill={item.color} stroke={item.id === active?.id ? item.color : "#fff"}
                  strokeWidth={item.id === active?.id ? 4 : 1} fillOpacity={!active || item.id === active.id ? 1 : 0.55} />)}
              </Pie>
            </PieChart> : <svg width="240" height="240" viewBox="0 0 240 240"><circle cx="120" cy="120" r="92" fill="none" stroke="#e8edf2" strokeWidth="22" /></svg>}
          </div>
          <div className="distribution-center" data-preview={previewing}><span>{active?.label ?? totalLabel}</span><strong className={value.length > 10 ? "is-long" : undefined}>{value}</strong><small>{active ? percent(active.value) : t("合计")}</small></div>
        </div>}
        <div className={`distribution-selection ${detailClassName}`} aria-live={previewing ? "off" : "polite"} aria-atomic="true">
          <div className="distribution-selection-heading"><span>{t(previewing ? "悬停预览" : active ? "已选中" : "全部分类")}</span>
            {clearable && pinned && <button type="button" className="distribution-clear" onClick={() => choose("", false)}><RotateCcw size={12}/>{t("清除选择")}</button>}
          </div>
          {active ? <><div className="distribution-selection-value"><i style={{ background: active.color }}/><strong>{active.label}</strong><b>{display(active.value)}<small>{percent(active.value)}</small></b></div>
            {renderDetail?.(active)}</> : <p>{t("选择类别查看数值与说明。")}</p>}
          <span className="distribution-preview-hint">{t(previewing ? "点击保留此类别；移开恢复已选内容。" : "点击类别保留选择，悬停可临时对照。")}</span>
        </div>
        <div className="distribution-stepper" role="group" aria-label={t("逐项查看分类")}>
          <button type="button" aria-label={t("上一个分类")} disabled={!items.length} onClick={() => choose(items[index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length].id, false)}><ChevronLeft size={16}/></button>
          <span>{index < 0 ? "—" : index + 1} / {items.length}</span>
          <button type="button" aria-label={t("下一个分类")} disabled={!items.length} onClick={() => choose(items[(index + 1) % items.length].id, false)}><ChevronRight size={16}/></button>
        </div>
      </div>
      <div className="distribution-legend" ref={legend} aria-describedby={helpId}>
        <div className="distribution-columns"><span>{t("类别")}</span><span>{t("数值 / 占比")}</span></div>
        {items.map((item, i) => <button type="button" className="distribution-option" key={item.id} aria-label={item.label}
          aria-pressed={item.id === selected} data-preview={previewing && item.id === hovered?.id}
          onPointerEnter={event => { if (event.pointerType === "mouse") setPreview({ id: item.id, scope }); }}
          onPointerLeave={() => setPreview(undefined)} onClick={() => choose(item.id)} onKeyDown={event => {
            if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (i + (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1) + items.length) % items.length;
            choose(items[next].id, false); legend.current?.querySelectorAll<HTMLButtonElement>(".distribution-option")[next]?.focus();
          }}>
          <i style={{ background: item.color }} aria-hidden="true"/>
          <span className="distribution-option-name">{item.label}{item.id === selected && <Check size={12} aria-hidden="true"/>}</span>
          <b>{display(item.value)}<small>{percent(item.value)}</small></b>
          <span className="distribution-track" aria-hidden="true"><span style={{ width: `${total ? (item.value ?? 0) / total * 100 : 0}%`, background: item.color }}/></span>
        </button>)}
        {!total && <p className="distribution-empty" role="status">{t(known ? "当前分类合计为零，暂无占比。" : "尚无分类记录，金额未知。")}</p>}
        <p className="distribution-help" id={helpId}>{t("方向键逐项选择 · Home / End 跳到首尾")}</p>
      </div>
    </div>
  </div>;
}
