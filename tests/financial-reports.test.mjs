import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase, marketDay } from '../server/db.mjs';
import { migrateWorkflows } from '../server/workflow-schema.mjs';
import { operatorFinance, vendorProfitability } from '../server/financial-reports.mjs';
import { reportPeriod, shiftDate } from '../server/analytics.mjs';
import { schoolOverview } from '../server/admin.mjs';
import { financeTrend } from '../src/schoolReports.ts';
import { createApp } from '../server/app.mjs';

function session(db,date,vendor=2,{cancelled=0,status='checked_in'}={}) {
  const id=Number(db.prepare("INSERT INTO market_sessions(market_id,date,starts_at,ends_at,cutoff,slot_minutes,capacity,cancelled) VALUES (1,?,'09:00','13:00','08:00',30,20,?)").run(date,cancelled).lastInsertRowid);
  db.prepare('INSERT INTO session_vendors(session_id,retailer_id,status) VALUES (?,?,?)').run(id,vendor,status);
  return id;
}
function sale(db,id,vendor,gross,goods=null,operating=null) {
  db.prepare("INSERT INTO vendor_sales_reports(session_id,retailer_id,gross_cents,transactions,note,recorded_by,goods_cost_cents,operating_cost_cents) VALUES (?,?,?,1,'test',?,?,?)").run(id,vendor,gross,vendor,goods,operating);
}
function entry(db,date,kind,category,amount,market=1) {
  return Number(db.prepare("INSERT INTO operator_entries(market_id,recorded_on,kind,category,amount_cents,description,request_key,request_json,recorded_by) VALUES (?,?,?,?,?,'Test',?,'{}',2)").run(market,date,kind,category,amount,randomUUID()).lastInsertRowid);
}

test('cost migration is repeatable, preserves historical sales and distinguishes unknown costs from zero',()=>{
  const db=openDatabase(':memory:');
  try {
    const id=session(db,marketDay());sale(db,id,2,5000);
    db.exec('ALTER TABLE vendor_sales_reports DROP COLUMN goods_cost_cents; ALTER TABLE vendor_sales_reports DROP COLUMN operating_cost_cents');
    migrateWorkflows(db);migrateWorkflows(db);
    const row=db.prepare('SELECT * FROM vendor_sales_reports').get();
    assert.equal(row.gross_cents,5000);assert.equal(row.goods_cost_cents,null);assert.equal(row.operating_cost_cents,null);
    assert.throws(()=>db.prepare('UPDATE vendor_sales_reports SET goods_cost_cents=-1').run());
    const p=vendorProfitability(db,reportPeriod('7'),2);
    assert.equal(p.salesCents,5000);assert.equal(p.goodsCostCents,null);assert.equal(p.grossProfitCents,null);assert.equal(p.operatingSurplusCents,null);
  } finally {db.close();}
});

test('vendor profitability uses matching coverage denominators and excludes other vendors, absences, cancellations and future sessions',()=>{
  const db=openDatabase(':memory:'),today=marketDay();
  try {
    sale(db,session(db,today),2,1000,1500,200); // A real reported loss must stay negative.
    sale(db,session(db,shiftDate(today,-1)),2,2000,0,null);
    sale(db,session(db,shiftDate(today,-2)),2,9000);
    sale(db,session(db,shiftDate(today,-3),3),3,99999,1,1);
    sale(db,session(db,shiftDate(today,-4),2,{cancelled:1}),2,99999,1,1);
    sale(db,session(db,shiftDate(today,-5),2,{status:'absent'}),2,99999,1,1);
    sale(db,session(db,shiftDate(today,1)),2,99999,1,1);
    const p=vendorProfitability(db,{from:shiftDate(today,-6),to:shiftDate(today,1)},2);
    assert.equal(p.reports,3);assert.equal(p.salesCents,12000);assert.equal(p.grossCovered,2);assert.equal(p.grossCoveredSalesCents,3000);
    assert.equal(p.goodsCostCents,1500);assert.equal(p.grossProfitCents,1500);assert.equal(p.completeCovered,1);assert.equal(p.completeSalesCents,1000);assert.equal(p.operatingSurplusCents,-700);
    assert.equal(p.rows.find(r=>r.date===today).grossProfitCents,-500);
    assert.equal(p.rows.find(r=>r.date===shiftDate(today,-1)).operatingSurplusCents,null);
    assert.equal(vendorProfitability(db,reportPeriod('7'),999).salesCents,null);
  } finally {db.close();}
});

