import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { tenderChannels, type TenderKey } from '../server/tenders.mjs';
import { money } from './api';
import { useLanguage } from './i18n';
import type { BusinessAnalytics } from './types';

export default function TenderAnalytics({ mix, reports }: { mix: BusinessAnalytics['tenderMix']; reports: number }) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState<TenderKey>('cashCents');
  const [ranked, setRanked] = useState(false);
  const channels = ranked ? [...tenderChannels].sort((a, b) => mix.channels[b.key] - mix.channels[a.key]) : tenderChannels;
  const channel = tenderChannels.find(c => c.key === selected)!;
  const pct = (key: TenderKey) => mix.classifiedCents ? mix.channels[key] / mix.classifiedCents * 100 : null;
  return <section className="panel business-panel business-tenders" aria-label={t('付款与补助结构')}>
    <div className="decision-heading"><div className="decision-heading-title"><span className="decision-section-icon blue"><Wallet size={19}/></span><div><span className="eyebrow">PAYMENT & BENEFITS</span><h3>{t('付款与补助结构')}</h3></div></div><button className="business-link" aria-pressed={ranked} onClick={() => setRanked(v => !v)}>{t(ranked ? '恢复原始顺序' : '按金额排序')}</button></div>
    <p className="business-model-intro">{t('整场商户销售填报，包含预购与现场交易。点击类别核对金额与占比。')}</p>
    <div className="tender-coverage"><span>{t('已分类填报')} <b>{mix.reports} / {reports}</b></span><span>{t('已分类销售额')} <b>{mix.reports ? money(mix.classifiedCents) : '—'}</b></span><span>{t('未分类销售额')} <b>{reports ? money(mix.unclassifiedCents) : '—'}</b></span></div>
    <div className="tender-analysis-grid"><div className="tender-bars">{channels.map(c => <button className="tender-bar" key={c.key} aria-label={c.label} aria-pressed={selected === c.key} onClick={() => setSelected(c.key)}><span className="tender-bar-label">{c.label}</span><span className="tender-bar-track" aria-hidden="true"><i style={{ width: `${pct(c.key) ?? 0}%` }}/></span><span className="tender-bar-amount">{mix.reports ? money(mix.channels[c.key]) : '—'}<small>{pct(c.key) === null ? '—' : `${pct(c.key)!.toFixed(1)}%`}</small></span></button>)}</div>
      <div className="tender-inspector" role="status" aria-live="polite"><span className="eyebrow">{t('选中类别')}</span><h4>{channel.label}</h4><strong>{mix.reports ? money(mix.channels[selected]) : '—'}</strong><p>{t('占已分类销售额')} <b>{pct(selected) === null ? '—' : `${pct(selected)!.toFixed(1)}%`}</b></p><p>{t(selected === 'matchCents' ? 'Match 仅记录实际用于购买且未归入其他类别的配比补助；已发放但未消费的额度不计入销售。' : selected === 'qrCents' ? '此处汇总 WIC 与 FMNP 的二维码购买金额，不包含普通扫码银行卡付款。' : '金额来自已签到商户的分类销售填报，不代表银行结算或运营方收入。')}</p></div>
    </div>
    <p className="school-footnote">{t('占比以已分类销售额为分母；未分类金额不分摊为零。各类别互斥，每一美元只计算一次，不能再与平台订单或运营费用相加。')}</p>
  </section>;
}
