import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, marketDay } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';
import { getOrders, placeOrder, priceCart, updateOrderStatus } from '../server/services.mjs';
import { recordPickup, pickupOptions } from '../server/operations.mjs';
import { notifyUser, deliverOutbox } from '../server/notifications.mjs';
import { shiftDate } from '../server/analytics.mjs';

const cart = { items:[{productId:1,quantity:1}], pickupSlot:'22:00–23:00', note:'' };
async function fixture(t) {
  const db=openDatabase(':memory:'),date=marketDay();
  const session=Number(db.prepare("INSERT INTO market_sessions (market_id,date,starts_at,ends_at,cutoff,slot_minutes,capacity,status) VALUES (1,?,'00:00','23:59','23:59',60,20,'open')").run(date).lastInsertRowid);
  const server=createApp(db).listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await new Promise(r=>server.close(r));db.close();});
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const request=async(path,cookie='',method='GET',body,headers={})=>{
    const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
  };
  const cookies={};
  for(const role of ['client','retailer','admin']) cookies[role]=(await request('/auth/login','','POST',{email:`${role}@qinghe.demo`,password:'MarketDemo2026!'})).cookie;
  return {db,date,session,request,...cookies,user:{id:1,role:'client'},staff:db.prepare("SELECT * FROM users WHERE role='admin'").get()};
}

