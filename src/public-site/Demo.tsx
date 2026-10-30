import { useState } from "react";
import { ArrowRight, BarChart3, CheckCircle2, ClipboardList, Eye, Leaf, Package, School, Search, ShoppingBag, Store, Users, Wallet } from "lucide-react";
import { useLanguage } from "../i18n";
import { money } from "../api";
import { Produce } from "../Produce";
import { demoMarkets, demoOrders, demoProducts } from "./demo-data";
import "./demo.css";

type Role = "client" | "retailer" | "school";
const roles = [
  { id: "client", zh: "顾客体验", en: "Customer", icon: ShoppingBag },
  { id: "retailer", zh: "商户工作台", en: "Vendor", icon: Store },
  { id: "school", zh: "学校管理", en: "University", icon: School },
] as const;
const statusCopy = {
  pending: ["待确认", "Pending"], confirmed: ["待自提", "Ready for pickup"],
  completed: ["已完成", "Completed"], cancelled: ["已取消", "Cancelled"],
};

export default function Demo() {
  const { language } = useLanguage();
  const en = language === "en";
  const c = (zh: string, english: string) => en ? english : zh;
  const [role, setRole] = useState<Role>(() => {
    const value = new URLSearchParams(window.location.search).get("role");
    return value === "retailer" || value === "school" ? value : "client";
  });
  const [marketId, setMarketId] = useState(0);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<number | null>(null);
  const [vendorView, setVendorView] = useState("overview");
  const selectRole = (value: Role) => {
    setRole(value); setQuery(""); setDetail(null);
    const url = new URL(window.location.href); url.searchParams.set("role", value);
    window.history.replaceState(window.history.state, "", url);
  };
  const orders = demoOrders.filter((order) => !marketId || order.marketId === marketId);
  const completed = orders.filter((order) => order.status === "completed");
  const pending = orders.filter((order) => order.status === "pending" || order.status === "confirmed");
  const products = demoProducts.filter((product) => `${product.zh} ${product.en}`.toLowerCase().includes(query.toLowerCase().trim()));
  const chosen = demoProducts.find((product) => product.id === detail);
  const displayMarket = (id: number) => { const market = demoMarkets.find((item) => item.id === id)!; return en ? market.en : market.zh; };
  const metrics = [
    { label: c("示例预购", "Sample preorders"), value: String(orders.length), icon: ShoppingBag },
    { label: c("示例完成金额", "Sample completed value"), value: money(completed.reduce((sum, order) => sum + order.total, 0)), icon: Wallet },
    { label: c("示例待履约", "Sample awaiting pickup"), value: String(pending.length), icon: ClipboardList },
    { label: c("示例参与顾客", "Sample participants"), value: String(new Set(completed.map((order) => order.customer)).size), icon: Users },
  ];
  const orderTable = <div className="demo-table-scroll" tabIndex={0} aria-label={c("示例订单表", "Sample order table")}><table><thead><tr>{[c("订单", "Order"), c("内容", "Items"), c("示例市场", "Sample market"), c("时段", "Time slot"), c("金额", "Amount"), c("状态", "Status")].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.id}</strong></td><td>{en ? order.detailEn : order.detailZh}</td><td>{displayMarket(order.marketId)}</td><td>{order.slot}</td><td>{money(order.total)}</td><td><span className={`demo-status demo-status-${order.status}`}>{statusCopy[order.status][en ? 1 : 0]}</span></td></tr>)}</tbody></table></div>;
  return <div className="demo-workspace">
    <div className="demo-banner"><Eye size={20} /><div><strong>{c("DEMO · 只读展示", "DEMO · Read-only preview")}</strong><p>{c("以下商品、订单、市场及经营数字均为合成示例。可切换身份、筛选和查看内容；不创建账号、不提交订单，也不修改真实库存。", "Products, orders, markets and business figures below are synthetic samples. Switch roles, filter and explore; no accounts, real orders or inventory changes are created.")}</p></div></div>
    <div className="demo-roles" role="tablist" aria-label={c("选择演示身份", "Choose a demo role")}>
      {roles.map((item) => <button id={`demo-tab-${item.id}`} key={item.id} role="tab" aria-selected={role === item.id} aria-controls="demo-role-panel" onClick={() => selectRole(item.id)}><item.icon size={20} /><span>{en ? item.en : item.zh}</span><ArrowRight size={15} /></button>)}
    </div>
    <section id="demo-role-panel" role="tabpanel" aria-labelledby={`demo-tab-${role}`} className="demo-role-panel">
      <div className="demo-section-title"><div><span className="eyebrow">{role === "client" ? "FIND YOUR FRESH" : role === "retailer" ? "YOUR MARKET DAY" : "ONE VIEW. EVERY MARKET."}</span><h2>{role === "client" ? c("逛一逛，看看当季新鲜。", "A little look at what’s in season.") : role === "retailer" ? c("从备货到自提，一处看清。", "From inventory to pickup, in one view.") : c("让每一场市集，都井然有序。", "A clearer view of every market.")}</h2></div><span className="demo-readonly"><Eye size={14} />{c("展示模式", "Preview mode")}</span></div>
      {role === "client" ? <>
        <label className="demo-search"><Search size={17} /><input type="search" aria-label={c("搜索示例商品", "Search sample products")} placeholder={c("搜索示例商品…", "Search sample produce…")} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="demo-product-grid">{products.map((product) => <article key={product.id} className="demo-product"><div className="demo-product-art"><Produce kind={product.art} /><span>{c("示例", "Sample")}</span></div><div><h3>{en ? product.en : product.zh}</h3><p>{c("示例农场 · 当季蔬菜", "Sample farm · Seasonal produce")}</p><div className="demo-product-price"><strong>{money(product.price)}<small> / {en ? product.unitEn : product.unitZh}</small></strong><button onClick={() => setDetail(detail === product.id ? null : product.id)} aria-expanded={detail === product.id}>{c("查看", "View")}<ArrowRight size={14} /></button></div></div></article>)}</div>
        {!products.length && <p className="demo-empty">{c("没有匹配的示例商品。换个关键词试试。", "No sample products match. Try another search.")}</p>}
        {chosen && <aside className="demo-product-detail" aria-live="polite"><Leaf size={21} /><div><strong>{en ? chosen.en : chosen.zh}</strong><p>{c("示例库存", "Sample stock")} {chosen.stock} {en ? chosen.unitEn : chosen.unitZh} · {c("页面展示价格单位和库存信息；真实供应需向现场商户确认。", "This preview shows price units and stock. Confirm actual availability with vendors at the market.")}</p></div><button className="button" onClick={() => setDetail(null)}>{c("收起", "Close")}</button></aside>}
        <div className="demo-flow">{[["01", c("看市场与日期", "Find a market date")], ["02", c("浏览商品示例", "Explore sample products")], ["03", c("查看自提流程", "Preview pickup steps")]].map(([number, label]) => <div key={number}><span>{number}</span><strong>{label}</strong><CheckCircle2 size={19} /></div>)}</div>
        <section className="demo-panel"><div className="demo-panel-title"><h3>{c("自提订单长什么样？", "What does a pickup order look like?")}</h3><span>{c("展示记录，非取货凭证", "Sample records, not pickup confirmations")}</span></div>{orderTable}</section>
      </> : <>
        {role === "school" && <label className="demo-market-filter">{c("查看示例市场", "View sample market")}<select aria-label={c("筛选演示市场", "Filter demo market")} value={marketId} onChange={(event) => setMarketId(Number(event.target.value))}><option value={0}>{c("全部示例市场", "All sample markets")}</option>{demoMarkets.map((market) => <option value={market.id} key={market.id}>{en ? market.en : market.zh}</option>)}</select></label>}
        <div className="demo-metrics">{metrics.map((metric) => <article key={metric.label}><div><span>{metric.label}</span><metric.icon size={18} /></div><strong>{metric.value}</strong><small>{c("合成示例 · 非真实经营数据", "Synthetic sample · No real activity")}</small></article>)}</div>
        {role === "retailer" && <div className="demo-view-tabs" role="group" aria-label={c("商户展示内容", "Vendor preview section")}>{[["overview", c("经营概览", "Overview")], ["inventory", c("商品与库存", "Inventory")], ["orders", c("自提订单", "Pickup orders")]].map(([id, label]) => <button key={id} aria-pressed={vendorView === id} onClick={() => setVendorView(id)}>{label}</button>)}</div>}
        {(role === "school" || vendorView === "overview") && <div className="demo-summary-grid"><section className="demo-panel"><div className="demo-panel-title"><h3>{c("示例订单分布", "Sample order distribution")}</h3><BarChart3 size={18} /></div><div className="demo-bars">{["completed", "confirmed", "pending", "cancelled"].map((status) => { const count = orders.filter((order) => order.status === status).length; return <div key={status}><span>{statusCopy[status as keyof typeof statusCopy][en ? 1 : 0]}</span><div><i style={{ width: `${count / Math.max(1, orders.length) * 100}%` }} /></div><strong>{count}</strong></div>; })}</div><p className="demo-footnote">{c("按上方示例记录汇总，可切换市场观察变化。", "Summarized from the sample records. Change the market filter to compare.")}</p></section><section className="demo-panel"><div className="demo-panel-title"><h3>{c("备货与交付", "Preparation & pickup")}</h3><Package size={18} /></div><ol className="demo-pickup-steps"><li>{c("确认示例预购与备货清单", "Review preorders and preparation lists")}</li><li>{c("核对商品与实际交付数量", "Check products and delivered quantities")}</li><li>{c("现场核验取货及登记收款", "Verify pickup and record in-person payment")}</li></ol><p className="demo-footnote">{c("此处展示流程，操作按钮尚未开放。", "This is a process preview. Operational actions are unavailable.")}</p></section></div>}
        {role === "retailer" && vendorView === "inventory" ? <section className="demo-panel"><div className="demo-panel-title"><h3>{c("示例库存清单", "Sample inventory")}</h3><span>{c("只读", "Read-only")}</span></div><div className="demo-table-scroll" tabIndex={0}><table><thead><tr>{[c("商品", "Product"), c("单位价格", "Unit price"), c("示例库存", "Sample stock"), c("展示状态", "Preview status")].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{demoProducts.map((product) => <tr key={product.id}><td>{en ? product.en : product.zh}</td><td>{money(product.price)} / {en ? product.unitEn : product.unitZh}</td><td>{product.stock} {en ? product.unitEn : product.unitZh}</td><td><span className="demo-status">{c("示例上架", "Sample listing")}</span></td></tr>)}</tbody></table></div></section> : <section className="demo-panel"><div className="demo-panel-title"><h3>{c("示例预购清单", "Sample preorders")}</h3><span>{c("真实操作未开放", "Real operations unavailable")}</span></div>{orderTable}</section>}
        {role === "school" && <section className="demo-panel"><div className="demo-panel-title"><h3>{c("市场与商户网络", "Markets & vendors")}</h3><School size={18} /></div><div className="demo-market-grid">{demoMarkets.filter((market) => !marketId || market.id === marketId).map((market) => <article key={market.id}><Store size={23} /><h4>{en ? market.en : market.zh}</h4><p>{c("示例时段", "Sample hours")} {market.session} ET</p><p>{c("示例商户", "Sample vendors")} {market.vendors}</p><span className="demo-status">{c("展示中 · 非营业承诺", "Preview · Not an opening notice")}</span></article>)}</div></section>}
      </>}
    </section>
    <section className="demo-capabilities"><h3>{c("完整项目的功能结构", "Inside the full project")}</h3><p>{c("以下模块在完整应用中独立管理，本网站仅展示用途。真实服务暂未开放。", "These modules have separate responsibilities in the full application. This site previews their purpose; live services are not open.")}</p><div>{[
      [c("预购与履约", "Orders & fulfillment"), c("库存预留、订单状态、金额调整与现场自提", "Stock reservations, order states, adjustments and pickup")],
      [c("商户与运营", "Vendors & operations"), c("入驻审核、场次、摊位和出摊记录", "Applications, sessions, booths and attendance")],
      [c("统计与通知", "Reports & notifications"), c("跨市场汇总、数据口径和通知状态", "Market summaries, clear reporting scope and notification status")],
    ].map(([title, description]) => <article key={title}><span>{c("仅展示", "Preview only")}</span><h4>{title}</h4><p>{description}</p></article>)}</div></section>
  </div>;
}
