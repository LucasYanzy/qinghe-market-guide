import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, LayoutGrid, Leaf, List, Minus, Plus } from "lucide-react";
import { useLanguage } from "./i18n";
import { money } from "./api";
import { Produce } from "./Produce";
import { QuantityButton } from "./QuantityButton";
import { quantityUnit } from "./translations/translate";
import type { Product } from "./types";

type CatalogView = "grid" | "list";

export function useCatalogView() {
  const [view, setView] = useState<CatalogView>(() => {
    try { return localStorage.getItem("qinghe-catalog-view") === "list" ? "list" : "grid"; }
    catch { return "grid"; }
  });
  useEffect(() => {
    try { localStorage.setItem("qinghe-catalog-view", view); }
    catch { /* Browsing works when preference storage is unavailable. */ }
  }, [view]);
  return [view, setView] as const;
}

export function CatalogViewSwitcher({ view, onChange }: { view: CatalogView; onChange: (view: CatalogView) => void }) {
  const { t } = useLanguage();
  return <div className="catalog-view-switch" role="group" aria-label={t("商品显示方式")}>
    <button aria-label={t("卡片视图")} title={t("卡片视图")} aria-pressed={view === "grid"} onClick={() => onChange("grid")}><LayoutGrid size={16} /></button>
    <button aria-label={t("列表视图")} title={t("列表视图")} aria-pressed={view === "list"} onClick={() => onChange("list")}><List size={17} /></button>
  </div>;
}

export function ProductCard({ product: p, quantity, onAdd, onRemove, onView }: {
  product: Product;
  quantity: number;
  onAdd: (source: HTMLButtonElement, repeated: boolean) => void;
  onRemove: () => void;
  onView: () => void;
}) {
  const { t, language } = useLanguage();
  const addRef = useRef<HTMLButtonElement>(null);
  const limit = Math.min(p.stock, 100);
  return <article className={`product-card catalog-card ${quantity ? "product-selected" : ""} ${p.stock === 0 ? "product-unavailable" : ""}`} data-product-id={p.id}>
    <button className={`product-image art-bg-${p.art}`} onClick={onView} aria-label={t("查看{0}", { 0: t(p.name) })}>
      <Produce kind={p.art} />
      {p.organic === 1 && <span className="organic-badge"><Leaf size={11} />{t("有机种植")}</span>}
      {quantity > 0 && <span className="catalog-in-bag" aria-hidden="true"><Check size={12} />{t("已选 {count}", { count: quantity })}</span>}
      {p.stock === 0 && <span className="sold-out">{t("今日售罄")}</span>}
      <span className="view-product">{t("了解这份新鲜")}<ArrowUpRight size={14} /></span>
    </button>
    <div className="product-copy">
      <div className="catalog-card-meta"><span className="catalog-category">{t(p.category)}</span><span className="farm-label"><span className="tiny-dot" />{t(p.farm)}</span></div>
      <button className="product-name" onClick={onView}>{t(p.name)}</button>
      <p className="product-description">{t(p.description)}</p>
      <div className="product-bottom">
        <div className="catalog-price-block">
          <span className="catalog-pricing-unit">{t("按{unit}计价", { unit: quantityUnit(language, p.unit, 1) })}</span>
          <div className="catalog-price"><strong>{money(p.price_cents)}</strong><small> / {t(p.unit)}</small></div>
        </div>
        <div className="catalog-controls-slot">
          <div className={quantity ? "product-quantity is-selected" : "product-add"}>
            {quantity > 0 && <>
              <QuantityButton className="add-button remove-button" onStep={() => { if (quantity === 1) addRef.current?.focus(); onRemove(); }} title={t("按住可连续减少")} aria-label={t("减少{0}", { 0: t(p.name) })}><Minus size={16} /></QuantityButton>
              <span className="product-quantity-value" aria-live="polite" aria-atomic="true"><span className="quantity-pop" key={quantity}>{quantity}</span></span>
            </>}
            <QuantityButton ref={addRef} className={`add-button ${quantity ? "has-quantity" : ""}`} disabled={!p.stock || quantity >= limit}
              title={t(!p.stock ? "今日已售罄" : quantity >= limit ? "已达到可购数量" : "按住可连续增加")}
              aria-label={t("将{0}加入购物袋", { 0: t(p.name) })} onStep={onAdd}><Plus size={19} /></QuantityButton>
          </div>
        </div>
          <span className={`stock-label ${p.stock < 10 ? "low" : ""}`}>{p.stock > 0 ? t("剩余 {count} {unit}", { count: p.stock, unit: quantityUnit(language, p.unit, p.stock) }) : t("等待下一次采收")}</span>
      </div>
      {!!quantity && p.stock > 0 && quantity >= limit && <p className="quantity-limit" role="status">{t("已达上限 {count} {unit}", { count: limit, unit: quantityUnit(language, p.unit, limit) })}</p>}
    </div>
  </article>;
}
