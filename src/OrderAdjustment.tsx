import { useState } from 'react';
import { api, money } from './api';
import { useLanguage, type Message } from './i18n';
import type { OrderAdjustment } from './types';

export function OrderAdjustmentPanel({order, customer=false, refresh}: {
  order:{id:string;status:string;original_total_cents?:number;total_cents:number;adjustment?:OrderAdjustment|null;items:{product_id:number;name:string;unit:string;quantity:number;price_cents:number}[]};
  customer?:boolean;refresh:()=>void;
}) {
  const {t}=useLanguage();
  const [editing,setEditing]=useState(false),[quantities,setQuantities]=useState<Record<number,string>>({});
  const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<Message>('');
  const adjustment=order.adjustment;
  const run=async(path:string,body:object)=>{setBusy(true);setError('');try{await api(path,{method:'POST',body:JSON.stringify(body)});setEditing(false);refresh();}catch(e){setError(e as Error);}finally{setBusy(false);}};
  return <section className="workflow-adjustment" aria-label={t('商品与金额调整')}>
    {order.original_total_cents!==undefined&&order.original_total_cents!==order.total_cents&&<p>{t('原预订金额')} {money(order.original_total_cents)} · {t('确认后金额')} {money(order.total_cents)}</p>}
    {adjustment&&<div className="ops-advice"><strong>{t(adjustment.status==='proposed'?'待顾客确认调整':adjustment.status==='accepted'?'顾客已确认调整':'顾客已拒绝调整')}</strong><p>{adjustment.reason}</p>
      <ul>{adjustment.items.map(i=><li key={i.productId}>{t(i.name)} · {i.quantity} {t(i.unit)} · {money(i.lineCents)}</li>)}</ul><strong>{t('调整后金额')} {money(adjustment.total_cents)}</strong>
      {customer&&order.status==='confirmed'&&adjustment.status==='proposed'&&<div className="modal-actions"><button className="button primary" disabled={busy} onClick={()=>void run(`/orders/${order.id}/adjustment/review`,{accept:true,version:adjustment.version})}>{t('确认商品与金额')}</button><button className="button" disabled={busy} onClick={()=>void run(`/orders/${order.id}/adjustment/review`,{accept:false,version:adjustment.version})}>{t('拒绝调整')}</button></div>}
    </div>}
    {!customer&&order.status==='confirmed'&&adjustment?.status!=='accepted'&&<>
      <button className="button" disabled={busy} onClick={()=>{setEditing(!editing);setQuantities(Object.fromEntries(order.items.map(i=>[i.product_id,String(i.quantity)])));}}>{t('称重或缺货调整')}</button>
      {editing&&<form className="form-stack" onSubmit={e=>{e.preventDefault();void run(`/orders/${order.id}/adjustment`,{items:order.items.map(i=>({productId:i.product_id,quantity:Number(quantities[i.product_id])})),reason,version:adjustment?.version??0});}}>
        <p>{t('填写实际交付数量，不得超过预订数量。顾客确认前不能交付；全部缺货请取消订单。')}</p>
        {order.items.map(i=><label key={i.product_id}>{t(i.name)} · {t(i.unit)}<input aria-label={t('实际数量：{name}',{name:t(i.name)})} type="number" min="0" max={i.quantity} step={i.unit==='磅'?'0.001':'1'} required value={quantities[i.product_id]??String(i.quantity)} onChange={e=>setQuantities(q=>({...q,[i.product_id]:e.target.value}))}/></label>)}
        <label>{t('调整原因')}<textarea required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><button className="button primary" disabled={busy}>{t('提交顾客确认')}</button>
      </form>}
    </>}
    {error&&<p className="form-error" role="alert">{t(error)}</p>}
  </section>;
}