test('concurrent idempotent submissions reserve inventory and slot capacity once; replay survives closure',async t=>{
  const f=await fixture(t),{db,request,client,user,session}=f;
  db.prepare('UPDATE market_sessions SET capacity=1 WHERE id=?').run(session);
  const stock=db.prepare('SELECT stock FROM products WHERE id=1').get().stock;
  const replies=await Promise.all(Array.from({length:4},()=>request('/orders',client,'POST',cart,{'Idempotency-Key':'retry-order-123'})));
  replies.forEach(r=>assert.equal(r.status,201,JSON.stringify(r.data)));
  assert.equal(new Set(replies.map(r=>r.data.id)).size,1);
  assert.equal(db.prepare('SELECT stock FROM products WHERE id=1').get().stock,stock-1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders WHERE market_session_id=?').get(session).n,1);
  assert.equal((await request('/orders',client,'POST',{...cart,note:'changed'},{'Idempotency-Key':'retry-order-123'})).status,409);
  db.exec("UPDATE market_sessions SET status='closed';UPDATE products SET active=0 WHERE id=1");
  assert.equal(placeOrder(db,user,cart,{submissionKey:'retry-order-123'}).id,replies[0].data.id);
  assert.equal((await request('/order-submissions/retry-order-123',client)).data.id,replies[0].data.id);
  const stranger=(await request('/auth/register','','POST',{name:'Other customer',email:'other@example.com',password:'DifferentPassword42'})).cookie;
  assert.equal((await request('/order-submissions/retry-order-123',stranger)).status,404);
  assert.equal((await request('/order-submissions/retry-order-123')).status,401);
});

test('fractional pounds round to cents, reject fractional counts and zero-cent lines',async t=>{
  const {db}=await fixture(t);
  db.exec("UPDATE products SET unit='磅',price_cents=350 WHERE id=1");
  assert.equal(priceCart(db,{items:[{productId:1,quantity:.8}]}).total,280);
  db.exec("UPDATE products SET unit='个' WHERE id=1");
  assert.throws(()=>priceCart(db,{items:[{productId:1,quantity:.8}]}),e=>e.status===400);
  db.exec("UPDATE products SET unit='磅',price_cents=1 WHERE id=1");
  for(const q of [.001,.0001]) assert.throws(()=>priceCart(db,{items:[{productId:1,quantity:q}]}),e=>e.status===400);
});

test('weight adjustment requires owning customer approval, recalculates SNAP snapshot, and settles the final total',async t=>{
  const {db,request,user,staff,client,retailer,admin}=await fixture(t);
  db.exec("UPDATE products SET unit='磅',price_cents=350,snap_eligibility='eligible' WHERE id=1");
  db.prepare("UPDATE markets SET snap_status='accepted',snap_model='vendor_terminal',snap_verified_on=?,snap_note='Verified' WHERE id=1").run(marketDay());
  db.prepare("UPDATE market_vendors SET snap_status='accepted',snap_verified_on=?,snap_note='Verified' WHERE market_id=1 AND retailer_id=2").run(marketDay());
  const initial=db.prepare('SELECT stock FROM products WHERE id=1').get().stock;
  const order=placeOrder(db,user,{...cart,paymentMethod:'snap_ebt'});
  updateOrderStatus(db,staff,order.id,'confirmed');
  const current=db.prepare('SELECT * FROM products WHERE id=1').get();
  const edit={market_id:current.market_id,name:current.name,category:current.category,art:current.art,unit:'个',price_cents:current.price_cents,stock:current.stock,description:current.description,organic:!!current.organic,available_date:current.available_date,active:!!current.active,snap_eligibility:current.snap_eligibility};
  assert.equal((await request('/retailer/products/1',retailer,'PUT',edit)).status,409);
  assert.equal(db.prepare('SELECT unit FROM products WHERE id=1').get().unit,'磅');
  const proposal={items:[{productId:1,quantity:.8}],reason:'Actual weight',version:0};
  assert.equal((await request(`/orders/${order.id}/adjustment`,client,'POST',proposal)).status,403);
  assert.equal((await request(`/orders/${order.id}/adjustment`,retailer,'POST',{...proposal,items:[{productId:1,quantity:2}]})).status,400);
  const adjusted=await request(`/orders/${order.id}/adjustment`,retailer,'POST',proposal);assert.equal(adjusted.status,200,JSON.stringify(adjusted.data));assert.equal(adjusted.data.total_cents,280);
  const receipt={pickupCode:order.pickup_code,cashCents:0,cardCents:0,snapCents:280,reference:'Terminal receipt'};
  assert.throws(()=>recordPickup(db,staff,order.id,receipt),e=>e.status===409);
  assert.equal((await request(`/orders/${order.id}/adjustment/review`,admin,'POST',{accept:true,version:1})).status,403);
  assert.equal((await request(`/orders/${order.id}/adjustment/review`,client,'POST',{accept:true,version:0})).status,409);
  assert.equal((await request(`/orders/${order.id}/adjustment/review`,client,'POST',{accept:true,version:1})).status,200);
  assert.equal((await request(`/orders/${order.id}/adjustment/review`,client,'POST',{accept:true,version:1})).status,409);
  const effective=getOrders(db,user).find(o=>o.id===order.id);
  assert.equal(effective.total_cents,280);assert.equal(effective.original_total_cents,350);assert.equal(effective.snap_plan.totalCents,280);assert.equal(effective.snap_plan.items[0].quantity,.8);assert.equal(effective.snap_eligible_cents,280);assert.equal(effective.other_payment_cents,0);
  assert.equal(db.prepare('SELECT stock FROM products WHERE id=1').get().stock,initial-.8);
  assert.throws(()=>recordPickup(db,staff,order.id,{...receipt,snapCents:350}),e=>e.status===400);
  recordPickup(db,staff,order.id,receipt);
  assert.equal(db.prepare('SELECT total_cents FROM orders WHERE id=?').get(order.id).total_cents,350);
  assert.equal(db.prepare('SELECT snap_cents FROM order_receipts WHERE order_id=?').get(order.id).snap_cents,280);
});

test('adjusted cancellation returns only remaining reserved stock and rejected proposals can be revised',async t=>{
  const {db,request,user,staff,client,retailer}=await fixture(t);
  db.exec("UPDATE products SET unit='磅',price_cents=350 WHERE id=1");
  const stock=db.prepare('SELECT stock FROM products WHERE id=1').get().stock,order=placeOrder(db,user,cart);
  updateOrderStatus(db,staff,order.id,'confirmed');
  const path=`/orders/${order.id}/adjustment`;
  assert.equal((await request(path,retailer,'POST',{items:[{productId:1,quantity:.8}],reason:'Weight',version:0})).status,200);
  assert.equal((await request(path+'/review',client,'POST',{accept:false,version:1})).status,200);
  assert.equal(db.prepare('SELECT stock FROM products WHERE id=1').get().stock,stock-1);
  assert.equal((await request(path,retailer,'POST',{items:[{productId:1,quantity:.7}],reason:'Updated weight',version:1})).status,200);
  assert.equal((await request(path+'/review',client,'POST',{accept:true,version:2})).status,200);
  updateOrderStatus(db,staff,order.id,'cancelled',{reason:'Customer unavailable'});
  assert.equal(db.prepare('SELECT stock FROM products WHERE id=1').get().stock,stock);
  assert.throws(()=>updateOrderStatus(db,staff,order.id,'cancelled',{reason:'Again'}),e=>e.status===409);
});

test('application review preserves customer history and role permissions, with resubmission and business identity',async t=>{
  const {db,request,user,client,admin,session}=await fixture(t);
  const oldOrder=placeOrder(db,user,cart);
  const application={marketId:1,businessName:'Campus Orchard',contactName:'Contact person',phone:'555-0100',description:'Apples and qualifications'};
  const created=await request('/vendor/applications',client,'POST',application);assert.equal(created.status,201);
  const id=created.data.id;
  assert.equal((await request('/vendor/applications',client,'POST',application)).status,409);
  assert.equal((await request('/admin/applications',client)).status,403);
  assert.equal((await request(`/admin/applications/${id}`,admin,'PATCH',{status:'needs_info',note:'Supply details',version:0})).status,200);
  assert.equal((await request(`/vendor/applications/${id}`,client,'PATCH',{description:'Updated supply details',version:1})).status,200);
  assert.equal((await request(`/admin/applications/${id}`,admin,'PATCH',{status:'approved',note:'Welcome',version:2})).status,200);
  assert.equal((await request(`/admin/applications/${id}`,admin,'PATCH',{status:'approved',note:'Again',version:2})).status,409);
  const me=(await request('/auth/me',client)).data.user;assert.equal(me.role,'client');assert.deepEqual(me.roles.sort(),['client','retailer']);assert.equal(me.name,'林同学');
  assert.ok((await request('/orders',client)).data.some(o=>o.id===oldOrder.id));
  assert.equal((await request('/auth/role',client,'POST',{role:'admin'})).status,403);
  assert.equal((await request('/auth/role',client,'POST',{role:'retailer'})).status,200);
  assert.equal((await request('/retailer/products',client)).status,200);
  assert.equal((await request('/orders',client,'POST',cart)).status,403);
  await request(`/admin/sessions/${session}/vendors`,admin,'PUT',{vendorId:1,status:'confirmed',booth:'A2',version:0});
  const directory=(await request(`/session-directory?date=${marketDay()}`)).data;
  assert.equal(directory[0].vendors.find(v=>v.id===1).name,'Campus Orchard');assert.ok(!JSON.stringify(directory).includes('555-0100'));assert.ok(!JSON.stringify(directory).includes('client@'));
  assert.equal((await request('/auth/role',client,'POST',{role:'client'})).status,200);
  assert.ok((await request('/orders',client)).data.some(o=>o.id===oldOrder.id));
});

test('booths and attendance enforce membership, versions, dates and checked-in ownership',async t=>{
  const {db,request,admin,retailer,session,date}=await fixture(t);
  const path=`/admin/sessions/${session}/vendors`;
  assert.equal((await request(path,admin,'PUT',{vendorId:2,status:'planned',booth:'A1',version:0})).status,200);
  assert.equal((await request(path,admin,'PUT',{vendorId:2,status:'confirmed',booth:'A1',version:0})).status,409);
  assert.equal((await request(path,admin,'PUT',{vendorId:3,status:'confirmed',booth:'A1',version:0})).status,409);
  db.exec('INSERT OR IGNORE INTO market_vendors (market_id,retailer_id) VALUES (1,3)');
  assert.equal((await request(path,admin,'PUT',{vendorId:3,status:'confirmed',booth:'a1',version:0})).status,409);
  assert.equal((await request(`/vendor/sessions/${session}`,retailer,'PUT',{vendorId:2,status:'confirmed',booth:'changed',version:1})).status,200);
  assert.equal(db.prepare('SELECT booth FROM session_vendors WHERE session_id=? AND retailer_id=2').get(session).booth,'A1');
  assert.ok((await request('/notifications',admin)).data.some(n=>n.kind==='attendance_2'));
  assert.equal((await request(path,admin,'PUT',{vendorId:2,status:'checked_in',booth:'A1',version:2})).status,200);
  assert.equal((await request(`/vendor/sessions/${session}`,retailer,'PUT',{vendorId:2,status:'absent',version:3})).status,409);
  const future=Number(db.prepare("INSERT INTO market_sessions (market_id,date,starts_at,ends_at,cutoff,slot_minutes,capacity,status) VALUES (1,?,'10:00','12:00','09:00',60,5,'open')").run(shiftDate(date,1)).lastInsertRowid);
  assert.equal((await request(`/admin/sessions/${future}/vendors`,admin,'PUT',{vendorId:2,status:'checked_in',version:0})).status,409);
});

test('session cancellation releases unfinished reservations once, preserves completed orders, and cannot reopen',async t=>{
  const {db,request,admin,user,staff,session,date}=await fixture(t);
  const stock=db.prepare('SELECT stock FROM products WHERE id=1').get().stock;
  const pending=placeOrder(db,user,cart),finished=placeOrder(db,user,cart);
  updateOrderStatus(db,staff,finished.id,'confirmed');recordPickup(db,staff,finished.id,{pickupCode:finished.pickup_code,cashCents:finished.total_cents,cardCents:0,snapCents:0});
  const cancelled=await request(`/admin/sessions/${session}/cancel`,admin,'POST',{reason:'Severe weather',version:0});assert.equal(cancelled.status,200);assert.equal(cancelled.data.cancelledOrders,1);
  assert.equal(db.prepare('SELECT stock FROM products WHERE id=1').get().stock,stock-1);
  assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(pending.id).status,'cancelled');assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(finished.id).status,'completed');
  assert.equal((await request(`/admin/sessions/${session}/cancel`,admin,'POST',{reason:'Again',version:1})).status,409);
  assert.equal((await request(`/admin/sessions/${session}`,admin,'PATCH',{status:'open',version:1})).status,409);
  assert.equal(pickupOptions(db,1,date).slots.length,0);
  assert.ok(!(await request('/products')).data.some(p=>p.market_id===1));
  const directory=(await request(`/session-directory?date=${date}`)).data;assert.equal(directory[0].cancelled,1);assert.equal(directory[0].notice,'Severe weather');
});

