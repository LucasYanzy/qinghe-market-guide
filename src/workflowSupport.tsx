import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useLanguage, type Message } from './i18n';
import './workflows.css';

export function useWorkflow<T>(path:string|null, revision=0) {
  const [state,setState]=useState<{path:string|null;data?:T;error:Message;loading:boolean}>(()=>({path,error:'',loading:!!path}));
  useEffect(()=>{
    let current=true;
    if(!path){setState({path,data:undefined,error:'',loading:false});return;}
    const controller=new AbortController();
    setState(previous=>({path,data:previous.path===path?previous.data:undefined,error:'',loading:true}));
    api<T>(path,{signal:controller.signal})
      .then(data=>{if(current)setState({path,data,error:'',loading:false});})
      .catch(error=>{if(current)setState(previous=>({...previous,error,loading:false}));});
    return()=>{current=false;controller.abort();};
  },[path,revision]);
  // Scope changes must hide the previous response during the render itself,
  // before effects run, so old rows cannot be submitted for a new session.
  return state.path===path?state:{data:undefined,error:'',loading:!!path};
}
export function useWorkflowAction(reload:()=>void) {
  const [busy,setBusy]=useState(false),[error,setError]=useState<Message>('');const running=useRef(false);
  const run=async(path:string,body:object,method='POST')=>{
    if(running.current)return false;running.current=true;setBusy(true);setError('');
    try{await api(path,{method,body:JSON.stringify(body)});reload();return true;}catch(e){setError(e as Error);return false;}finally{running.current=false;setBusy(false);}
  };
  return {busy,error,run};
}
export function WorkflowFeedback({loading,error,retry}:{loading:boolean;error:Message;retry:()=>void}) {
  const {t}=useLanguage();
  return <>{loading&&<p role="status">{t('正在读取工作记录…')}</p>}{error&&<div className="error-panel" role="alert">{t(error)}<button className="button" onClick={retry}>{t('刷新并重试')}</button></div>}</>;
}
export const applicationLabels:Record<string,string>={submitted:'待审核',needs_info:'待补充资料',waitlisted:'候补',approved:'审核通过',rejected:'未通过审核'};
export const attendanceLabels:Record<string,string>={planned:'计划出摊',confirmed:'已确认出摊',absent:'请假',checked_in:'已签到'};
export interface VendorApplication {id:number;applicant_id:number;market_id:number;business_name:string;contact_name:string;phone:string;description:string;status:string;review_note:string;version:number;market_name:string;email?:string}
export interface VendorSession {session_id:number;retailer_id:number;status:string;booth:string;note:string;version:number;date:string;market_name:string;starts_at:string;ends_at:string;cancelled:number;notice:string;gross_cents:number|null;transactions:number|null;sales_version:number|null}
export interface Invoice {id:number;market_id:number;retailer_id:number;description:string;amount_cents:number;paid_cents:number;due_on:string;status:string;version:number;market_name:string;vendor_name:string}
