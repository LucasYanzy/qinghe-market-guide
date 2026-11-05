import { useState } from 'react';
import { SalesFields, salesValues } from './SalesTenders';
import { api, money } from './api';
import { useLanguage, type Message } from './i18n';
import type { Market, User } from './types';
import type { Page } from './navigation';
import { applicationLabels, attendanceLabels, useWorkflow, useWorkflowAction, WorkflowFeedback, type VendorApplication, type VendorSession, type Invoice } from './workflowSupport';

export function AccountRoles({user,onUser}:{user:User;onUser:(user:User)=>void}) {
  const {t}=useLanguage();const [busy,setBusy]=useState(false),[error,setError]=useState<Message>('');
  return <div className="workflow-role"><span>{t('当前身份')} · {t(user.role==='retailer'?'商户':'顾客')}</span>{user.roles?.filter(r=>r!==user.role).map(role=><button className="button" key={role} disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const next=await api<{user:User}>('/auth/role',{method:'POST',body:JSON.stringify({role})});onUser(next.user);}catch(e){setError(e as Error);}finally{setBusy(false);}}}>{t(role==='retailer'?'切换商户身份':'切换顾客身份')}</button>)}{error&&<p role="alert">{t(error)}</p>}</div>;
}

export function VendorPortal({user,onLogin,onUser}:{user:User|null;onLogin:()=>void;onUser:(user:User)=>void}) {
  const {t}=useLanguage();
  return <div className="workflow-page"><h2>{t('商户服务')}</h2><p>{t('申请入驻、查看审核意见、确认出摊安排与市场费用。工作人员也可代办。')}</p>
    {!user?<div className="panel"><p>{t('请先登录或注册顾客账号，再提交商户申请。')}</p><button className="button primary" onClick={onLogin}>{t('登录 / 注册')}</button></div>:user.role==='admin'?<p>{t('请在学校管理的商户与运营页面处理申请。')}</p>:<VendorWorkspace key={`${user.id}:${user.role}`} user={user} onUser={onUser}/>}
  </div>;
}
function VendorWorkspace({user,onUser}:{user:User;onUser:(user:User)=>void}) {
  const {t}=useLanguage();const [revision,setRevision]=useState(0),[tab,setTab]=useState('applications'),[roleError,setRoleError]=useState<Message>('');const reload=()=>setRevision(r=>r+1);
  const apps=useWorkflow<VendorApplication[]>('/vendor/applications',revision),sessions=useWorkflow<VendorSession[]>('/vendor/sessions',revision),invoices=useWorkflow<Invoice[]>('/vendor/invoices',revision),markets=useWorkflow<Market[]>('/markets',revision);
  const action=useWorkflowAction(reload);const loading=apps.loading||sessions.loading||invoices.loading||markets.loading;const error=apps.error||sessions.error||invoices.error||markets.error||action.error||roleError;
  return <><AccountRoles user={user} onUser={onUser}/><div role="tablist" className="workflow-tabs" aria-label={t('商户服务分区')}>{[['applications','入驻申请'],['sessions','我的出摊'],['invoices','市场费用']].map(([id,label])=><button role="tab" aria-selected={tab===id} key={id} onClick={()=>setTab(id)}>{t(label)}</button>)}</div>
    <WorkflowFeedback loading={loading} error={error} retry={reload}/>
    <div aria-busy={loading}>
    {tab==='applications'&&<><form className="panel form-stack" aria-label={t('提交商户申请')} onSubmit={async e=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form);if(await action.run('/vendor/applications',{marketId:Number(f.get('market')),businessName:f.get('business'),contactName:f.get('contact'),phone:f.get('phone'),description:f.get('description')}))form.reset();}}><h3>{t('提交商户申请')}</h3><fieldset disabled={action.busy||loading||!!error} className="form-stack"><label>{t('申请市场')}<select required name="market"><option value="">{t('请选择市场')}</option>{markets.data?.map(m=><option key={m.id} value={m.id}>{t(m.name)}</option>)}</select></label><label>{t('商户名称')}<input required name="business" maxLength={80}/></label><label>{t('联系人')}<input required name="contact" maxLength={80}/></label><label>{t('联系电话（选填）')}<input name="phone" type="tel" maxLength={40}/></label><label>{t('供货与资质说明')}<textarea required name="description" maxLength={1000}/></label><p>{t('请说明商品、供货方式及现有资质，不填写证件号码或银行卡信息。')}</p><button className="button primary">{t('提交申请')}</button></fieldset></form>
      <section className="workflow-cards" aria-label={t('我的申请')}>{apps.data?.map(a=><article className="panel" key={a.id}><h3>{a.business_name} · {t(a.market_name)}</h3><span className="school-badge">{t(applicationLabels[a.status])}</span><p>{a.description}</p>{a.review_note&&<p><strong>{t('审核意见')}：</strong>{a.review_note}</p>}{a.status==='approved'&&user.role!=='retailer'&&<button className="button primary" disabled={action.busy||loading} onClick={async()=>{try{const next=await api<{user:User}>('/auth/me');onUser(next.user);}catch(e){setRoleError(e as Error);}}}>{t('刷新账号身份')}</button>}
        {['needs_info','waitlisted'].includes(a.status)&&<form className="form-stack" onSubmit={e=>{e.preventDefault();void action.run(`/vendor/applications/${a.id}`,{description:new FormData(e.currentTarget).get('description'),version:a.version},'PATCH');}}><label>{t('补充资料')}<textarea name="description" required maxLength={1000} defaultValue={a.description}/></label><button className="button" disabled={action.busy||loading}>{t('补充并重新提交')}</button></form>}</article>)}{apps.data?.length===0&&<p>{t('尚未提交入驻申请。')}</p>}</section></>}
    {tab==='sessions'&&<div className="workflow-cards">{sessions.data?.map(s=><article className="panel" key={s.session_id}><h3>{s.date} · {t(s.market_name)}</h3><p>{s.starts_at}–{s.ends_at} ET · {t('摊位')} {s.booth||'—'}</p><strong>{t(s.cancelled?'场次已取消':attendanceLabels[s.status])}</strong>{s.notice&&<p role="status">{s.notice}</p>}<p>{s.note}</p>{!s.cancelled&&s.status!=='checked_in'&&<div className="modal-actions">{['confirmed','absent'].map(status=><button key={status} className="button" disabled={loading||action.busy} onClick={()=>void action.run(`/vendor/sessions/${s.session_id}`,{vendorId:user.id,status,booth:s.booth,note:s.note,version:s.version},'PUT')}>{t(status==='confirmed'?'确认出摊':'申请请假')}</button>)}</div>}
      {s.status==='checked_in'&&!s.cancelled&&<form key={s.sales_version??0} className="form-stack" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void action.run('/vendor/sales-reports',{sessionId:s.session_id,vendorId:user.id,...salesValues(f),transactions:Number(f.get('transactions')),note:String(f.get('note')??''),version:s.sales_version??0});}}><h4>{t('填报当场总销售')}</h4><p>{t('包括本站预购和现场销售；此金额为商户自报，不能与预购金额相加。')}</p><SalesFields initial={s} includeCosts/><label>{t('交易笔数')}<input required type="number" name="transactions" min="0" max="100000" step="1" defaultValue={s.transactions??''}/></label><label>{t('备注')}<input name="note" maxLength={500} defaultValue={s.sales_note??''}/></label><button className="button primary" disabled={loading||action.busy}>{t('保存销售填报')}</button></form>}
      </article>)}{sessions.data?.length===0&&<p>{t('暂无出摊安排，请联系市场工作人员。')}</p>}</div>}
    {tab==='invoices'&&<><p>{t('此处查看市场向商户收取的费用；工作人员登记线下收款，不发起在线扣款。')}</p><div className="workflow-cards">{invoices.data?.map(i=><article className="panel" key={i.id}><h3>{t(i.market_name)} · #{i.id}</h3><p>{i.description}</p><p>{t('到期日')} {i.due_on}</p><p>{t('账单金额')} {money(i.amount_cents)} · {t('已登记收款')} {money(i.paid_cents)}</p><strong>{t(i.status==='void'?'账单已作废':'未收金额')} {i.status!=='void'&&money(i.amount_cents-i.paid_cents)}</strong></article>)}{invoices.data?.length===0&&<p>{t('暂无市场费用账单。')}</p>}</div></>}
    </div></>;
}

type Notification={id:number;kind:string;entity_id:string;message_key:string;values:Record<string,string|number>;read_at:string|null;created_at:string};
export function Inbox({user,onLogin,navigate}:{user:User|null;onLogin:()=>void;navigate:(page:Page)=>void}) {
  const {t}=useLanguage();
  return <section className="workflow-page"><h2>{t('通知')}</h2>{user?<NotificationList user={user} navigate={navigate}/>:<button className="button primary" onClick={onLogin}>{t('登录查看通知')}</button>}</section>;
}
function NotificationList({user,navigate}:{user:User;navigate:(page:Page)=>void}) {
  const {t}=useLanguage(),[revision,setRevision]=useState(0);const reload=()=>setRevision(n=>n+1);
  const result=useWorkflow<Notification[]>('/notifications',revision),action=useWorkflowAction(reload);
  return <><button className="button" onClick={reload} disabled={result.loading}>{t('刷新')}</button><WorkflowFeedback loading={result.loading} error={result.error||action.error} retry={reload}/><div className="workflow-cards">{result.data?.map(n=><article className="panel" key={n.id}><span className="school-badge">{t(n.read_at?'已读':'未读')}</span><p>{t(n.message_key,n.values)}</p><small>{n.created_at} UTC</small><div className="modal-actions">{!n.read_at&&<button className="button" disabled={action.busy} onClick={()=>void action.run(`/notifications/${n.id}`,{},'PATCH')}>{t('标为已读')}</button>}<button className="button" onClick={()=>navigate(n.entity_id.startsWith('QH-')?'orders':user.role==='admin'?'school-community':'vendor')}>{t('查看相关记录')}</button></div></article>)}</div>{result.data?.length===0&&<p>{t('暂无通知。')}</p>}</>;
}