test('operator finance separates public costs, historical comparison, actual Eastern fee receipts and voided records',()=>{
  const db=openDatabase(':memory:'),today=marketDay(),period=reportPeriod('7');
  try {
    entry(db,today,'income','grant',10000);entry(db,today,'expense','labor',4000);
    entry(db,today,'expense','insurance',500,null);entry(db,period.previous.to,'income','donation',3000);
    const voided=entry(db,today,'expense','site',99999);
    db.prepare("UPDATE operator_entries SET voided_at=CURRENT_TIMESTAMP WHERE id=?").run(voided);
    const invoice=Number(db.prepare("INSERT INTO vendor_invoices(market_id,retailer_id,description,amount_cents,due_on,created_by) VALUES (1,2,'Fee',5000,?,2)").run(period.previous.to).lastInsertRowid);
    for (const [cents,stamp] of [[1000,`${period.from} 12:00:00`],[600,`${period.from} 02:00:00`]]) db.prepare("INSERT INTO invoice_payments(invoice_id,amount_cents,reference,recorded_by,created_at) VALUES (?,?,'Test',2,?)").run(invoice,cents,stamp);
    const p=operatorFinance(db,period,1);
    assert.equal(p.current.incomeCents,11000);assert.equal(p.current.expenseCents,4000);assert.equal(p.current.netCents,7000);
    assert.equal(p.previous.incomeCents,3600);assert.equal(p.previous.netCents,null);
    assert.equal(p.entries.length,3);assert.ok(p.entries.some(r=>r.category==='vendor_fees'&&r.amountCents===1000));
    assert.equal(p.series.find(r=>r.date===period.from).expenseCents,null);
    assert.equal(operatorFinance(db,period).current.expenseCents,4500);
    assert.equal(operatorFinance(db,{from:'1970-01-01',to:'1970-01-02'}).current.netCents,null);
    db.prepare("UPDATE vendor_invoices SET status='void' WHERE id=?").run(invoice);
    assert.equal(operatorFinance(db,period,1).current.incomeCents,10000);
    assert.equal(schoolOverview(db,'7').analytics.finance.current.expenseCents,4500);
  } finally {db.close();}
});

test('finance charts align by actual day offsets across month boundaries and preserve missing and zero records',()=>{
  const finance={series:[{date:'2026-03-01',incomeCents:0,expenseCents:null},{date:'2026-03-03',incomeCents:100,expenseCents:20}],previousSeries:[{date:'2026-02-25',incomeCents:70,expenseCents:null},{date:'2026-02-27',incomeCents:30,expenseCents:null}]};
  const daily=financeTrend(finance,'2026-03-01','2026-03-04','2026-02-25','incomeCents',false);
  assert.equal(daily.length,4);assert.equal(daily[0].value,0);assert.equal(daily[1].value,null);assert.equal(daily[0].previous,70);assert.equal(daily[2].previous,30);
  const monthly=financeTrend(finance,'2026-03-01','2026-03-04','2026-02-25','incomeCents',true);
  assert.equal(monthly[0].value,100);assert.equal(monthly[0].previous,100);assert.equal(monthly[0].previousDate,'2026-02-25 – 2026-02-28');
  assert.deepEqual(financeTrend({series:[],previousSeries:[]},'2026-03-01','2026-03-04',null,'incomeCents',false),[]);
  const priorOnly=financeTrend({series:[],previousSeries:finance.previousSeries},'2026-03-01','2026-03-04','2026-02-25','incomeCents',false);
  assert.equal(priorOnly[0].value,null);assert.equal(priorOnly[0].previous,70);
});