test('sales reports and offline invoices enforce attendance, ownership, version and remaining balance',async t=>{
  const {db,request,admin,retailer,client,session,date}=await fixture(t);
  const sale={sessionId:session,vendorId:2,grossCents:12345,transactions:10,note:'Total including preorders',version:0};
  assert.equal((await request('/vendor/sales-reports',retailer,'POST',sale)).status,409);
  assert.equal((await request('/vendor/sales-reports',client,'POST',sale)).status,403);
  assert.equal((await request(`/admin/sessions/${session}/vendors`,admin,'PUT',{vendorId:2,status:'checked_in',version:0})).status,200);
  assert.equal((await request('/vendor/sales-reports',retailer,'POST',sale)).status,200);
  assert.equal((await request('/vendor/sales-reports',retailer,'POST',sale)).status,409);
  assert.equal((await request('/admin/sales-reports',admin)).data[0].gross_cents,12345);
  const invoice=await request('/admin/invoices',admin,'POST',{marketId:1,vendorId:2,description:'Booth fee',amountCents:5000,dueOn:date});assert.equal(invoice.status,201);
  const path=`/admin/invoices/${invoice.data.id}/payments`;
  assert.equal((await request(path,retailer,'POST',{amountCents:5000,reference:'Receipt',version:0})).status,403);
  assert.equal((await request(path,admin,'POST',{amountCents:5001,reference:'Receipt',version:0})).status,409);
  assert.equal((await request(path,admin,'POST',{amountCents:2000,reference:'Receipt one',version:0})).status,200);
  assert.equal((await request(path,admin,'POST',{amountCents:2000,reference:'Duplicate',version:0})).status,409);
  assert.equal((await request(path,admin,'POST',{amountCents:3000,reference:'Receipt two',version:1})).status,200);
  assert.equal((await request('/vendor/invoices',retailer)).data[0].paid_cents,5000);
  assert.deepEqual((await request('/vendor/invoices',client)).data,[]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM invoice_payments').get().n,2);
  assert.equal((await request(`/admin/invoices/${invoice.data.id}/void`,admin,'POST',{reason:'Cannot void a paid invoice',version:2})).status,409);
  const second=(await request('/admin/invoices',admin,'POST',{marketId:1,vendorId:2,description:'Incorrect fee',amountCents:100,dueOn:date})).data;
  assert.equal((await request(`/admin/invoices/${second.id}/void`,admin,'POST',{reason:'Entry error',version:0})).status,200);
  assert.equal((await request(`/admin/invoices/${second.id}/payments`,admin,'POST',{amountCents:100,reference:'Invalid receipt',version:1})).status,409);
});

test('notifications are private and deduplicated; outbox reports real provider success and failure without sending mail',async t=>{
  const {db,request,client,retailer}=await fixture(t);
  db.exec("UPDATE users SET email='customer@example.com' WHERE id=1");
  notifyUser(db,1,'test','one','预购 {id} 已完成。',{id:'QH-TEST'});notifyUser(db,1,'test','one','ignored');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE kind='test'").get().n,1);
  const n=(await request('/notifications',client)).data.find(n=>n.kind==='test');
  assert.equal((await request(`/notifications/${n.id}`,retailer,'PATCH',{})).status,404);
  assert.equal((await request(`/notifications/${n.id}`,client,'PATCH',{})).status,200);
  assert.equal((await request('/notifications',client)).data.find(r=>r.id===n.id).read_at!==null,true);
  await assert.rejects(deliverOutbox(db,{apiKey:'',from:''}));
  const keys=[];
  await deliverOutbox(db,{apiKey:'fake-key',from:'market@example.com',send:async(_url,options)=>{keys.push(options.headers['Idempotency-Key']);return {ok:false,status:503};}});
  assert.equal(db.prepare('SELECT status FROM email_outbox').get().status,'failed');
  await deliverOutbox(db,{apiKey:'fake-key',from:'market@example.com',send:async(_url,options)=>{keys.push(options.headers['Idempotency-Key']);assert.equal(JSON.parse(options.body).to[0],'customer@example.com');return {ok:true};}});
  assert.equal(keys[0],keys[1]);assert.equal(db.prepare('SELECT status FROM email_outbox').get().status,'sent');
  await deliverOutbox(db,{apiKey:'fake-key',from:'market@example.com',send:()=>assert.fail('Sent emails must not repeat')});
});

test('workflow migration is repeatable and preserves final quantities, notifications and identities across restart',async()=>{
  const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
  const directory=mkdtempSync(join(tmpdir(),'qinghe-workflows-')),path=join(directory,'market.sqlite');let db;
  try {
    db=openDatabase(path);const order=placeOrder(db,{id:1,role:'client'},{...cart,pickupSlot:'10:00–12:00'});
    db.prepare('INSERT INTO fulfillment_items VALUES (?,?,?)').run(order.id,1,.75);
    db.prepare('UPDATE orders SET final_total_cents=263,final_snap_eligible_cents=0 WHERE id=?').run(order.id);
    db.prepare("INSERT INTO vendor_profiles (retailer_id,business_name) VALUES (2,'Durable farm')").run();
    db.prepare("UPDATE vendor_profiles SET public_description='Durable public introduction',version=3 WHERE retailer_id=2").run();
    const profileSnapshot=JSON.stringify({businessName:'Durable farm',publicDescription:'Durable public introduction',contactName:'',phone:''});
    db.prepare('INSERT INTO vendor_profile_requests (retailer_id,before_json,proposed_json,base_version,submitted_by) VALUES (2,?,?,3,2)').run(profileSnapshot,profileSnapshot);
    db.close();db=openDatabase(path);
    const final=getOrders(db,{id:1,role:'client'}).find(o=>o.id===order.id);
    assert.equal(final.items[0].quantity,.75);assert.equal(final.total_cents,263);assert.equal(final.original_total_cents,350);
    assert.equal(db.prepare('SELECT business_name FROM vendor_directory WHERE id=2').get().business_name,'Durable farm');
    assert.equal(db.prepare('SELECT public_description,version FROM vendor_profiles WHERE retailer_id=2').get().version,3);
    assert.equal(db.prepare('SELECT proposed_json FROM vendor_profile_requests WHERE retailer_id=2').get().proposed_json,profileSnapshot);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id=1 AND entity_id=? AND kind='placed'").get(order.id).n,1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM user_roles WHERE user_id=1 AND role='client'").get().n,1);
  } finally {db?.close();rmSync(directory,{recursive:true,force:true});}
});

