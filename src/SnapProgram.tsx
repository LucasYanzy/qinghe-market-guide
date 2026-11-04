import { useEffect, useState, type FormEvent } from "react";
import { BadgeCheck, CheckCircle2, CircleHelp, CreditCard, ExternalLink, Leaf, LoaderCircle, Store } from "lucide-react";
import { api, money } from "./api";
import { useLanguage, type Message } from "./i18n";
import type { CheckoutQuote, Market, Order, Product, SchoolOverview, SnapStatus } from "./types";
import "./snap-program.css";

export const snapSources = {
  food: "https://www.fns.usda.gov/snap/eligible-food-items",
  locator: "https://www.fns.usda.gov/snap/retailer-locator",
  farmers: "https://www.fns.usda.gov/snap/farmer-producer",
  nj: "https://www.nj.gov/humanservices/njsnap/recipients/benefits",
};
export const snapLabels: Record<SnapStatus, string> = { unconfirmed: "尚未确认", accepted: "已确认接受", unavailable: "暂不接受" };
const foodLabels = { eligible: "SNAP 合资格食品", ineligible: "需其他方式付款", unknown: "SNAP 食品资格待核实" };

export function SnapFoodLabel({ eligibility }: { eligibility: Product["snap_eligibility"] }) {
  const { t } = useLanguage();
  return <span className={`snap-food-label snap-food-${eligibility}`}>{eligibility === "eligible" && <Leaf size={12} />}{t(foodLabels[eligibility])}</span>;
}

export function SnapPurchaseGuide({ compact = false }: { compact?: boolean }) {
  const { t } = useLanguage();
  return <section className={`snap-guide ${compact ? "snap-guide-compact" : "panel"}`}>
    <div className="school-section-heading"><div><span className="eyebrow">SNAP / EBT AT THE MARKET</span><h2>{t("一份新鲜，也可以多一种购买方式。")}</h2><p>{t("先确认接受地点，再选择合资格食品，到场完成付款。")}</p></div><span className="snap-icon"><CreditCard size={25} /></span></div>
    <div className="snap-rule-grid"><article><Leaf size={19} /><h3>{t("可以买什么")}</h3><p>{t("一般包括供家庭食用的水果蔬菜、肉蛋奶、面包谷物，以及用于种出食物的种子和植物。")}</p></article>
      <article><CircleHelp size={19} /><h3>{t("哪些要另外付款")}</h3><p>{t("酒和烟草、销售时为热食的食品、维生素和补充剂、花卉和手工艺品等非食品，不能用 SNAP 福利购买。")}</p></article>
      <article><Store size={19} /><h3>{t("到市场怎么用")}</h3><p>{t("以当地核实的流程为准：到服务台刷 EBT 换取 SNAP 专用代币，或到接受 EBT 的商户终端付款。现金福利、SNAP 福利与市场代金券分别处理。")}</p></article></div>
    {!compact && <div className="snap-steps"><span>01 <strong>{t("确认接受市场和商户")}</strong></span><span>02 <strong>{t("分别计算合资格与其他商品")}</strong></span><span>03 <strong>{t("携卡到场，由持卡人输入 PIN")}</strong></span></div>}
    <p className="snap-note">{t("网站只记录预购与付款意向，不收集 EBT 卡号、PIN 或福利余额，也不执行在线 EBT 扣款。食品资格和接受情况仍需现场确认。Market Bucks 与 SNAP/EBT 是不同项目。")}</p>
    <p className="snap-note">{t("SNAP 食品福利不能支付配送、服务或便利费用。若可用福利不足，或购物袋中有其他商品，差额须使用其他付款方式。")}</p>
    <div className="snap-source-links"><span>{t("规则核对：2026-10-29")}</span><a href={snapSources.food} target="_blank" rel="noreferrer">{t("USDA 可购买食品")}<ExternalLink size={12} /></a><a href={snapSources.locator} target="_blank" rel="noreferrer">{t("查找 SNAP 接受地点")}<ExternalLink size={12} /></a><a href={snapSources.nj} target="_blank" rel="noreferrer">{t("NJ SNAP 使用说明")}<ExternalLink size={12} /></a></div>
  </section>;
}

