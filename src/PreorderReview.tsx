import { useLayoutEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, ShoppingBag, Wallet } from "lucide-react";
import { money } from "./api";
import { useLanguage } from "./i18n";
import { quantityUnit } from "./translations/translate";
import type { PaymentMethod, Product } from "./types";
import "./preorder.css";

export function PreorderReview({ items, total, date, slot, paymentMethod, note, onBack, onConfirm }: {
  items: { product: Product; quantity: number }[];
  total: number;
  date: string;
  slot: string;
  paymentMethod: PaymentMethod;
  note: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const { t, language } = useLanguage();
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.closest(".modal")?.scrollTo(0, 0);
  }, []);
  return <form className="preorder-review" onSubmit={(event) => { event.preventDefault(); onConfirm(); }}>
    <div className="preorder-reminder">
      <span className="preorder-icon" aria-hidden="true"><ShoppingBag size={23} /></span>
      <h3 ref={heading} tabIndex={-1}>{t("提交前确认预购")}</h3>
      <p>{t("这是一笔预购。提交后会预留库存，请等待商户确认，再按约定时段到场自提并付款。")}</p>
    </div>
    <ul className="preorder-items" aria-label={t("本次预购商品")}>
      {items.map(({ product, quantity }) => <li key={product.id}>
        <span>{t(product.name)}<small> × {quantity} {quantityUnit(language, product.unit, quantity)}</small></span>
        <strong>{t(money(Math.round(product.price_cents * quantity)))}</strong>
      </li>)}
    </ul>
    <dl className="preorder-details">
      <div><dt><CalendarDays size={15} aria-hidden="true" />{t("自提时间")}</dt><dd>{date} · {slot} ET</dd></div>
      <div><dt><Wallet size={15} aria-hidden="true" />{t("付款偏好")}</dt><dd>{t(paymentMethod === "snap_ebt" ? "SNAP/EBT（到场确认）" : "常规到场付款")}</dd></div>
    </dl>
    {paymentMethod === "snap_ebt" && <p className="preorder-payment-note">{t("SNAP/EBT 是否接受及商品资格，请提前与商户确认。")}</p>}
    {note && <p className="preorder-note">{t("备注：")}{note}</p>}
    <div className="preorder-total"><span>{t("预计合计 ")}<small>USD</small></span><strong>{t(money(total))}</strong></div>
    <p className="preorder-estimate">{t("此处不会收取线上款项；称重商品的最终数量与金额以到场确认为准。")}</p>
    <div className="preorder-actions">
      <button type="button" className="button secondary" onClick={onBack}><ArrowLeft size={16} />{t("返回修改")}</button>
      <button type="submit" className="button primary">{t("确认并提交预购")}<ArrowRight size={16} /></button>
    </div>
  </form>;
}
