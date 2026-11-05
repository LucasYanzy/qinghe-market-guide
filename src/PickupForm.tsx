import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Banknote, Check, ChevronDown, CreditCard, LoaderCircle, ShieldCheck } from "lucide-react";
import { money } from "./api";
import { useLanguage, type Message } from "./i18n";
import "./pickup-form.css";

export function PickupForm({ orderId, total, snapLimit, busy, submit }: {
  orderId: string; total: number; snapLimit: number; busy: boolean; submit: (body: object) => Promise<unknown>;
}) {
  const { t } = useLanguage(), hintId = useId();
  const [code, setCode] = useState(""), [cash, setCash] = useState(""), [card, setCard] = useState("0"), [snap, setSnap] = useState("0");
  const [reference, setReference] = useState(""), [error, setError] = useState<Message>(""), [details, setDetails] = useState(false), [sending, setSending] = useState(false);
  const running = useRef(false), codeInput = useRef<HTMLInputElement>(null);
  const cents = (s: string) => /^\d+(?:\.\d{1,2})?$/.test(s) ? Math.round(Number(s) * 100) : -1;
  const amounts = [cash, card, snap].map(cents), received = amounts.reduce((n, value) => n + Math.max(value, 0), 0);
  const cashSelected = amounts[0] === total && amounts[1] === 0 && amounts[2] === 0;
  const cardSelected = amounts[1] === total && amounts[0] === 0 && amounts[2] === 0;
  const valid = /^\d{6}$/.test(code) && amounts.every(n => n >= 0) && received === total && amounts[2] <= snapLimit && (amounts[2] === 0 || !!reference.trim());
  const locked = busy || sending;
  const readyMessage = code.length !== 6 ? "请输入顾客提供的 6 位取货码。"
    : amounts.some(n => n < 0) || received !== total ? "选择收款方式，或展开填写拆分金额。"
    : amounts[2] > snapLimit ? "SNAP 登记不能超过合资格金额。"
    : amounts[2] > 0 && !reference.trim() ? "请填写 SNAP 小票参考号。" : "已填写完整，提交后核验取货码。";
  useEffect(() => { if (error && !locked) codeInput.current?.focus(); }, [error, locked]);
  const selectPayment = (method: "cash" | "card") => {
    setCash(method === "cash" ? (total / 100).toFixed(2) : "0");
    setCard(method === "card" ? (total / 100).toFixed(2) : "0"); setSnap("0"); setError("");
  };
  const handle = async (event: FormEvent) => {
    event.preventDefault(); if (running.current || locked || !valid) return;
    running.current = true; setSending(true); setError("");
    try { await submit({ pickupCode: code, cashCents: amounts[0], cardCents: amounts[1], snapCents: amounts[2], reference }); }
    catch (e) { setError(e as Error); }
    finally { running.current = false; setSending(false); }
  };
  return <form className="ops-pickup pickup-card" aria-label={t("取货核验与现场登记")} onSubmit={handle} aria-busy={locked}>
    <header className="pickup-card-head"><span className="pickup-card-icon"><ShieldCheck size={21} /></span><div><span className="pickup-eyebrow">{t("到场交接")}</span><h4>{t("核对顾客取货码")}</h4></div><span className="pickup-due"><small>{t("订单金额")}</small><strong>{money(total)}</strong></span></header>
    <fieldset disabled={locked}>
      <div className="pickup-code-block"><label htmlFor={hintId}>{t("6 位取货码")}</label><div className="pickup-code-entry"><input id={hintId} ref={codeInput} autoComplete="off" inputMode="numeric" pattern="[0-9]{6}" maxLength={12} required value={code} onChange={e => { setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6)); setError(""); }} placeholder="000 000" aria-describedby={`${hintId}-hint`} /><span aria-hidden="true">{code.length}/6</span></div><p id={`${hintId}-hint`}>{t("请向顾客索取取货码，输入后由系统核验。")}</p></div>
      <div className="pickup-payment"><div className="pickup-section-title"><span>{t("现场收款登记")}</span><span>{t("选择实际收款方式")}</span></div><div className="ops-payment-presets pickup-methods">
        <button type="button" aria-label={t("已收全额现金")} aria-pressed={cashSelected} onClick={() => selectPayment("cash")}><Banknote size={18} /><span>{t("现金")}</span>{cashSelected && <Check size={16} />}</button>
        <button type="button" aria-label={t("已收全额银行卡")} aria-pressed={cardSelected} onClick={() => selectPayment("card")}><CreditCard size={18} /><span>{t("银行卡")}</span>{cardSelected && <Check size={16} />}</button>
      </div>
      <details className="pickup-details" open={details} onToggle={e => setDetails(e.currentTarget.open)}><summary>{t("拆分金额与小票")}<span>{snapLimit > 0 ? "SNAP / EBT" : "USD"}<ChevronDown size={14} /></span></summary><div className="pickup-detail-content"><div className="ops-money-fields">{[["现金", cash, setCash], ["银行卡", card, setCard], ["SNAP / EBT", snap, setSnap]].map(([label, value, setter]) => <label key={String(label)}>{t(String(label))} USD<input type="number" min="0" max={label === "SNAP / EBT" ? snapLimit / 100 : total / 100} step="0.01" disabled={label === "SNAP / EBT" && !snapLimit} value={String(value)} onChange={e => { (setter as (value: string) => void)(e.target.value); setError(""); }} /></label>)}</div><label>{t("现场小票参考号（SNAP 必填）")}<input maxLength={100} value={reference} onChange={e => setReference(e.target.value)} /></label><div className="pickup-payment-total"><span>{t("现场收款登记")}</span><strong>{money(received)} / {money(total)}</strong></div></div></details></div>
      {error && <p role="alert" className="form-error pickup-error">{t(error)}</p>}
      <p className="pickup-ready" role="status">{t(readyMessage)}</p>
      <button className="button primary pickup-submit" disabled={locked || !valid} aria-label={t("核验并完成交付")}>{locked ? <LoaderCircle size={18} className="spin" /> : <ShieldCheck size={18} />}<span>{t(locked ? "正在核验并交付…" : "核验并完成交付")}</span>{!locked && <ArrowRight size={17} />}</button>
      <p className="pickup-footnote">{t("仅登记已完成的现场收款，不发起扣款。不要填写卡号、PIN 或福利余额。")}</p>
    </fieldset><input type="hidden" value={orderId} readOnly />
  </form>;
}