export default function SnapProgram({ market, vendors, onSaved }: { market: Market; vendors: SchoolOverview["vendors"]; onSaved: (message?: string) => void }) {
  const { t } = useLanguage();
  const [status, setStatus] = useState(market.snap_status), [model, setModel] = useState(market.snap_model);
  const [date, setDate] = useState(market.snap_verified_on), [note, setNote] = useState(market.snap_note);
  const [busy, setBusy] = useState(false), [error, setError] = useState<Message>("");
  const assigned = vendors.filter((v) => v.marketIds.includes(market.id));
  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try { await api(`/admin/markets/${market.id}/snap`, { method: "PUT", body: JSON.stringify({ snap_status: status, snap_model: model, snap_verified_on: date, snap_note: note }) }); onSaved("SNAP/EBT 设置已保存"); }
    catch (e) { setError(e as Error); } finally { setBusy(false); }
  };
  return <div className="snap-program"><div className="snap-program-intro"><span className="snap-icon"><CreditCard size={25} /></span><div><h3>{t("从接受资格，到现场购买。")}</h3><p>{t("市场与商户分别确认；确认记录不会替代 USDA 授权或支付机构接入。")}</p></div></div>
    <form className="form-stack" aria-label={t("市场 SNAP/EBT 设置")} onSubmit={save}><fieldset className="form-fields form-stack" disabled={busy}>
      <div className="market-form-pair"><label>{t("市场接受状态")}<select aria-label={t("市场接受状态")} value={status} onChange={(e) => setStatus(e.target.value as SnapStatus)}>{Object.entries(snapLabels).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select></label>
        <label>{t("现场办理方式")}<select aria-label={t("现场办理方式")} required={status === "accepted"} value={model} onChange={(e) => setModel(e.target.value as Market["snap_model"])}><option value="unconfirmed">{t("尚未确认")}</option><option value="market_tokens">{t("服务台 EBT 换取 SNAP 代币")}</option><option value="vendor_terminal">{t("商户终端现场刷 EBT")}</option></select></label></div>
      <label>{t("市场核实日期")}<input type="date" required={status === "accepted"} value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label>{t("核实依据与到场指引")}<textarea aria-label={t("核实依据与到场指引")} rows={3} required={status === "accepted"} maxLength={1000} value={t(note)} onChange={(e) => setNote(e.target.value)} placeholder={t("填写确认来源、办理位置、联系渠道及到场步骤；不要填写卡号或 PIN。")} /><small className="helper-text">{t("此指引会向顾客公开，请仅填写可公开的信息。")}</small></label>
      {status === "accepted" && <p className="school-method"><CircleHelp size={16} />{t("标记为接受前，请核实授权与实际收款流程，并填写核实日期和依据；还需逐一确认参与商户。")}</p>}
      {error && <p className="form-error" role="alert">{t(error)}</p>}
      <button className="button primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <CheckCircle2 size={16} />}{t("保存 SNAP/EBT 设置")}</button>
    </fieldset></form>
    <div className="snap-vendor-section"><h3>{t("参与商户的接受状态")}</h3><p>{t("只对已经入驻本市场的商户记录接受状态。未确认的商户不显示为可选 EBT 付款。")}</p>
      {assigned.map((vendor) => <SnapVendorEditor key={`${vendor.id}:${vendor.snapMarkets.find((m) => m.market_id === market.id)?.snap_status}`} marketId={market.id} vendor={vendor} onSaved={onSaved} />)}
      {!assigned.length && <p className="school-empty">{t("请先在「入驻商户」中分配商户。")}</p>}
    </div>
    <SnapPurchaseGuide compact />
  </div>;
}
function SnapVendorEditor({ marketId, vendor, onSaved }: { marketId: number; vendor: SchoolOverview["vendors"][number]; onSaved: (message?: string) => void }) {
  const { t } = useLanguage();
  const current = vendor.snapMarkets.find((m) => m.market_id === marketId);
  const [status, setStatus] = useState<SnapStatus>(current?.snap_status ?? "unconfirmed");
  const [date, setDate] = useState(current?.snap_verified_on ?? ""), [note, setNote] = useState(current?.snap_note ?? "");
  const [busy, setBusy] = useState(false), [error, setError] = useState<Message>("");
  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try { await api(`/admin/markets/${marketId}/vendors/${vendor.id}/snap`, { method: "PUT", body: JSON.stringify({ snap_status: status, snap_verified_on: date, snap_note: note }) }); onSaved("商户 SNAP/EBT 状态已保存"); }
    catch (e) { setError(e as Error); } finally { setBusy(false); }
  };
  return <details className="snap-vendor-policy"><summary><span><Store size={17} />{t(vendor.name)}</span><span className="school-badge">{t(snapLabels[current?.snap_status ?? "unconfirmed"])}</span></summary>
    <form className="form-stack" aria-label={`${t("商户 SNAP 设置")} ${t(vendor.name)}`} onSubmit={save}><fieldset className="form-fields form-stack" disabled={busy}>
      <div className="market-form-pair"><label>{t("商户接受状态")}<select aria-label={t("商户接受状态")} value={status} onChange={(e) => setStatus(e.target.value as SnapStatus)}>{Object.entries(snapLabels).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select></label>
        <label>{t("商户核实日期")}<input type="date" required={status === "accepted"} value={date} onChange={(e) => setDate(e.target.value)} /></label></div>
      <label>{t("商户核实依据")}<input maxLength={1000} required={status === "accepted"} value={t(note)} onChange={(e) => setNote(e.target.value)} /></label>
      {error && <p className="form-error" role="alert">{t(error)}</p>}<button className="button primary" disabled={busy}>{t("保存商户 SNAP 状态")}</button>
    </fieldset></form>
  </details>;
}

