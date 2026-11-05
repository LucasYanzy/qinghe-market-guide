import { useState } from 'react';
import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { shortDate } from './api';
import { useLanguage } from './i18n';

export interface ReportPoint {
  date: string;
  value: number | null;
  previous: number | null;
  previousDate: string | null;
}

// Bound SVG and table work independently of the length of the report history.
export default function ReportTrend({ points, name, format, compare, empty = '无记录' }: {
  points: ReportPoint[]; name: string; format: (value: number) => string; compare: boolean; empty?: string;
}) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState('');
  const [page, setPage] = useState(0);
  const chart = points.slice(-120);
  const active = chart.find(row => row.date === selected) ?? chart.at(-1);
  const pages = Math.max(1, Math.ceil(points.length / 12)), safePage = Math.min(page, pages - 1);
  const display = (value: number | null) => value === null ? t(empty) : format(value);
  return <div className="report-trend">
    <div className="report-story-chart">
      {chart.length ? <>
        <div className="report-trend-selection" aria-live="polite"><span>{active?.date}</span><strong>{active ? display(active.value) : '—'}</strong>{compare && <small>{t('上期')} {active?.previousDate ?? '—'} · {active ? display(active.previous) : '—'}</small>}</div>
        <div role="group" aria-label={t('{metric} 本期与上期趋势', { metric: name })}>
          <ResponsiveContainer width="100%" height={190}><ComposedChart data={chart} margin={{top:12,right:12,left:0,bottom:5}} onClick={state => { if (state.activeLabel != null) setSelected(String(state.activeLabel)); }}>
            <CartesianGrid vertical={false} stroke="#e6edf0"/>
            <XAxis dataKey="date" tickFormatter={date => String(date).length === 7 ? String(date) : shortDate(String(date))} tick={{fontSize:10}} minTickGap={32} axisLine={false} tickLine={false}/>
            <YAxis width={65} tickFormatter={format} tick={{fontSize:9}} axisLine={false} tickLine={false}/>
            <Tooltip labelFormatter={label => { const row = chart.find(r => r.date === String(label)); return `${label}${compare && row?.previousDate ? ` / ${row.previousDate}` : ''}`; }} formatter={value => format(Number(value))}/>
            <ReferenceLine y={0} stroke="#d6e2e8"/>
            {active && <ReferenceLine x={active.date} stroke="#b7cbd6" strokeDasharray="3 3"/>}
            <Line type="linear" dataKey="value" name={t('本期')} stroke="#246e97" dot={chart.length < 32} strokeWidth={2.5} connectNulls={false} isAnimationActive={false}/>
            {compare && <Line type="linear" dataKey="previous" name={t('上期')} stroke="#829678" strokeDasharray="5 4" dot={chart.length < 32} strokeWidth={1.8} connectNulls={false} isAnimationActive={false}/>}
          </ComposedChart></ResponsiveContainer>
        </div>
        <div className="report-chart-legend"><span>{t('本期')}</span>{compare && <span>{t('上期按周期第几天对齐')}</span>}</div>
        <label className="report-trend-scrubber"><span>{t('选择趋势日期')}</span><input type="range" min={0} max={chart.length - 1} value={Math.max(0, chart.findIndex(row => row === active))} aria-valuetext={active ? `${active.date}: ${display(active.value)}` : ''} onChange={event => setSelected(chart[Number(event.target.value)].date)}/></label>
        {points.length > 120 && <p className="report-chart-limit">{t('图表显示最近 120 个周期；完整记录可在下方分页查看。')}</p>}
      </> : <p className="decision-loading">{t('当前周期没有可展示的记录。')}</p>}
    </div>
    <details className="report-story-details"><summary>{t('展开趋势明细')}</summary><div className="decision-table-scroll"><table aria-label={t('{metric}趋势明细', {metric: name})}><thead><tr><th>{t('本期日期')}</th><th>{t('本期')}</th>{compare && <><th>{t('上期对应日期')}</th><th>{t('上期')}</th></>}</tr></thead><tbody>{points.slice(safePage * 12, safePage * 12 + 12).map(row => <tr key={row.date}><td>{row.date}</td><td>{display(row.value)}</td>{compare && <><td>{row.previousDate ?? '—'}</td><td>{display(row.previous)}</td></>}</tr>)}</tbody></table></div><div className="decision-pagination"><span>{t('第 {page} / {pages} 页', {page: safePage + 1, pages})} · {points.length}</span><button className="business-link" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>{t('上一页')}</button><button className="business-link" disabled={safePage === pages - 1} onClick={() => setPage(safePage + 1)}>{t('下一页')}</button></div></details>
  </div>;
}
