import { useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, BookOpen, Search, Star } from 'lucide-react';
import ReportTrend from './ReportTrend';
import { money } from './api';
import { useLanguage } from './i18n';
import { changePercent, reportDate, type DashboardView } from './schoolReports';
import type { SchoolOverview } from './types';

const reports: { id: string; name: string; description: string; view: DashboardView; group: string }[] = [
  { id:'sales', name:'销售与客群摘要', description:'成交额、订单、客单价与回访', view:'overview', group:'销售' },
  { id:'products', name:'商品需求与价格', description:'买家、复购、单价与商品对比', view:'products', group:'商品与库存' },
  { id:'inventory', name:'库存与供给风险', description:'当前可预购库存、低库存与缺货', view:'products', group:'商品与库存' },
  { id:'markets', name:'市场与商户表现', description:'比较市场表现，查看商户贡献', view:'network', group:'销售' },
  { id:'finance', name:'运营收支报告', description:'运营费用收款、资助、支出与明细', view:'finance', group:'运营财务' },
  { id:'coverage', name:'出摊与数据覆盖', description:'出勤、缺报与收款记录覆盖', view:'business', group:'运营财务' },
  { id:'tenders', name:'八类付款与补助', description:'分类金额、占比与未分类销售', view:'business', group:'服务与补助' },
  { id:'snap', name:'SNAP 参与与服务', description:'付款意向、食品资格与受理核实', view:'snap', group:'服务与补助' },
];
export default function ReportCenter({ data, open }: { data: SchoolOverview; open: (view: DashboardView) => void }) {
  const { t } = useLanguage();
  const [query,setQuery] = useState(''), [onlySaved,setOnlySaved] = useState(false);
  const [saved,setSaved] = useState<string[]>(()=>{try {const value=JSON.parse(localStorage.getItem('qinghe-saved-reports')??'[]');return Array.isArray(value)?value.filter(v=>typeof v==='string'):[];}catch{return [];}});
  const toggle = (id:string) => setSaved(current=>{const next=current.includes(id)?current.filter(v=>v!==id):[...current,id];try{localStorage.setItem('qinghe-saved-reports',JSON.stringify(next));}catch{/* Optional preference. */}return next;});
  const list=reports.filter(r=>(!onlySaved||saved.includes(r.id))&&`${t(r.name)} ${t(r.description)} ${t(r.group)}`.toLowerCase().includes(query.trim().toLowerCase()));
  const a=data.analytics, prior=new Map((data.previousTimeline??[]).map(d=>[d.date,d]));
  const series=data.timeline.map(d=>{
    const offset=data.from?Math.round((Date.parse(d.date)-Date.parse(data.from))/86400000):0;
    const previousDate=a.previous?reportDate(a.previous.from,offset):null;
    const previous=previousDate?prior.get(previousDate):undefined;
    return {...d,previousDate,previousRevenueCents:a.previous?previous?.revenueCents??0:null,
      previousOrders:a.previous?previous?.orders??0:null,previousParticipants:a.previous?previous?.participants??0:null};
  });
  const top=[...a.products].sort((x,y)=>y.revenueCents-x.revenueCents), topThree=top.slice(0,3).reduce((n,p)=>n+p.revenueCents,0);
  const fmt=(value:number|null|undefined)=>value==null?'—':value.toLocaleString();
  return <div className="report-center">
    <div className="report-center-heading"><div><span className="eyebrow">REPORTS / DECISIONS</span><h3>{t('经营摘要与报表中心')}</h3><p>{t('从变化读到明细，再决定下一步。所有报表沿用当前市场和日期。')}</p></div><BookOpen size={25}/></div>
    <div className="report-stories">
      {[
        {id:'revenueCents', prior:'previousRevenueCents', name:'已完成交易额', value:a.current.revenueCents, previous:a.previous?.revenueCents, format:money, text:t('本期 {orders} 笔完成订单，平均每笔 {amount}。',{orders:a.current.completed,amount:a.current.averageOrderCents==null?'—':money(a.current.averageOrderCents)}), view:'overview'},
        {id:'orders', prior:'previousOrders', name:'预购订单', value:a.current.orders, previous:a.previous?.orders, format:fmt, text:t('已完成 {completed} 笔，取消 {cancelled} 笔，仍需处理 {pending} 笔。',{completed:a.current.completed,cancelled:a.current.cancelled,pending:a.current.orders-a.current.completed-a.current.cancelled}), view:'overview'},
        {id:'participants', prior:'previousParticipants', name:'实际参与顾客', value:a.current.participants, previous:a.previous?.participants, format:fmt, text:t('首次参与 {first} 人，已有历史购买的回访顾客 {returning} 人。',{first:a.customers.newParticipants,returning:a.customers.returningParticipants}), view:'overview'},
      ].map(metric=>{
        const delta=changePercent(metric.value,metric.previous),increasing=(delta??0)>=0;
        const peak=series.reduce<(typeof series)[number]|null>((best,row)=>(row[metric.id as 'revenueCents'|'orders'|'participants']??0)>(best?.[metric.id as 'revenueCents'|'orders'|'participants']??0)?row:best,null);
        return <article className="panel report-story" key={metric.id}>
          <div className="report-story-heading"><div><span>{t(metric.name)}</span><strong>{metric.format(metric.value)}</strong></div><span className={`report-delta ${delta===null?'neutral':increasing?'positive':'negative'}`}>{delta===null?t(a.previous?'上期为零，不计算增幅':'无可比上期'):<>{increasing?<ArrowUpRight size={15}/>:<ArrowDownRight size={15}/>} {Math.abs(delta).toFixed(1)}% {t('较上期')}</>}</span></div>
          <div className="report-story-body"><ReportTrend name={t(metric.name)} format={metric.format} compare={!!a.previous} points={series.map(row=>({date:row.date,value:row[metric.id as 'revenueCents'|'orders'|'participants']??null,previous:row[metric.prior as 'previousRevenueCents'|'previousOrders'|'previousParticipants'],previousDate:row.previousDate}))}/><div className="report-story-explanation"><h4>{t('本期变化与依据')}</h4><p>{metric.text}</p>{peak&&<p className="report-peak">{t('本期单日峰值在 {date}：{value}。',{date:peak.date,value:metric.format(peak[metric.id as 'revenueCents'|'orders'|'participants']??0)})}</p>}<small>{t(metric.id==='participants'?'每日为去重人数，同一顾客跨日出现时不相加为周期人数。':'依据当前平台订单状态与自提日期统计，不代表全部现场销售或支付到账。')}</small><button className="text-button" onClick={()=>open(metric.view as DashboardView)}>{t('查看相关报表')}<ArrowRight size={14}/></button></div></div>
        </article>;
      })}
    </div>
    <div className="report-observations"><article><span>{t('商品记录集中度')}</span><strong>{a.current.revenueCents?`${(topThree/a.current.revenueCents*100).toFixed(1)}%`:'—'}</strong><p>{t('前三项商品记录贡献的完成交易额占比，记录按商品、市场及原始单位区分。集中度高时优先检查供货。')}</p><button className="text-button" onClick={()=>open('products')}>{t('查看商品贡献')}<ArrowRight size={14}/></button></article><article><span>{t('每单商品种类')}</span><strong>{a.current.completed?(a.products.reduce((n,p)=>n+p.orders,0)/a.current.completed).toFixed(2):'—'}</strong><p>{t('完成订单中平均购买的商品记录种类，不把不同重量单位相加。')}</p><button className="text-button" onClick={()=>open('products')}>{t('查看购买结构')}<ArrowRight size={14}/></button></article><article><span>{t('回访顾客占比')}</span><strong>{a.current.participants?`${(a.customers.returningParticipants/a.current.participants*100).toFixed(1)}%`:'—'}</strong><p>{t('本期完成购买、且此前已有完成订单的顾客占比，不等于留存率。')}</p><button className="text-button" onClick={()=>open('overview')}>{t('查看客群')}<ArrowRight size={14}/></button></article></div>
    <section className="panel report-library"><div className="report-library-heading"><h3>{t('报表目录')}</h3><div className="report-search"><Search size={15}/><input type="search" aria-label={t('搜索报表')} placeholder={t('搜索报表')} value={query} onChange={e=>setQuery(e.target.value)}/></div><button className="business-link" aria-pressed={onlySaved} onClick={()=>setOnlySaved(v=>!v)}><Star size={14}/>{t('只看收藏')}</button></div><div className="report-library-grid">{list.map(r=><article key={r.id}><button className="report-save" aria-label={t('收藏报表：{name}',{name:t(r.name)})} aria-pressed={saved.includes(r.id)} onClick={()=>toggle(r.id)}><Star size={16} fill={saved.includes(r.id)?'currentColor':'none'}/></button><span>{t(r.group)}</span><h4>{t(r.name)}</h4><p>{t(r.description)}</p><button className="text-button" onClick={()=>open(r.view)}>{t('打开报表')}<ArrowRight size={14}/></button></article>)}</div>{!list.length&&<p>{t('没有匹配的报表，试试其他关键词或关闭收藏筛选。')}</p>}</section>
  </div>;
}