test('finance APIs validate entries, deduplicate retries, enforce roles and keep vendor costs out of admin responses and audit logs',async t=>{
  const db=openDatabase(':memory:'),today=marketDay(),id=session(db,today);
  const server=createApp(db).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();});
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const request=async(path,cookie='',method='GET',body)=>{const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
  const cookies={};for(const role of ['admin','retailer','client'])cookies[role]=(await request('/auth/login','','POST',{email:`${role}@qinghe.demo`,password:'MarketDemo2026!'})).cookie;
  const payload={marketId:1,date:today,kind:'expense',category:'labor',amountCents:900,description:'Test payroll',reference:'Receipt A',requestKey:randomUUID()};
  assert.equal((await request('/admin/finance/entries','','POST',payload)).status,401);
  assert.equal((await request('/admin/finance/entries',cookies.retailer,'POST',payload)).status,403);
  assert.equal((await request('/admin/finance/entries',cookies.client,'POST',payload)).status,403);
  const [a,b]=await Promise.all([request('/admin/finance/entries',cookies.admin,'POST',payload),request('/admin/finance/entries',cookies.admin,'POST',payload)]);
  assert.equal(a.status,200);assert.equal(b.data.id,a.data.id);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM operator_entries').get().n,1);
  assert.equal((await request('/admin/finance/entries',cookies.admin,'POST',{...payload,amountCents:901})).status,409);
  for(const patch of [{date:shiftDate(today,1)},{date:'2026-02-30'},{category:'donation'},{category:'vendor_fees'},{amountCents:-1},{amountCents:0.5},{marketId:999}]) assert.ok((await request('/admin/finance/entries',cookies.admin,'POST',{...payload,...patch,requestKey:randomUUID()})).status>=400);
  const zero=await request('/admin/finance/entries',cookies.admin,'POST',{...payload,amountCents:0,requestKey:randomUUID()});assert.equal(zero.status,200);
  assert.equal((await request(`/admin/finance/entries/${a.data.id}/void`,cookies.admin,'POST',{reason:'Correcting',version:0})).status,200);
  assert.equal((await request(`/admin/finance/entries/${a.data.id}/void`,cookies.admin,'POST',{reason:'Retry',version:0})).status,409);
  assert.equal(operatorFinance(db,reportPeriod('7')).current.expenseCents,0);
  assert.equal(db.prepare('SELECT amount_cents,void_reason FROM operator_entries WHERE id=?').get(a.data.id).void_reason,'Correcting');
  const sales={sessionId:id,vendorId:2,grossCents:5000,transactions:3,note:'Test',version:0,goodsCostCents:1200,operatingCostCents:300};
  assert.equal((await request('/vendor/sales-reports',cookies.retailer,'POST',sales)).status,200);
  const mine=(await request('/retailer/analytics?range=7',cookies.retailer)).data.profitability;assert.equal(mine.grossProfitCents,3800);assert.equal(mine.operatingSurplusCents,3500);
  const adminReports=JSON.stringify((await request('/admin/sales-reports',cookies.admin)).data);assert.ok(!adminReports.includes('goods_cost_cents'));assert.ok(!adminReports.includes('operating_cost_cents'));
  assert.equal((await request('/admin/sales-reports',cookies.admin,'POST',{...sales,version:1})).status,403);
  const {goodsCostCents,operatingCostCents,...adminUpdate}=sales;
  assert.equal((await request('/admin/sales-reports',cookies.admin,'POST',{...adminUpdate,version:1})).status,200);
  assert.equal(db.prepare('SELECT goods_cost_cents FROM vendor_sales_reports').get().goods_cost_cents,1200);
  assert.equal((await request('/retailer/analytics',cookies.admin)).status,403);
  const log=JSON.stringify(db.prepare("SELECT * FROM operation_events WHERE action='sales_reported'").all());assert.ok(!log.includes('goodsCostCents'));assert.ok(!log.includes('operatingCostCents'));
  const cleared=await request('/vendor/sales-reports',cookies.retailer,'POST',{...sales,version:2,goodsCostCents:null,operatingCostCents:0});assert.equal(cleared.status,200);
  assert.equal(vendorProfitability(db,reportPeriod('7'),2).grossProfitCents,null);
});
