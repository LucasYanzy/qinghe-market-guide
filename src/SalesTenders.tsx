import { useRef, useEffect, useState } from 'react';
import { tenderChannels, type TenderBreakdown } from '../server/tenders.mjs';
import { money } from './api';
import { useLanguage } from './i18n';
import './sales-tenders.css';

export function salesValues(form: FormData) {
  return {
    grossCents: Math.round(Number(form.get('gross')) * 100),
    tenders: form.get('classified') ? Object.fromEntries(tenderChannels.map(c => [c.key, Math.round(Number(form.get(`tender_${c.key}`)) * 100)])) : null,
  };
}

export function SalesFields({ initial }: { initial?: { gross_cents: number | null; tenders: TenderBreakdown | null } }) {
  const { t } = useLanguage();
  const [gross, setGross] = useState(initial?.gross_cents == null ? '' : String(initial.gross_cents / 100));
  const [classified, setClassified] = useState(!!initial?.tenders);
  const [values, setValues] = useState(() => Object.fromEntries(tenderChannels.map(c => [c.key, String((initial?.tenders?.[c.key] ?? 0) / 100)])));
  const grossInput = useRef<HTMLInputElement>(null);
  const sum = tenderChannels.reduce((n, c) => n + Math.round(Number(values[c.key]) * 100), 0);
  const remaining = Math.round(Number(gross) * 100) - sum;
  useEffect(() => {
    grossInput.current?.setCustomValidity(classified && remaining !== 0 ? t('分类收款合计必须等于总销售额。') : '');
  }, [classified, remaining, t]);
  return <>
    <label>{t('总销售额（USD）')}<input ref={grossInput} required name="gross" type="number" min="0" max="1000000" step="0.01" value={gross} onChange={e => setGross(e.target.value)} /></label>
    <div className="sales-classification">
      <label className="sales-classify-toggle"><input type="checkbox" name="classified" checked={classified} onChange={e => setClassified(e.target.checked)} />{t('按付款与补助分类填报')}</label>
      <p>{t('只填实际用于购买的金额；每一美元只归入一个类别。Match 若已包含在 Good Food Bucks 或 Market Bucks 中，不要重复登记。')}</p>
      {classified ? <fieldset className="sales-tender-fields"><legend>{t('收款分类（USD）')}</legend>
        {tenderChannels.map(c => <label key={c.key}>{c.label}<input aria-label={c.label} name={`tender_${c.key}`} required type="number" min="0" max="1000000" step="0.01" value={values[c.key]} onChange={e => setValues(v => ({ ...v, [c.key]: e.target.value }))} /></label>)}
        <div className={`sales-tender-balance${remaining === 0 ? ' balanced' : ''}`} role="status"><span>{t('分类合计')} <strong>{money(sum)}</strong></span><span>{t('待分配金额')} <strong>{money(remaining)}</strong></span></div>
      </fieldset> : <p className="helper-text">{t('未分类时只记录总销售额，各类别保持未知。')}</p>}
      <p className="helper-text">{t('此处只登记已完成的销售，不代表市场或商户已获准接受这些计划，也不记录补助发放额或银行结算。')}</p>
    </div>
  </>;
}

export function SalesTenderDetails({ tenders }: { tenders: TenderBreakdown | null }) {
  const { t } = useLanguage();
  if (!tenders) return <small>{t('尚未按收款类别填报')}</small>;
  return <details className="sales-tender-details"><summary>{t('查看收款分类')}</summary><dl>{tenderChannels.map(c => <div key={c.key}><dt>{c.label}</dt><dd>{money(tenders[c.key])}</dd></div>)}</dl></details>;
}