test('a vendor cannot adjust a legacy order containing another vendor’s items',async t=>{
  const {db,request,retailer,user,staff}=await fixture(t);
  const order=placeOrder(db,user,cart);updateOrderStatus(db,staff,order.id,'confirmed');
  db.prepare('INSERT INTO order_items (order_id,product_id,name,unit,price_cents,quantity,retailer_id) SELECT ?,id,name,unit,price_cents,1,3 FROM products WHERE id=2').run(order.id);
  const result=await request(`/orders/${order.id}/adjustment`,retailer,'POST',{items:[{productId:1,quantity:.5},{productId:2,quantity:1}],reason:'Unauthorized cross-vendor change',version:0});
  assert.equal(result.status,403);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_adjustments WHERE order_id=?').get(order.id).n,0);
});

test('profile review publishes only approved public fields, preserves identity and snapshots, and is applied once', async t => {
  const {db,request,retailer,admin,client,session,date,user}=await fixture(t);
  const original=(await request('/vendor/profile',retailer)).data.profile;
  const personalName=db.prepare('SELECT name FROM users WHERE id=2').get().name;
  const order=placeOrder(db,user,cart),originalOrder=getOrders(db,user).find(o=>o.id===order.id);
  await request(`/admin/sessions/${session}/vendors`,admin,'PUT',{vendorId:2,status:'confirmed',booth:'A1',version:0});
  const payload={businessName:'Reviewed Orchard',publicDescription:'Apples, honey & seasonal produce',contactName:'Private person',phone:'555-PRIVATE',version:original.version};
  const submitted=await request('/vendor/profile-requests',retailer,'POST',payload);assert.equal(submitted.status,201);
  const changeId=submitted.data.id;
  assert.equal((await request('/vendor/profile',retailer)).data.profile.businessName,original.businessName);
  assert.equal((await request('/vendor/profile-requests',retailer,'POST',payload)).status,409);
  let directory=(await request(`/session-directory?date=${date}`)).data;
  assert.equal(directory[0].vendors.find(v=>v.id===2).description,'');
  assert.ok(!JSON.stringify(directory).includes('Reviewed Orchard'));
  assert.equal((await request(`/admin/vendor-profile-requests/${changeId}`,client,'PATCH',{status:'approved',note:'By customer',version:0})).status,403);
  const decision={status:'approved',note:'Public introduction checked',version:0};
  const reviews=await Promise.all([request(`/admin/vendor-profile-requests/${changeId}`,admin,'PATCH',decision),request(`/admin/vendor-profile-requests/${changeId}`,admin,'PATCH',decision)]);
  assert.deepEqual(reviews.map(r=>r.status).sort(),[200,409]);
  const workspace=(await request('/vendor/profile',retailer)).data;
  assert.equal(workspace.profile.version,1);assert.equal(workspace.profile.businessName,payload.businessName);
  assert.equal(workspace.requests[0].before.businessName,original.businessName);
  assert.equal(workspace.requests[0].proposed.contactName,'Private person');assert.ok(workspace.requests[0].reviewed_at);
  assert.equal(db.prepare('SELECT name FROM users WHERE id=2').get().name,personalName);
  assert.equal(db.prepare('SELECT farm FROM products WHERE id=1').get().farm,'Reviewed Orchard');
  assert.deepEqual(getOrders(db,user).find(o=>o.id===order.id),originalOrder);
  directory=(await request(`/session-directory?date=${date}`)).data;
  const publicVendor=directory[0].vendors.find(v=>v.id===2);
  assert.deepEqual(Object.keys(publicVendor).sort(),['booth','description','id','name','status']);
  assert.equal(publicVendor.name,'Reviewed Orchard');assert.equal(publicVendor.description,payload.publicDescription);
  for(const secret of ['Private person','555-PRIVATE','retailer@','Public introduction checked']) assert.ok(!JSON.stringify(directory).includes(secret));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM operation_events WHERE entity_type='vendor_profile_request' AND entity_id=? AND action='profile_change_reviewed'").get(String(changeId)).n,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id=2 AND kind='profile_change_reviewed' AND entity_id=?").get(String(changeId)).n,1);
});