export function SnapCheckout({ itemsKey, method, onChange, onReady }: {
  itemsKey: string; method: "pay_at_pickup" | "snap_ebt";
  onChange: (method: "pay_at_pickup" | "snap_ebt") => void; onReady: (ready: boolean) => void;
}) {
  const { t } = useLanguage();
  const [quote, setQuote] = useState<CheckoutQuote>(), [error, setError] = useState<Message>("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setQuote(undefined); setError(""); onReady(false);
    api<CheckoutQuote>("/checkout/quote", { method: "POST", body: JSON.stringify({ items: JSON.parse(itemsKey) }) })
      .then((q) => { if (active) { setQuote(q); onReady(q.snapAvailable && q.eligibleCents > 0); } })
      .catch((e: Error) => { if (active) setError(e); });
    return () => { active = false; };
  }, [itemsKey, retry, onReady]);
  const available = !!quote?.snapAvailable && quote.eligibleCents > 0;
  return <section className="snap-checkout" aria-label={t("现场付款方式与 SNAP 拆分")}>
    <label>{t("现场付款方式")}<select aria-label={t("现场付款方式")} value={method} onChange={(e) => onChange(e.target.value as "pay_at_pickup" | "snap_ebt")}><option value="pay_at_pickup">{t("到场选择其他付款方式")}</option><option value="snap_ebt" disabled={!available}>{t("现场 SNAP/EBT（需接受条件满足）")}</option></select></label>
    {quote ? <><div className="snap-quote-status"><CreditCard size={16} /><strong>{t(available ? "本次可预约现场 SNAP/EBT 付款" : quote.snapAvailable ? "购物袋中暂无已确认的 SNAP 合资格食品" : "本次 SNAP/EBT 接受条件尚未确认")}</strong></div>
      {method === "snap_ebt" && available && <><dl className="snap-split"><div><dt>{t("SNAP 合资格食品预估")}</dt><dd>{money(quote.eligibleCents)}</dd></div><div><dt>{t("其他方式付款预估")}</dt><dd>{money(quote.otherCents)}</dd></div></dl>
        {!!quote.unknownCents && <p>{t("资格未确认的商品按其他付款方式预留。")}</p>}
        <details className="snap-item-breakdown"><summary>{t("查看逐项资格与金额")}</summary><ul>{quote.items.map((item) => <li key={item.productId}><span>{t(item.name)} × {item.quantity}<SnapFoodLabel eligibility={item.snapEligibility} /></span><strong>{money(item.lineCents)}</strong></li>)}</ul></details>
        <p>{t(quote.snapModel === "market_tokens" ? "到服务台办理 EBT，领取适用于参与商户的 SNAP 代币，再到摊位自提。" : "到参与商户的现场 EBT 终端付款并自提。")}</p><p>{t(quote.instructions)}</p>
        <small>{t("市场核实")} {quote.marketVerifiedOn} · {t("商户核实")} {quote.vendorVerifiedOn}</small></>}
      {!available && <p>{t("食品合资格、市场接受和商户参与需同时满足。请先联系市场确认，也可到场选择其他付款方式。")}</p>}
    </> : error ? <p className="snap-quote-error">{t(error)} {t("暂时无法预估 SNAP 拆分，提交时仍会核对商品与库存。")}{method === "snap_ebt" && t("请重试后再提交 SNAP 付款意向。") } <button type="button" className="text-button" onClick={() => setRetry((v) => v + 1)}>{t("重新核对")}</button></p>
      : <p>{t("正在核对现场付款条件…")}</p>}
    <p className="snap-checkout-note">{t("此处是付款意向与金额预估，不代表 EBT 已扣款。可用余额不足时，余款须用其他方式支付；不要在备注中填写卡号或 PIN。")}</p>
    <a href={snapSources.food} target="_blank" rel="noreferrer">{t("查看 SNAP 可购买食品规则")}<ExternalLink size={11} /></a>
  </section>;
}

