import { useRef, useEffect, useState } from "react";
import { CheckSquare, Eye, EyeOff, LoaderCircle, X } from "lucide-react";
import { api } from "./api";
import { useLanguage } from "./i18n";
import { Modal } from "./ui";
import type { Product } from "./types";

export function InventoryBulkActions({
  products,
  selected,
  onSelection,
  busy,
  onBusy,
  onSaved,
  disabled,
}: {
  products: Product[];
  selected: number[];
  onSelection: (ids: number[]) => void;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onSaved: (products: Product[]) => void;
  disabled: boolean;
}) {
  const { t } = useLanguage();
  const checkbox = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<boolean>();
  const [error, setError] = useState("");
  const chosen = products.filter((p) => selected.includes(p.id));
  const all = !!products.length && chosen.length === products.length;
  useEffect(() => {
    if (checkbox.current)
      checkbox.current.indeterminate = chosen.length > 0 && !all;
  }, [chosen.length, all]);
  const close = () => {
    setConfirm(undefined);
    setError("");
  };
  const save = async () => {
    if (busy || disabled || confirm === undefined || !chosen.length) return;
    onBusy(true);
    setError("");
    try {
      const saved = await api<Product[]>("/retailer/products/visibility", {
        method: "PATCH",
        body: JSON.stringify({ ids: chosen.map((p) => p.id), active: confirm }),
      });
      onSaved(saved);
      onSelection([]);
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      onBusy(false);
    }
  };
  return (
    <>
      <div
        className={`vendor-selection-bar ${chosen.length ? "has-selection" : ""}`}
      >
        <label>
          <input
            ref={checkbox}
            type="checkbox"
            checked={all}
            disabled={disabled || busy || !products.length}
            onChange={(e) =>
              onSelection(e.target.checked ? products.map((p) => p.id) : [])
            }
          />
          {t("选择本页商品")}
        </label>
        <span role="status">
          {t("已选 {count} 款", { count: chosen.length })}
        </span>
        {chosen.length > 0 && (
          <div className="vendor-bulk-buttons">
            <button
              className="button secondary"
              disabled={disabled || busy}
              onClick={() => setConfirm(true)}
            >
              <Eye size={15} />
              {t("批量上架")}
            </button>
            <button
              className="button secondary"
              disabled={disabled || busy}
              onClick={() => setConfirm(false)}
            >
              <EyeOff size={15} />
              {t("批量下架")}
            </button>
            <button
              className="icon-button"
              aria-label={t("取消选择")}
              disabled={busy}
              onClick={() => onSelection([])}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {!chosen.length && (
          <small>{t("选择商品后，可统一调整展示状态。")}</small>
        )}
      </div>
      {confirm !== undefined && (
        <Modal
          title={confirm ? "批量上架这些商品？" : "批量下架这些商品？"}
          onClose={close}
          busy={busy}
        >
          <p className="modal-intro">
            <CheckSquare size={18} />
            {t("已选 {count} 款", { count: chosen.length })}
          </p>
          <ul className="vendor-bulk-preview">
            {chosen.map((p) => (
              <li key={p.id}>
                <strong>{t(p.name)}</strong>
                <span>{p.available_date}</span>
              </li>
            ))}
          </ul>
          <p className="vendor-confirm-copy">
            {t(
              confirm
                ? "上架后，仅售卖日期为今天的商品会展示给顾客。库存、价格和售卖日期保持当前值。"
                : "下架后，顾客无法再预购这些商品。已有订单继续履约，库存和价格保持当前值。",
            )}
          </p>
          {error && (
            <p className="form-error" role="alert">
              {t(error)}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={close}
            >
              {t("返回选择")}
            </button>
            <button
              className={`button ${confirm ? "primary" : "danger"}`}
              disabled={busy || disabled}
              onClick={() => void save()}
            >
              {busy && <LoaderCircle size={15} className="spin" />}
              {t(
                busy ? "正在更新…" : confirm ? "确认批量上架" : "确认批量下架",
              )}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