test('profile change rejection and withdrawal preserve the live profile, with private ownership and strict validation', async t => {
  const {request,retailer,client,admin}=await fixture(t);
  assert.equal((await request('/vendor/profile')).status,401);
  assert.equal((await request('/vendor/profile',client)).status,404);
  assert.equal((await request('/admin/vendor-profiles',retailer)).status,403);
  const profile=(await request('/vendor/profile',retailer)).data.profile;
  const payload={businessName:profile.businessName,publicDescription:profile.publicDescription,contactName:profile.contactName,phone:profile.phone,version:profile.version};
  assert.equal((await request('/vendor/profile-requests',retailer,'POST',payload)).status,400);
  assert.equal((await request('/vendor/profile-requests',retailer,'POST',{...payload,businessName:'Changed',retailerId:3})).status,400);
  assert.equal((await request('/vendor/profile-requests',retailer,'POST',{...payload,businessName:'Changed',publicDescription:'x'.repeat(1001)})).status,400);
  const first=(await request('/vendor/profile-requests',retailer,'POST',{...payload,businessName:'Not approved'})).data.id;
  assert.equal((await request(`/vendor/profile-requests/${first}/withdraw`,client,'POST',{version:0})).status,404);
  assert.equal((await request(`/vendor/profile-requests/${first}/withdraw`,retailer,'POST',{version:9})).status,409);
  assert.equal((await request(`/admin/vendor-profile-requests/${first}`,admin,'PATCH',{status:'rejected',note:'Please clarify',version:0})).status,200);
  assert.deepEqual((await request('/vendor/profile',retailer)).data.profile,profile);
  const second=(await request('/vendor/profile-requests',retailer,'POST',{...payload,businessName:'Withdraw me'})).data.id;
  assert.equal((await request(`/vendor/profile-requests/${second}/withdraw`,retailer,'POST',{version:0})).status,200);
  assert.equal((await request(`/admin/vendor-profile-requests/${second}`,admin,'PATCH',{status:'approved',note:'Too late',version:0})).status,409);
  assert.equal((await request(`/vendor/profile-requests/${second}/withdraw`,retailer,'POST',{version:0})).status,409);
  const workspace=(await request('/vendor/profile',retailer)).data;
  assert.deepEqual(workspace.profile,profile);assert.deepEqual(workspace.requests.map(r=>r.status),['withdrawn','rejected']);
  assert.equal((await request('/vendor/profile-requests',retailer,'POST',{...payload,businessName:'Third request'})).status,201);
});

