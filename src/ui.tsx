import { useEffect, useRef, type ReactNode } from "react";
import { ShoppingBag, X } from "lucide-react";
import { useLanguage } from "./i18n";

export function Modal({
  title,
  children,
  onClose,
  wide = false,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  busy?: boolean;
}) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.body.style.overflow = original;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
      if (e.key === "Tab") {
        const focusable = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
          ) ?? [],
        ).filter(
          (element) =>
            element.tabIndex >= 0 && element.getClientRects().length > 0,
        );
        if (!focusable.length) {
          e.preventDefault();
          ref.current?.focus();
          return;
        }
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
    };
  }, [onClose, busy]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={t(title)}
        aria-busy={busy}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-title">
          <h2>{t(title)}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t("关闭弹窗")}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Empty({
  icon = <ShoppingBag />,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{t(title)}</h3>
      <p>{t(text)}</p>
      {action}
    </div>
  );
}
