import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test } from './fixtures';

async function login(api: APIRequestContext, role='admin') {
  expect((await api.post('/api/auth/login',{data:{email:`${role}@qinghe.demo`,password:'MarketDemo2026!'}})).ok()).toBe(true);
}
async function market(api: APIRequestContext) {
  const response=await api.post('/api/admin/markets',{data:{name:`Workflow ${test.info().testId}`,subtitle:'',address:'Campus test market',latitude:40.5,longitude:-74.45,hours:'Published sessions',description:'',community:'',coverage_radius_km:1,active:true,preorders_enabled:true}});
  expect(response.ok()).toBe(true);return response.json();
}
async function register(api: APIRequestContext) {
  const result=await api.post('/api/auth/register',{data:{name:'Workflow customer',email:`wf-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,password:'WorkflowPassword42'}});
  expect(result.ok()).toBe(true);return (await result.json()).user;
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
}

test('network-loss recovery finds the committed weighted order, then customer approves the final weight',async({page,playwright,baseURL})=>{
  const admin=await playwright.request.newContext({baseURL});await login(admin);const m=await market(admin);
  const date=(await (await admin.get('/api/config')).json()).today;
  const v=await (await admin.post('/api/admin/assisted-vendors',{data:{name:'Workflow weight farm',marketId:m.id}})).json();
  const product=await admin.post('/api/admin/operations/products',{data:{marketId:m.id,vendorId:v.id,name:'Workflow tomatoes',unit:'磅',priceCents:350,stock:1,date,category:'果实类'}});expect(product.ok()).toBe(true);const p=await product.json();
  const created=await admin.post('/api/admin/sessions',{data:{marketId:m.id,date,startsAt:'00:00',endsAt:'23:59',cutoff:'23:59',slotMinutes:60,capacity:1}});expect(created.ok()).toBe(true);const s=await created.json();
  expect((await admin.patch(`/api/admin/sessions/${s.id}`,{data:{status:'open',version:0}})).ok()).toBe(true);
  await register(page.request);await page.goto(`/?date=${date}&market=${m.id}`);
  await page.getByRole('button',{name:'将Workflow tomatoes加入购物袋',exact:true}).click();
  await page.getByRole('button',{name:/^购物袋/}).click();
  const bag=page.getByRole('dialog',{name:'我的新鲜购物袋'});
  await bag.getByLabel('预订磅数：Workflow tomatoes',{exact:true}).fill('0.8');
  let committed='';
  await page.route('**/api/orders',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    const result=await route.fetch();expect(result.ok()).toBe(true);committed=(await result.json()).id;await route.abort('failed');
  });
  await bag.getByRole('button',{name:'确认预购',exact:true}).click();
  await expect(bag.getByRole('alert')).toContainText('网络请求失败');expect(committed).toMatch(/^QH-/);
  await page.unroute('**/api/orders');await page.reload();
  await page.getByRole('button',{name:/^购物袋/}).click();
  await expect(bag.getByRole('button',{name:'确认预购',exact:true})).toBeDisabled();
  await bag.getByRole('button',{name:'检查上次提交结果',exact:true}).click();
  await expect(page).toHaveURL(/\/orders$/);await expect(page.locator('.order-card').filter({hasText:committed})).toContainText('$2.80');
  expect((await admin.patch(`/api/admin/operations/orders/${committed}`,{data:{status:'confirmed',reason:''}})).ok()).toBe(true);
  expect((await admin.post(`/api/orders/${committed}/adjustment`,{data:{items:[{productId:p.id,quantity:.65}],reason:'Actual scale weight',version:0}})).ok()).toBe(true);
  await page.reload();const order=page.locator('.order-card').filter({hasText:committed});
  await expect(order).toContainText('待顾客确认调整');await expect(order).toContainText('$2.28');
  await order.getByRole('button',{name:'确认商品与金额',exact:true}).click();await expect(order).toContainText('顾客已确认调整');
  await expect(order).toContainText('原预订金额');
  expect((await (await page.request.get('/api/orders')).json()).filter((o:{id:string})=>o.id===committed)).toHaveLength(1);
  await admin.dispose();
});

test('vendor applies, receives review, switches roles and sees invoices and notifications on mobile',async({page,playwright,baseURL})=>{
  await page.setViewportSize({width:390,height:844});
  const admin=await playwright.request.newContext({baseURL});await login(admin);const m=await market(admin);
  const user=await register(page.request);await page.goto('/vendor');
  const form=page.getByRole('form',{name:'提交商户申请',exact:true});
  await form.getByRole('combobox',{name:'申请市场',exact:true}).selectOption(String(m.id));
  await form.getByLabel('商户名称',{exact:true}).fill('Workflow Orchard');
  await form.getByLabel('联系人',{exact:true}).fill('Orchard contact');
  await form.getByLabel('供货与资质说明',{exact:true}).fill('Apples and supply qualifications');
  await form.getByRole('button',{name:'提交申请',exact:true}).click();
  await expect(page.getByRole('region',{name:'我的申请'})).toContainText('待审核');
  const app=(await (await admin.get(`/api/admin/applications?marketId=${m.id}`)).json())[0];
  expect((await admin.patch(`/api/admin/applications/${app.id}`,{data:{status:'approved',note:'Welcome orchard',version:0}})).ok()).toBe(true);
  const date=(await (await admin.get('/api/config')).json()).today;
  await admin.post('/api/admin/invoices',{data:{marketId:m.id,vendorId:user.id,description:'Orchard booth fee',amountCents:2500,dueOn:date}});
  await page.reload();await page.getByRole('button',{name:'刷新账号身份',exact:true}).click();
  await page.getByRole('button',{name:'切换商户身份',exact:true}).click();
  await expect(page).toHaveURL(/\/vendor$/);await expect(page.locator('.workflow-role')).toContainText('商户');
  await page.getByRole('tab',{name:'市场费用',exact:true}).click();await expect(page.locator('.workflow-cards')).toContainText('Orchard booth fee');await noOverflow(page);
  await page.getByRole('button',{name:'Switch to English',exact:true}).click();await expect(page.locator('.workflow-page')).toContainText('Outstanding amount');await noOverflow(page);
  await page.goto('/notifications');await expect(page.locator('.workflow-cards')).toContainText('Vendor application');
  await page.getByRole('button',{name:'Mark as read',exact:true}).first().click();await expect(page.locator('.workflow-cards')).toContainText('Read');
  await admin.dispose();
});

test('school workspace saves roster, reports sales and voids an erroneous unpaid invoice',async({page})=>{
  await login(page.request);const m=await market(page.request),date=(await (await page.request.get('/api/config')).json()).today;
  const v=await (await page.request.post('/api/admin/assisted-vendors',{data:{name:'Workflow desk vendor',marketId:m.id}})).json();
  const s=await (await page.request.post('/api/admin/sessions',{data:{marketId:m.id,date,startsAt:'00:00',endsAt:'23:59',cutoff:'23:59',slotMinutes:60,capacity:10}})).json();
  await page.goto(`/admin/community?market=${m.id}`);await page.getByRole('tab',{name:'出摊与停市',exact:true}).click();
  await page.getByRole('combobox',{name:'商户',exact:true}).selectOption(String(v.id));await page.getByLabel('摊位',{exact:true}).fill('B7');
  await page.getByRole('button',{name:'加入出摊名单',exact:true}).click();await expect(page.locator('.workflow-booths')).toContainText('B7');
  const record=page.locator('.workflow-attendee');await record.getByRole('combobox',{name:'出摊状态',exact:true}).selectOption('checked_in');await record.getByRole('button',{name:'保存出摊记录'}).click();await expect(page.locator('.workflow-booths')).toContainText('已签到');
  await page.getByRole('tab',{name:'现场销售填报',exact:true}).click();
  await page.getByRole('combobox',{name:'已签到商户',exact:true}).selectOption(String(v.id));await page.getByLabel('总销售额（USD）',{exact:true}).fill('123.45');await page.getByLabel('交易笔数',{exact:true}).fill('9');await page.getByRole('button',{name:'保存销售填报'}).click();await expect(page.locator('.workflow-cards')).toContainText('$123.45');
  await page.getByRole('tab',{name:'商户费用',exact:true}).click();await page.getByRole('combobox',{name:'商户',exact:true}).selectOption(String(v.id));await page.getByLabel('费用说明').fill('Incorrect fee');await page.getByLabel('账单金额（USD）').fill('20');await page.getByLabel('到期日').fill(date);await page.getByRole('button',{name:'开立账单',exact:true}).click();
  await expect(page.locator('.workflow-cards')).toContainText('Incorrect fee');await page.getByLabel('作废原因').fill('Entry error');await page.getByRole('button',{name:'作废未收账单',exact:true}).click();await expect(page.locator('.workflow-cards')).toContainText('账单已作废');
  await page.setViewportSize({width:320,height:844});await noOverflow(page);
  await page.getByRole('button',{name:'Switch to English',exact:true}).click();await expect(page.locator('.workflow-page')).toContainText('Invoice voided');await noOverflow(page);
  await page.screenshot({path:'output/workflows-20261030/school-mobile-en.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'output/workflows-20261030/school-desktop-en.png',fullPage:true});
  expect((await (await page.request.get('/api/admin/sales-reports')).json()).some((r:{session_id:number;gross_cents:number})=>r.session_id===s.id&&r.gross_cents===12345)).toBe(true);
});

test('cancelled linked market shows a notice and removes travel and preorder actions',async({page})=>{
  await page.clock.install({time:new Date('2026-10-29T12:00:00-04:00')});
  const session={id:100,market_id:100,market_name:'Cancelled campus market',official_location_id:'college-ave',date:'2026-10-29',starts_at:'11:00',ends_at:'16:00',cutoff:'10:00',cancelled:1,status:'closed',notice:'Weather cancellation',vendors:[]};
  await page.route('**/api/session-directory?*',route=>route.fulfill({json:[session]}));
  await page.goto('/');const hero=page.getByRole('region',{name:'最近开市安排'});await expect(hero).toContainText('Weather cancellation');
  await expect(hero.locator('.next-market-main h3')).not.toContainText('College Avenue');
  await page.goto('/markets?date=2026-10-29');const event=page.locator('.visit-event');await expect(event).toContainText('场次已取消');await expect(event).toContainText('Weather cancellation');
  await expect(event.getByRole('link',{name:'导航到这里',exact:true})).toHaveCount(0);await expect(event.getByRole('link',{name:'加入日历',exact:true})).toHaveCount(0);await expect(event.getByRole('link',{name:'查看本场商品',exact:true})).toHaveCount(0);
});
