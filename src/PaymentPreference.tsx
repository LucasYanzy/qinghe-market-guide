import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { Check, CircleHelp, CreditCard, Plus, Wallet } from "lucide-react";
import { useLanguage } from "./i18n";
import type { PaymentMethod } from "./types";
import "./payment.css";

const holdDuration = 700;

export function PaymentPreference({ value, onChange, disabled, verified = false }: {
  value: PaymentMethod;
  onChange: (value: PaymentMethod) => void;
  disabled: boolean;
  verified?: boolean;
}) {
  const { t } = useLanguage();
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const options = useRef<HTMLFieldSetElement>(null);
  const active = useRef<{ timer: number; dispose: () => void } | null>(null);
  const latest = useRef({ value, onChange });
  const suppressClick = useRef(false);
  const [holding, setHolding] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const snap = value === "snap_ebt";
  const stop = useCallback(() => {
    const press = active.current;
    if (!press) return;
    active.current = null;
    window.clearTimeout(press.timer);
    press.dispose();
    setHolding(false);
  }, []);
  useLayoutEffect(() => {
    if (latest.current.value !== value || disabled) stop();
    latest.current = { value, onChange };
  }, [value, onChange, disabled, stop]);
  useEffect(() => () => stop(), [stop]);
  useLayoutEffect(() => {
    if (expanded) options.current?.querySelector<HTMLInputElement>("input:checked")?.focus({ preventScroll: true });
  }, [expanded]);

  const start = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || !event.isPrimary || event.button !== 0) return;
    stop();
    suppressClick.current = false;
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    const bounds = target.getBoundingClientRect();
    const x = window.scrollX, y = window.scrollY;
    const containers: { element: HTMLElement; x: number; y: number }[] = [];
    for (let element = target.parentElement; element; element = element.parentElement)
      containers.push({ element, x: element.scrollLeft, y: element.scrollTop });
    const cancel = () => { suppressClick.current = true; stop(); };
    const release = (e: globalThis.PointerEvent) => { if (e.pointerId === pointerId) stop(); };
    const move = (e: globalThis.PointerEvent) => {
      if (e.pointerId === pointerId && (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom)) cancel();
    };
    const visibility = () => { if (document.hidden) cancel(); };
    const keydown = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Tab") cancel(); };
    setHolding(true);
    document.addEventListener("pointerup", release, true);
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointercancel", cancel, true);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("keydown", keydown);
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel, { passive: true });
    window.addEventListener("scroll", cancel, { passive: true, capture: true });
    window.addEventListener("wheel", cancel, { passive: true });
    active.current = {
      timer: window.setTimeout(() => {
        if (!target.isConnected || target.matches(":disabled") || target.closest("[inert]") || document.hidden ||
          window.scrollX !== x || window.scrollY !== y ||
          containers.some(({ element, x, y }) => element.scrollLeft !== x || element.scrollTop !== y)) return cancel();
        suppressClick.current = true;
        stop();
        setExpanded(false);
        latest.current.onChange(latest.current.value === "snap_ebt" ? "pay_at_pickup" : "snap_ebt");
      }, holdDuration),
      dispose: () => {
        document.removeEventListener("pointerup", release, true);
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointercancel", cancel, true);
        document.removeEventListener("visibilitychange", visibility);
        document.removeEventListener("keydown", keydown);
        window.removeEventListener("blur", cancel);
        window.removeEventListener("resize", cancel);
        window.removeEventListener("scroll", cancel, true);
        window.removeEventListener("wheel", cancel);
      },
    };
  };

  return <section className={`payment-preference ${snap ? `is-snap ${verified ? 'is-verified' : 'needs-verification'}` : ""}`} aria-labelledby={`${id}-title`}>
    <div className="payment-heading">
      <Wallet size={16} aria-hidden="true" />
      <h3 id={`${id}-title`}>{t("到场付款偏好")}</h3>
      <span>{t("到场确认")}</span>
    </div>
    <div className="payment-summary">
      <div className="payment-current" aria-live="polite" aria-atomic="true">
        <span className="payment-choice-icon" key={value} aria-hidden="true">{snap ? verified ? <Check size={19} /> : <CircleHelp size={19} /> : <CreditCard size={19} />}</span>
        <div><strong>{t(snap ? "SNAP/EBT" : "常规到场付款")}</strong>
          <p>{t(snap ? "已选择 SNAP/EBT，请到场确认是否可用。" : "使用商户现场接受的付款方式。")}</p>
        </div>
      </div>
      <button ref={button} type="button" className={`payment-hold ${holding ? "is-holding" : ""}`}
        disabled={disabled} aria-label={t("切换付款偏好")}
        aria-describedby={`${id}-help`} aria-expanded={expanded} aria-controls={`${id}-options`}
        title={t("长按切换，轻点查看付款选项")}
        onPointerDown={start}
        onPointerLeave={() => { if (active.current) { suppressClick.current = true; stop(); } }}
        onContextMenu={(event) => { if (active.current || suppressClick.current) event.preventDefault(); }}
        onClick={(event) => {
          if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return; }
          setExpanded((current) => !current);
        }}>
        <svg className="payment-hold-ring" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" /></svg>
        <Plus size={21} aria-hidden="true" />
      </button>
    </div>
    <p id={`${id}-help`} className="payment-instruction">{t(holding
      ? "继续按住片刻完成切换，提前松开可取消。"
      : snap ? "长按 ＋ 切回常规付款，轻点查看选项。" : "长按 ＋ 切换至 SNAP/EBT，轻点查看选项。")}</p>
    <fieldset ref={options} id={`${id}-options`} className="payment-options" hidden={!expanded} disabled={disabled}>
      <legend>{t("也可以直接选择")}</legend>
      {(["pay_at_pickup", "snap_ebt"] as const).map((method) => <label key={method}>
        <input type="radio" name={`${id}-method`} value={method} checked={value === method}
          onChange={() => { onChange(method); setExpanded(false); button.current?.focus({ preventScroll: true }); }} />
        <span>{t(method === "snap_ebt" ? "SNAP/EBT" : "常规到场付款")}</span>
        {value === method && <Check size={15} aria-hidden="true" />}
      </label>)}
    </fieldset>
    <p className="payment-explanation">{t("SNAP/EBT 是食品补助付款方式。是否接受及商品资格需向商户确认；此处只记录偏好，不收取线上款项、EBT 卡号或 PIN。")}</p>
  </section>;
}
