import { useEffect, useState } from 'react';
import { money } from './api';
import { useLanguage } from './i18n';
import type { SchoolOverview } from './types';
import guide from '../references/rutgers-market-guide.json';
import { reportToday } from './schoolReports';
import { SchoolVendorProfiles } from './VendorProfiles';
import { applicationLabels, attendanceLabels, useWorkflow, useWorkflowAction, WorkflowFeedback, type VendorApplication, type Invoice } from './workflowSupport';

type Session={id:number;market_id:number;market_name:string;date:string;starts_at:string;ends_at:string;status:string;cancelled:number;notice:string;version:number};
type Attendee={session_id:number;retailer_id:number;name:string;email:string;status:string;booth:string;note:string;version:number};
function workflowDate() {
  const value = new URLSearchParams(window.location.search).get('date') ?? '';
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : reportToday();
}
function saveWorkflowDate(date:string) {
  const url = new URL(window.location.href); url.searchParams.set('date', date);
  window.history.replaceState(null, '', url.pathname + url.search);
}
export default function SchoolWorkflows({data,marketId,onSaved}:{data:SchoolOverview;marketId:number|null;onSaved:()=>void}) {
  const {t}=useLanguage();const [tab,setTab]=useState(() => {
    const value = new URLSearchParams(window.location.search).get('tab');
    return value && ['applications','profiles','sessions','sales','invoices','messages'].includes(value) ? value : 'applications';
  });
  useEffect(() => {
    const url = new URL(window.location.href); url.searchParams.set('tab', tab);
    window.history.replaceState(null, '', url.pathname + url.search);
  }, [tab]);
  return <div className="workflow-page"><h2>{t('商户与运营')}</h2><p>{t('从入驻审核到出摊、通知和市场费用，记录每一步交接。')}</p><div className="workflow-tabs" role="tablist" aria-label={t('商户运营分区')}>{[['applications','入驻审核'],['profiles','商户档案与变更'],['sessions','出摊与停市'],['sales','现场销售填报'],['invoices','商户费用'],['messages','通知与邮件']].map(([id,label])=><button role="tab" key={id} aria-selected={tab===id} onClick={()=>setTab(id)}>{t(label)}</button>)}</div>
    <div role="tabpanel" key={`${tab}:${marketId}`}>{tab==='applications'?<Applications marketId={marketId} onSaved={onSaved}/>:tab==='profiles'?<SchoolVendorProfiles marketId={marketId} onSaved={onSaved}/>:tab==='sessions'?<Attendance data={data} marketId={marketId} onSaved={onSaved}/>:tab==='sales'?<Sales data={data} marketId={marketId}/>:tab==='invoices'?<Invoices data={data} marketId={marketId}/>:<Communications/>}</div>
  </div>;
}
function Applications({marketId,onSaved}:{marketId:number|null;onSaved:()=>void}) {
  const {t}=useLanguage(),[revision,setRevision]=useState(0);const reload=()=>setRevision(n=>n+1);
  const result=useWorkflow<VendorApplication[]>(`/admin/applications${marketId?`?marketId=${marketId}`:''}`,revision),action=useWorkflowAction(()=>{reload();onSaved();});
  return <><WorkflowFeedback loading={result.loading} error={result.error||action.error} retry={reload}/><div className="workflow-cards">{result.data?.map(a=><article className="panel" key={a.id}><div className="workflow-card-heading"><h3>{a.business_name}</h3><span className="school-badge">{t(applicationLabels[a.status])}</span></div><p>{t(a.market_name)} · {a.contact_name} · {a.phone||'—'}</p><small>{a.email}</small><p>{a.description}</p>{a.review_note&&<p>{t('审核意见')}：{a.review_note}</p>}{!['approved','rejected'].includes(a.status)&&<form className="form-stack" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void action.run(`/admin/applications/${a.id}`,{status:f.get('status'),note:f.get('note'),version:a.version},'PATCH');}}><fieldset disabled={result.loading||action.busy} className="form-stack"><label>{t('审核决定')}<select name="status">{[['approved','审核通过'],['needs_info','要求补充资料'],['waitlisted','列入候补'],['rejected','不予通过']].map(([id,label])=><option key={id} value={id}>{t(label)}</option>)}</select></label><label>{t('审核意见')}<textarea name="note" required maxLength={500}/></label><p>{t('通过后开通商户身份并加入该市场，保留原顾客订单与身份。')}</p><button className="button primary">{t('保存审核结果')}</button></fieldset></form>}</article>)}</div>{result.data?.length===0&&<p>{t('当前没有入驻申请。')}</p>}</>;
}
function Attendance({data,marketId,onSaved}:{data:SchoolOverview;marketId:number|null;onSaved:()=>void}) {
  const {t}=useLanguage(),[date,setDate]=useState(workflowDate),[revision,setRevision]=useState(0),[sessionId,setSessionId]=useState('');const reload=()=>setRevision(n=>n+1);
  const result=useWorkflow<{sessions:Session[]}>(`/admin/operations?date=${date}${marketId?`&marketId=${marketId}`:''}`,revision);
  const sessions=result.data?.sessions??[],selected=sessions.find(s=>s.id===Number(sessionId))??sessions[0];
  const attendee=useWorkflow<Attendee[]>(selected?`/admin/sessions/${selected.id}/vendors`:null,revision),action=useWorkflowAction(reload);
  const assigned=data.vendors.filter(v=>v.marketIds.includes(selected?.market_id??0));
  return <><label className="workflow-date">{t('工作日期')}<input type="date" value={date} onChange={e=>{if(e.target.value){setDate(e.target.value);saveWorkflowDate(e.target.value);setSessionId('');}}}/></label><WorkflowFeedback loading={result.loading} error={result.error||action.error} retry={reload}/>
    <MarketLink data={data} marketId={marketId} onSaved={onSaved}/>

    {!sessions.length?<p>{t('当天暂无运营场次，请先在现场运营中建立场次。')}</p>:<><label>{t('选择场次')}<select value={selected?.id??''} onChange={e=>setSessionId(e.target.value)}>{sessions.map(s=><option key={s.id} value={s.id}>{t(s.market_name)} · {s.starts_at}–{s.ends_at}</option>)}</select></label>
      {selected&&<div key={`${selected.id}:${revision}`} className="workflow-cards"><section className="panel"><h3>{selected.date} · {t(selected.market_name)}</h3><strong>{t(selected.cancelled?'场次已取消':selected.status==='open'?'接单中':selected.status==='draft'?'草稿':'停止接单')}</strong><p>{selected.notice}</p>
        <div className="workflow-booths" aria-label={t('本场摊位安排')}>{attendee.data?.filter(v=>v.status!=='absent').map(v=><div key={v.retailer_id}><strong>{v.booth||'—'}</strong><span>{t(v.name)}</span><small>{t(attendanceLabels[v.status])}</small></div>)}</div>
        <WorkflowFeedback loading={attendee.loading} error={attendee.error} retry={reload}/>
        {attendee.data?.map(v=><form key={v.retailer_id} className="workflow-attendee" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void action.run(`/admin/sessions/${selected.id}/vendors`,{vendorId:v.retailer_id,status:f.get('status'),booth:f.get('booth'),note:f.get('note'),version:v.version},'PUT');}}><strong>{t(v.name)}</strong><label>{t('出摊状态')}<select name="status" defaultValue={v.status}>{Object.entries(attendanceLabels).map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}</select></label><label>{t('摊位')}<input name="booth" maxLength={40} defaultValue={v.booth}/></label><label>{t('备注')}<input name="note" maxLength={300} defaultValue={v.note}/></label><button className="button" disabled={action.busy||selected.cancelled===1||attendee.loading}>{t('保存出摊记录')}</button></form>)}
        {!selected.cancelled&&<form className="form-stack" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void action.run(`/admin/sessions/${selected.id}/vendors`,{vendorId:Number(f.get('vendor')),status:'planned',booth:f.get('booth'),note:'',version:0},'PUT');}}><h4>{t('添加本场商户')}</h4><label>{t('商户')}<select name="vendor" required><option value="">{t('请选择商户')}</option>{assigned.filter(v=>!attendee.data?.some(a=>a.retailer_id===v.id)).map(v=><option key={v.id} value={v.id}>{t(v.name)}</option>)}</select></label><label>{t('摊位')}<input name="booth" maxLength={40}/></label><button className="button primary" disabled={action.busy||attendee.loading}>{t('加入出摊名单')}</button></form>}
      </section><section className="panel form-stack"><h3>{t('通知与临时停市')}</h3><p>{t('取货提醒仅发送给已确认预购；重复操作不会重复生成同类通知。')}</p><button className="button" disabled={action.busy||!!selected.cancelled} onClick={()=>void action.run(`/admin/sessions/${selected.id}/reminders`,{})}>{t('发送取货提醒')}</button>
        {!selected.cancelled&&<form className="form-stack" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void action.run(`/admin/sessions/${selected.id}/cancel`,{reason:f.get('reason'),version:selected.version});}}><label>{t('停市原因')}<textarea name="reason" required maxLength={500}/></label><label className="workflow-check"><input required type="checkbox"/>{t('确认取消本场全部未交付订单、释放库存与名额，并通知顾客和商户。')}</label><button className="button danger" disabled={action.busy}>{t('取消本场并通知')}</button></form>}
      </section></div>}
    </>}
  </>;
}
function MarketLink({data,marketId,onSaved}:{data:SchoolOverview;marketId:number|null;onSaved:()=>void}) {
  const {t}=useLanguage(),[market,setMarket]=useState(String(marketId??data.markets[0]?.id??''));
  const selected=data.markets.find(m=>m.id===Number(market));
  const action=useWorkflowAction(onSaved);
  return <section className="panel form-stack"><h3>{t('官方地点与运营市场关联')}</h3><p>{t('关联后，官方日历可显示本系统的预购入口和临时停市通知。')}</p><form className="form-stack" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void action.run('/admin/market-links',{marketId:Number(market),officialLocationId:f.get('official')},'PUT');}}><label>{t('运营市场')}<select name="market" required value={market} onChange={e=>setMarket(e.target.value)}>{data.markets.filter(m=>!marketId||m.id===marketId).map(m=><option key={m.id} value={m.id}>{t(m.name)}</option>)}</select></label><label>{t('官方地点')}<select name="official" key={`${market}:${selected?.official_location_id}`} defaultValue={selected?.official_location_id??''}><option value="">{t('解除关联')}</option>{guide.locations.map(l=><option key={l.id} value={l.id}>{t(l.name)}</option>)}</select></label><button className="button" disabled={action.busy}>{t('保存地点关联')}</button>{action.error&&<p role="alert">{t(action.error)}</p>}</form></section>;
}
type SalesReport={session_id:number;retailer_id:number;date:string;vendor_name:string;market_name:string;gross_cents:number;transactions:number;version:number;note:string};
function Sales({data,marketId}:{data:SchoolOverview;marketId:number|null}) {
  const {t}=useLanguage(),[revision,setRevision]=useState(0),[date,setDate]=useState(workflowDate),[sessionId,setSessionId]=useState('');const reload=()=>setRevision(n=>n+1);
  const result=useWorkflow<SalesReport[]>(`/admin/sales-reports${marketId?`?marketId=${marketId}`:''}`,revision),sessions=useWorkflow<{sessions:Session[]}>(`/admin/operations?date=${date}${marketId?`&marketId=${marketId}`:''}`,revision),action=useWorkflowAction(reload);
  const session=sessions.data?.sessions.find(s=>s.id===Number(sessionId))??sessions.data?.sessions[0];
  const attendees=useWorkflow<Attendee[]>(session?`/admin/sessions/${session.id}/vendors`:null,revision);
  return <><p className="ops-advice">{t('商户自报的当场总销售包含预购与现场交易，不能与本站预购金额相加，也不代表银行结算。')}</p><WorkflowFeedback loading={result.loading} error={result.error||action.error} retry={reload}/>
    <form className="panel form-stack" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),vendorId=Number(f.get('vendor'));const old=result.data?.find(r=>r.session_id===session?.id&&r.retailer_id===vendorId);void action.run('/admin/sales-reports',{sessionId:session?.id,vendorId,grossCents:Math.round(Number(f.get('gross'))*100),transactions:Number(f.get('transactions')),note:f.get('note'),version:old?.version??0});}}><h3>{t('代商户填报销售')}</h3><label>{t('营业日期')}<input required type="date" max={reportToday()} value={date} onChange={e=>{if(e.target.value){setDate(e.target.value);saveWorkflowDate(e.target.value);setSessionId('');}}}/></label><label>{t('选择场次')}<select required value={session?.id??''} onChange={e=>setSessionId(e.target.value)}><option value="">{t('请选择场次')}</option>{sessions.data?.sessions.map(s=><option key={s.id} value={s.id}>{t(s.market_name)}</option>)}</select></label><label>{t('已签到商户')}<select name="vendor" required><option value="">{t('请选择商户')}</option>{attendees.data?.filter(v=>v.status==='checked_in').map(v=><option key={v.retailer_id} value={v.retailer_id}>{t(v.name)}</option>)}</select></label><label>{t('总销售额（USD）')}<input required name="gross" type="number" min="0" max="1000000" step="0.01"/></label><label>{t('交易笔数')}<input required name="transactions" type="number" min="0" max="100000" step="1"/></label><label>{t('备注')}<input name="note" maxLength={500}/></label><button className="button primary" disabled={action.busy||sessions.loading||attendees.loading||!session||!!session.cancelled}>{t('保存销售填报')}</button></form>
    <p>{t('已有 {count} 份销售填报；未填报商户的数据未知。',{count:result.data?.length??0})}</p><div className="workflow-cards">{result.data?.map(r=><article className="panel" key={`${r.session_id}:${r.retailer_id}`}><h3>{r.date} · {t(r.vendor_name)}</h3><p>{t(r.market_name)}</p><strong>{money(r.gross_cents)} · {r.transactions} {t('交易笔数')}</strong><p>{r.note}</p></article>)}</div><p className="helper-text">{t('本站预购统计仍单独展示，不据此推算现场客流。')} {data.summary.orders}</p>
  </>;
}
function Invoices({data,marketId}:{data:SchoolOverview;marketId:number|null}) {
  const {t}=useLanguage(),[revision,setRevision]=useState(0),[market,setMarket]=useState(String(marketId??data.markets[0]?.id??''));const reload=()=>setRevision(n=>n+1);
  const result=useWorkflow<Invoice[]>('/admin/invoices',revision),action=useWorkflowAction(reload);
  const invoices=result.data?.filter(i=>!marketId||i.market_id===marketId);
  return <><p>{t('仅按已确认的收费政策开立账单。这里登记线下收款，不执行在线付款。')}</p><WorkflowFeedback loading={result.loading} error={result.error||action.error} retry={reload}/><form className="panel form-stack" onSubmit={e=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form);void action.run('/admin/invoices',{marketId:Number(market),vendorId:Number(f.get('vendor')),description:f.get('description'),amountCents:Math.round(Number(f.get('amount'))*100),dueOn:f.get('due')});}}><h3>{t('开立商户账单')}</h3><label>{t('运营市场')}<select required value={market} onChange={e=>setMarket(e.target.value)}>{data.markets.filter(m=>!marketId||m.id===marketId).map(m=><option key={m.id} value={m.id}>{t(m.name)}</option>)}</select></label><label>{t('商户')}<select required name="vendor" key={market}><option value="">{t('请选择商户')}</option>{data.vendors.filter(v=>v.marketIds.includes(Number(market))).map(v=><option key={v.id} value={v.id}>{t(v.name)}</option>)}</select></label><label>{t('费用说明')}<input required name="description" maxLength={500}/></label><label>{t('账单金额（USD）')}<input required name="amount" type="number" min="0.01" max="100000" step="0.01"/></label><label>{t('到期日')}<input required name="due" type="date"/></label><button className="button primary" disabled={action.busy||result.loading}>{t('开立账单')}</button></form>
    <div className="workflow-cards">{invoices?.map(i=><article className="panel" key={i.id}><h3>#{i.id} · {t(i.vendor_name)}</h3><p>{t(i.market_name)} · {i.description}</p><p>{t('到期日')} {i.due_on}</p><p>{t('账单金额')} {money(i.amount_cents)} · {t('已登记收款')} {money(i.paid_cents)}</p><strong>{t(i.status==='void'?'账单已作废':'未收金额')} {i.status!=='void'&&money(i.amount_cents-i.paid_cents)}</strong>{i.status==='issued'&&i.amount_cents>i.paid_cents&&<form className="form-stack" key={i.version} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void action.run(`/admin/invoices/${i.id}/payments`,{amountCents:Math.round(Number(f.get('amount'))*100),reference:f.get('reference'),version:i.version});}}><label>{t('本次已收金额（USD）')}<input required name="amount" min="0.01" step="0.01" type="number" max={(i.amount_cents-i.paid_cents)/100}/></label><label>{t('收款凭据参考号')}<input required name="reference" maxLength={500}/></label><button className="button" disabled={action.busy||result.loading}>{t('登记线下收款')}</button></form>}{i.status==='issued'&&i.paid_cents===0&&<form className="form-stack" onSubmit={e=>{e.preventDefault();void action.run(`/admin/invoices/${i.id}/void`,{reason:new FormData(e.currentTarget).get('reason'),version:i.version});}}><label>{t('作废原因')}<input name="reason" required maxLength={500}/></label><button className="button danger" disabled={action.busy}>{t('作废未收账单')}</button></form>}</article>)}</div>
  </>;
}
type CommunicationsData={emailConfigured:boolean;outbox:{id:number;recipient:string;status:string;attempts:number;last_error:string;message_key:string;values:Record<string,string|number>}[]};
function Communications() {
  const {t}=useLanguage(),[revision,setRevision]=useState(0);const reload=()=>setRevision(n=>n+1),result=useWorkflow<CommunicationsData>('/admin/communications',revision);
  const statuses:Record<string,string>={unconfigured:'未配置邮件服务',queued:'等待发送',failed:'发送失败',sent:'服务商已接受'};
  return <><p>{t('站内通知即时生成。邮件只有服务商成功接受后才显示已发送；失败和未配置状态会保留。')}</p><button className="button" onClick={reload}>{t('刷新')}</button><WorkflowFeedback loading={result.loading} error={result.error} retry={reload}/><p role="status">{t(result.data?.emailConfigured?'邮件服务已配置':'邮件服务尚未配置，当前仅提供站内通知。')}</p><div className="workflow-cards">{result.data?.outbox.map(m=><article className="panel" key={m.id}><strong>{m.recipient}</strong><p>{t(m.message_key,m.values)}</p><span className="school-badge">{t(statuses[m.status]??m.status)}</span><small> · {m.attempts}</small>{m.last_error&&<p>{m.last_error}</p>}</article>)}</div></>;
}
