import { ChevronLeft, ChevronRight, LocateFixed } from "lucide-react";
import { useLanguage } from "./i18n";
import "./trend-navigator.css";

export default function TrendNavigator({ dates, index, onChange, valueText, latestIndex }: {
  dates: string[]; index: number; onChange: (index: number) => void; valueText: string; latestIndex: number;
}) {
  const { t } = useLanguage();
  return <div className="trend-navigator" role="group" aria-label={t("趋势日期导航")}>
    <button type="button" aria-label={t("上一个数据点")} disabled={index <= 0} onClick={() => onChange(index - 1)}><ChevronLeft size={16}/></button>
    <input type="range" aria-label={t("选择趋势日期")} aria-valuetext={valueText} min={0} max={Math.max(0, dates.length - 1)} value={index} onChange={event => onChange(Number(event.target.value))}/>
    <button type="button" aria-label={t("下一个数据点")} disabled={index >= dates.length - 1} onClick={() => onChange(index + 1)}><ChevronRight size={16}/></button>
    <div className="trend-navigator-range"><span>{dates[0]}</span><button type="button" disabled={latestIndex < 0 || index === latestIndex} onClick={() => onChange(latestIndex)}><LocateFixed size={12}/>{t("最近有记录")}</button><span>{dates.at(-1)}</span></div>
  </div>;
}