test('staff can submit for assisted vendors and filter by market; stale snapshots cannot overwrite newer profile data', async t => {
  const {db,request,admin}=await fixture(t);
  const vendor=(await request('/admin/assisted-vendors',admin,'POST',{name:'Assisted profile farm',marketId:1,contactName:'Initial contact'})).data;
  const list=(await request('/admin/vendor-profiles?marketId=1',admin)).data;
  assert.ok(list.some(v=>v.id===vendor.id));
  assert.ok(!(await request('/admin/vendor-profiles?marketId=99999',admin)).data.length);
  assert.equal((await request('/admin/vendor-profiles?marketId=invalid',admin)).status,400);
  const proposed={businessName:'Assisted new name',publicDescription:'Seasonal berries',contactName:'Assisted contact',phone:'555-0123',version:0};
  const change=(await request(`/admin/vendor-profiles/${vendor.id}/requests`,admin,'POST',proposed));assert.equal(change.status,201);
  assert.equal((await request('/admin/vendor-profiles?marketId=1',admin)).data.find(v=>v.id===vendor.id).pendingRequests,1);
  // An out-of-band contact correction must also invalidate the captured snapshot.
  db.prepare("UPDATE vendor_profiles SET phone='newer correction' WHERE retailer_id=?").run(vendor.id);
  assert.equal((await request(`/admin/vendor-profile-requests/${change.data.id}`,admin,'PATCH',{status:'approved',note:'Outdated',version:0})).status,409);
  assert.equal(db.prepare('SELECT phone FROM vendor_profiles WHERE retailer_id=?').get(vendor.id).phone,'newer correction');
  assert.equal((await request(`/admin/vendor-profile-requests/${change.data.id}`,admin,'PATCH',{status:'rejected',note:'Resubmit against corrected profile',version:0})).status,200);
  const next=(await request(`/admin/vendor-profiles/${vendor.id}/requests`,admin,'POST',proposed)).data.id;
  assert.equal((await request(`/admin/vendor-profile-requests/${next}`,admin,'PATCH',{status:'approved',note:'Confirmed with vendor',version:0})).status,200);
  const current=(await request(`/admin/vendor-profiles/${vendor.id}`,admin)).data.profile;
  assert.equal(current.staffManaged,true);assert.equal(current.businessName,proposed.businessName);assert.equal(current.version,1);
  assert.equal((await request(`/admin/vendor-profiles/${vendor.id}/requests`,admin,'POST',{...proposed,version:0})).status,409);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='profile_change_submitted'").get(vendor.id).n,2);
});

