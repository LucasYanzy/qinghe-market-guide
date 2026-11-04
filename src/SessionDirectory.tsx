import { useEffect, useState } from 'react';
import { api } from './api';
import { useLanguage, type Message } from './i18n';
import { shoppingToday } from './shoppingDraft';
import { browserDemo } from './browser-demo/Controls';
import { pageHref } from './navigation';
import './workflows.css';

interface PublicSession {id:number;market_id:number;market_name:string;address:string;official_location_id:string;date:string;starts_at:string;ends_at:string;cutoff:string;status:string;cancelled:number;notice:string;active:number;preorders_enabled:number;vendors:{id:number;name:string;booth:string;status:string}[]}
export function SessionDirectory({date,officialLocationId,marketId,compact=false}:{date:string;officialLocationId?:string;marketId?:number;compact?:boolean}) {
  const {t}=useLanguage();const [sessions,setSessions]=useState<PublicSession[]>([]),[error,setError]=useState<Message>(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
  useEffect(()=>{let current=true;setLoading(true);setError('');api<PublicSession[]>(`/session-directory?date=${date}`).then(rows=>{if(current)setSessions(rows);}).catch(e=>{if(current)setError(e);}).finally(()=>{if(current)setLoading(false);});return()=>{current=false;};},[date,revision]);
  const rows=sessions.filter(s=>(!officialLocationId||s.official_location_id===officialLocationId)&&(!marketId||s.market_id===marketId));
  if(loading)return <p className="helper-text" role="status">{t('正在读取预购场次…')}</p>;
  if(error)return <p className="form-error" role="alert">{t(error)} <button className="text-button" onClick={()=>setRevision(r=>r+1)}>{t('重试')}</button></p>;
  if(!rows.length)return compact||browserDemo?null:<p className="workflow-empty">{t('该日期尚未开放运营预购。官方市场日程不代表本站已开放接单。')}</p>;
  const now=new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
  return <div className="workflow-cards" aria-label={t('本系统预购场次')}>{rows.map(s=>{
    const bookable=!s.cancelled&&s.active&&s.preorders_enabled&&s.status==='open'&&(s.date>shoppingToday()||s.date===shoppingToday()&&now<s.cutoff);
    return <section className="workflow-empty" key={s.id}><h4>{t(s.market_name)}</h4><p>{s.date} · {s.starts_at}–{s.ends_at} ET</p><span className="school-badge">{t(s.cancelled?'场次已取消':bookable?'已开放预购':'已停止接单')}</span>{s.notice&&<p role="status">{s.notice}</p>}{bookable&&<a className="button primary" href={`${pageHref('discover')}?date=${s.date}&market=${s.market_id}#today-produce`}>{t('查看本场商品')}</a>}
      {!!s.vendors.length&&<div><h5>{t('本场已确认商户')}</h5><ul>{s.vendors.map(v=><li key={v.id}>{t(v.name)} · {t('摊位')} {v.booth||'—'}</li>)}</ul></div>}
    </section>;
  })}</div>;
}
