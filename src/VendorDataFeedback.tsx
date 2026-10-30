import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { useLanguage, type Message } from "./i18n";

export function VendorDataFeedback({
  loading,
  error,
  updatedAt,
  refresh,
}: {
  loading: boolean;
  error: Message;
  updatedAt?: number;
  refresh: () => void;
}) {
  const { t, language } = useLanguage();
  const time = updatedAt
    ? new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "America/New_York",
        hour12: false,
      }).format(updatedAt)
    : "";
  return (
    <div
      className={`vendor-data-feedback ${error ? "is-stale" : ""}`}
      role={error ? "alert" : "status"}
    >
      {error ? (
        <AlertCircle size={16} />
      ) : loading ? (
        <LoaderCircle className="spin" size={14} />
      ) : (
        <CheckCircle2 size={14} />
      )}
      <div>
        <span>
          {t(
            error ||
              (loading ? "正在更新，当前保留已读取的内容。" : "已读取最新数据"),
          )}
        </span>
        {error && <p>{t("显示上次读取的数据，请刷新后再修改商品或订单。")}</p>}
      </div>
      {time && (
        <time dateTime={new Date(updatedAt!).toISOString()}>
          {t("最近读取 {time} ET", { time })}
        </time>
      )}
      {error && (
        <button className="text-button" onClick={refresh} disabled={loading}>
          <RefreshCw size={13} />
          {t("重新加载")}
        </button>
      )}
    </div>
  );
}

export function VendorLoading({
  kind,
}: {
  kind: "dashboard" | "inventory" | "orders";
}) {
  const { t } = useLanguage();
  const label =
    kind === "dashboard"
      ? "正在汇总经营数据…"
      : kind === "inventory"
        ? "正在读取库存…"
        : "正在读取预购订单…";
  return (
    <div
      className={`vendor-skeleton vendor-skeleton-${kind}`}
      role="status"
      aria-label={t(label)}
    >
      <p>
        <LoaderCircle size={17} className="spin" />
        {t(label)}
      </p>
      <div aria-hidden="true">
        <div className="vendor-skeleton-line" />
        {kind === "dashboard" && (
          <div className="vendor-skeleton-metrics">
            {[0, 1, 2, 3].map((key) => (
              <div key={key} />
            ))}
          </div>
        )}
        <div className="vendor-skeleton-content">
          {[0, 1, 2, 3].map((key) => (
            <div key={key}>
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