test('new market applications retain the approved global profile and never publish qualification text', async t => {
  const {db,request,admin,client,session,date}=await fixture(t);
  const application={marketId:1,businessName:'First approved name',contactName:'First private contact',phone:'555-PRIVATE',description:'PRIVATE qualification statement'};
  const first=(await request('/vendor/applications',client,'POST',application)).data.id;
  assert.equal((await request(`/admin/applications/${first}`,admin,'PATCH',{status:'approved',note:'Initial approval',version:0})).status,200);
  // The original client session can still manage its newly granted vendor profile.
  const change=(await request('/vendor/profile-requests',client,'POST',{businessName:'Approved global name',publicDescription:'Public apples',contactName:'Approved private contact',phone:'555-NEW',version:0})).data.id;
  assert.equal((await request(`/admin/vendor-profile-requests/${change}`,admin,'PATCH',{status:'approved',note:'Profile reviewed',version:0})).status,200);
  const before=(await request('/vendor/profile',client)).data.profile;
  const newMarket=Number(db.prepare("INSERT INTO markets (name,subtitle,address,latitude,longitude,hours,description) VALUES ('Second market','','Campus',40,-74,'','')").run().lastInsertRowid);
  const second=(await request('/vendor/applications',client,'POST',{...application,marketId:newMarket,businessName:'Old cached name'})).data.id;
  assert.equal((await request(`/admin/applications/${second}`,admin,'PATCH',{status:'approved',note:'New membership only',version:0})).status,200);
  assert.deepEqual((await request('/vendor/profile',client)).data.profile,before);
  assert.ok(db.prepare('SELECT 1 FROM market_vendors WHERE market_id=? AND retailer_id=1').get(newMarket));
  await request(`/admin/sessions/${session}/vendors`,admin,'PUT',{vendorId:1,status:'confirmed',booth:'P1',version:0});
  const directory=(await request(`/session-directory?date=${date}`)).data;
  assert.equal(directory[0].vendors.find(v=>v.id===1).description,'Public apples');
  assert.ok(!JSON.stringify(directory).includes('PRIVATE'));assert.ok(!JSON.stringify(directory).includes('private contact'));
});