export function SnapOrderPlan({ order }: { order: Order }) {
  const { t } = useLanguage();
  if (order.payment_method !== "snap_ebt") return null;
  return <div className="snap-order-plan"><BadgeCheck size={17} /><div><strong>{t("现场 SNAP/EBT 付款意向")}</strong><p>{t("合资格食品预估")} {money(order.snap_eligible_cents)} · {t("其他方式预估")} {money(order.other_payment_cents)}</p>
    {order.snap_plan?.items && <details className="snap-item-breakdown"><summary>{t("查看购买时的付款计划")}</summary><ul>{order.snap_plan.items.map((item) => <li key={item.productId}><span>{t(item.name)} × {item.quantity}<SnapFoodLabel eligibility={item.snapEligibility} /></span><strong>{money(item.lineCents)}</strong></li>)}</ul><p>{t(order.snap_plan.marketName)} · {t(order.snap_plan.snapModel === "market_tokens" ? "服务台 EBT 换取 SNAP 代币" : "商户终端现场刷 EBT")}</p><p>{t(order.snap_plan.instructions)}</p></details>}
    <small>{t("预购记录不代表 EBT 已扣款，最终以现场办理结果为准。")}</small></div></div>;
}

export function SnapImpact({ data, manage }: { data: SchoolOverview; manage: (id: number) => void }) {
  const { t } = useLanguage();
  const markets = data.markets.filter((m) => !data.marketId || data.marketId === m.id);
  return <section className="panel snap-impact"><div className="school-section-heading"><div><span className="eyebrow">FOOD ACCESS · SNAP / EBT</span><h2>{t("让购买方式，也成为可管理的服务。")}</h2><p>{t("查看接受准备情况与预购意向，逐市场完善现场服务。")}</p></div><span className="snap-icon"><CreditCard size={25} /></span></div>
    <div className="snap-access-metrics"><div><strong>{markets.filter((m) => m.active && m.snap_status === "accepted").length}</strong><span>{t("已核实接受的启用市场")}</span></div><div><strong>{data.vendors.filter((v) => v.snapMarkets.some((p) => p.snap_status === "accepted" && markets.some((m) => m.id === p.market_id && m.active && m.snap_status === "accepted"))).length}</strong><span>{t("已核实参与商户（去重）")}</span></div><div><strong>{data.summary.snapIntentOrders}</strong><span>{t("SNAP 现场付款意向订单")}</span></div></div>
    <div className="snap-access-markets">{markets.map((m) => <button key={m.id} onClick={() => manage(m.id)}><span>{t(m.name)}</span><span className="school-badge">{t(snapLabels[m.snap_status])}</span></button>)}</div>
    <p className="school-footnote">{t("接受状态为当前配置；意向订单按所选周期统计并排除取消。意向、完成自提均不代表实际 SNAP 核销金额。")}</p>
  </section>;
}
