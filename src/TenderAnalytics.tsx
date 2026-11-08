import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { tenderChannels, type TenderKey } from '../server/tenders.mjs';
import { money } from './api';
import { useLanguage } from './i18n';
import type { BusinessAnalytics } from './types';
import DistributionChart from './DistributionChart';

const colors = ['#167d7f', '#4c78a8', '#8b79b6', '#b87932', '#62a58c', '#ba677c', '#657b9f', '#9e9e4c'];

export default function TenderAnalytics({ mix, reports }: { mix: BusinessAnalytics['tenderMix']; reports: number }) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState<TenderKey>();
  const [ranked, setRanked] = useState(false);
  const channels = ranked ? [...tenderChannels].sort((a, b) => mix.channels[b.key] - mix.channels[a.key]) : tenderChannels;
  const activeKey = selected ?? [...tenderChannels].sort((a, b) => mix.channels[b.key] - mix.channels[a.key])[0].key;
  const channel = tenderChannels.find(c => c.key === activeKey)!;
  const pct = (key: TenderKey) => mix.classifiedCents ? mix.channels[key] / mix.classifiedCents * 100 : null;
  return <section className="panel business-panel business-tenders" aria-label={t('付款与补助结构')}>
    <div className="decision-heading"><div className="decision-heading-title"><span className="decision-section-icon blue"><Wallet size={19}/></span><div><span className="eyebrow">PAYMENT & BENEFITS</span><h3>{t('付款与补助结构')}</h3></div></div><button className="business-link" aria-pressed={ranked} onClick={() => setRanked(v => !v)}>{t(ranked ? '恢复原始顺序' : '按金额排序')}</button></div>
    <p className="business-model-intro">{t('整场商户销售填报，包含预购与现场交易。点击类别核对金额与占比。')}</p>
    <div className="tender-coverage"><span>{t('已分类填报')} <b>{mix.reports} / {reports}</b></span><span>{t('已分类销售额')} <b>{mix.reports ? money(mix.classifiedCents) : '—'}</b></span><span>{t('未分类销售额')} <b>{reports ? money(mix.unclassifiedCents) : '—'}</b></span></div>
    <div className="tender-analysis-grid"><DistributionChart label={t('付款分类占比图')} totalLabel={t('已分类销售额')} selected={activeKey} onSelect={key => setSelected(key as TenderKey)} format={money}
      items={channels.map(c => ({ id: c.key, label: c.label, value: mix.reports ? mix.channels[c.key] : null, color: colors[tenderChannels.indexOf(c)] }))}/>
      <div className="tender-inspector" role="status" aria-live="polite"><span className="eyebrow">{t('选中类别')}</span><h4>{channel.label}</h4><strong>{mix.reports ? money(mix.channels[activeKey]) : '—'}</strong><p>{t('占已分类销售额')} <b>{pct(activeKey) === null ? '—' : `${pct(activeKey)!.toFixed(1)}%`}</b></p><p>{t(activeKey === 'matchCents' ? 'Match 仅记录实际用于购买且未归入其他类别的配比补助；已发放但未消费的额度不计入销售。' : activeKey === 'qrCents' ? '此处汇总 WIC 与 FMNP 的二维码购买金额，不包含普通扫码银行卡付款。' : '金额来自已签到商户的分类销售填报，不代表银行结算或运营方收入。')}</p></div>
    </div>
    <p className="school-footnote">{t('占比以已分类销售额为分母；未分类金额不分摊为零。各类别互斥，每一美元只计算一次，不能再与平台订单或运营费用相加。')}</p>
  </section>;
}
