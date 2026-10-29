import { useCallback, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Leaf,
  LoaderCircle,
  Package,
  RefreshCw,
  Search,
  ShoppingBag,
  Sprout,
  Truck,
  Wallet,
  X,
} from "lucide-react";
import { api, money } from "./api";
import { useLanguage } from "./i18n";
import { BasketArt, Produce } from "./Produce";
import { Empty, Modal } from "./ui";
import { openVendorPage, orderLabels, useVendorData } from "./vendorSupport";
import type { Page } from "./navigation";
import type { Dashboard, Order, OrderStatus, User } from "./types";

export function VendorRefresh({
  refresh,
  loading,
}: {
  refresh: () => void;
  loading: boolean;
}) {
  const { t } = useLanguage();
  return (
    <button
      className="button secondary vendor-refresh"
      onClick={refresh}
      disabled={loading}
    >
      <RefreshCw size={15} className={loading ? "spin" : ""} />
      {t("刷新数据")}
    </button>
  );
}
export function VendorError({
  error,
  refresh,
}: {
  error: string;
  refresh: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="error-panel" role="alert">
      <span>{t(error)}</span>
      <button className="text-button" onClick={refresh}>
        {t("重新加载")}
      </button>
    </div>
  );
}
function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="vendor-metric">
      <span className="vendor-metric-icon">{icon}</span>
      <span>{t(label)}</span>
      <strong>{value}</strong>
      <small>{t(note)}</small>
    </div>
  );
}
export function RetailDashboard({
  revision,
  navigate,
  refresh,
  user,
  today,
}: {
  revision: number;
  navigate: (page: Page) => void;
  refresh: () => void;
  user: User;
  today: string;
}) {
  const { t, language } = useLanguage();
  const { data, error, loading } = useVendorData<Dashboard>(
    "/retailer/dashboard",
    revision,
  );
  const date = new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${today}T12:00:00Z`));
  if (error) return <VendorError error={error} refresh={refresh} />;
  if (!data)
    return (
      <div className="loading-panel">
        <LoaderCircle className="spin" />
        {t("正在汇总经营数据…")}
      </div>
    );
  return (
    <div className="vendor-dashboard">
      <section className="vendor-hero">
        <div className="vendor-hero-copy">
          <span className="vendor-kicker">
            <span className="tiny-dot" />
            {t("你的农场，你的每一天")}
          </span>
          <h2>
            {t("欢迎回来，")}
            <br />
            {user.name}
            <span>。</span>
          </h2>
          <p>{t("从整理今日上架开始，把每一份新鲜送到邻里手中。")}</p>
          <div className="vendor-hero-actions">
            <button
              className="button primary"
              onClick={() =>
                openVendorPage(navigate, "inventory", { status: "today" })
              }
            >
              {t("管理今日商品")}
              <ArrowRight size={16} />
            </button>
            <button
              className="text-button"
              onClick={() =>
                openVendorPage(navigate, "inventory", { new: "1" })
              }
            >
              {t("上架新商品")}
              <ArrowUpRight size={16} />
            </button>
          </div>
        </div>
        <BasketArt />
        <span className="vendor-hero-caption">
          GROWN WITH CARE. SHARED WITH COMMUNITY.
        </span>
      </section>
      <div className="vendor-section-title">
        <div>
          <span className="eyebrow">THE DAILY PICTURE</span>
          <h2>{t("今日经营概览")}</h2>
          <p>{date} · ET</p>
        </div>
        <VendorRefresh refresh={refresh} loading={loading} />
      </div>
      <div className="vendor-metrics">
        <Metric
          label="今日预购订单"
          value={String(data.todayOrders)}
          note="不含已取消订单"
          icon={<ShoppingBag size={20} />}
        />
        <Metric
          label="今日已完成金额"
          value={money(data.revenueCents)}
          note="已自提并确认收款"
          icon={<Wallet size={20} />}
        />
        <Metric
          label="今日待履约金额"
          value={money(data.reservedCents)}
          note="待确认与待自提订单合计"
          icon={<Truck size={20} />}
        />
        <Metric
          label="今日展示商品"
          value={String(data.activeProducts)}
          note={t("其中 {count} 款已售罄", { count: data.outOfStock })}
          icon={<Sprout size={20} />}
        />
      </div>
      <div className="vendor-section-title">
        <div>
          <span className="eyebrow">A LITTLE ATTENTION</span>
          <h2>{t("接下来，处理这几件事")}</h2>
        </div>
        <span className="vendor-section-note">
          {t("订单待办包含往日未履约订单")}
        </span>
      </div>
      <div className="vendor-tasks">
        <button
          onClick={() =>
            openVendorPage(navigate, "orders", { status: "pending" })
          }
        >
          <span className="vendor-task-icon amber">
            <Clock3 size={21} />
          </span>
          <span>
            <strong>{t("确认预购")}</strong>
            <small>{t("核对商品，安排备货")}</small>
          </span>
          <b>{data.pending}</b>
          <ArrowUpRight size={17} />
        </button>
        <button
          onClick={() =>
            openVendorPage(navigate, "orders", { status: "confirmed" })
          }
        >
          <span className="vendor-task-icon">
            <Truck size={21} />
          </span>
          <span>
            <strong>{t("等待自提")}</strong>
            <small>{t("交付商品后确认收款")}</small>
          </span>
          <b>{data.waitingPickup}</b>
          <ArrowUpRight size={17} />
        </button>
        <button
          onClick={() =>
            openVendorPage(navigate, "inventory", { status: "off-date" })
          }
        >
          <span className="vendor-task-icon">
            <CalendarDays size={21} />
          </span>
          <span>
            <strong>{t("核对售卖日期")}</strong>
            <small>{t("非今日商品不会展示给顾客")}</small>
          </span>
          <b>{data.offDateProducts}</b>
          <ArrowUpRight size={17} />
        </button>
      </div>
      <div className="vendor-dashboard-columns">
        <section className="vendor-panel">
          <div className="vendor-panel-heading">
            <div>
              <span className="eyebrow">LATEST PREORDERS</span>
              <h3>{t("最近的预购")}</h3>
            </div>
            <button className="text-button" onClick={() => navigate("orders")}>
              {t("查看全部")}
              <ArrowRight size={15} />
            </button>
          </div>
          {data.recentOrders.length ? (
            <div className="vendor-recent-orders">
              {data.recentOrders.map((o) => (
                <button
                  key={o.id}
                  onClick={() =>
                    openVendorPage(navigate, "orders", { search: o.id })
                  }
                >
                  <span className="vendor-order-avatar">
                    {o.client_name.slice(0, 1)}
                  </span>
                  <span className="vendor-recent-info">
                    <strong>{o.client_name}</strong>
                    <small>
                      {o.id} · {o.pickup_date} · {o.pickup_slot}
                    </small>
                  </span>
                  <span className="vendor-recent-total">
                    <strong>{money(o.total_cents)}</strong>
                    <span className={`status-badge status-${o.status}`}>
                      {t(orderLabels[o.status])}
                    </span>
                  </span>
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
          ) : (
            <Empty
              icon={<ShoppingBag />}
              title="新鲜订单，很快相见"
              text="收到预购后，在这里查看并开始备货。"
            />
          )}
        </section>
        <section className="vendor-panel">
          <div className="vendor-panel-heading">
            <div>
              <span className="eyebrow">STOCK WATCH</span>
              <h3>{t("今日库存提醒")}</h3>
            </div>
            <span className="vendor-count">{data.lowStock.length}</span>
          </div>
          {data.lowStock.length ? (
            <div className="vendor-stock-list">
              {data.lowStock.slice(0, 4).map((p) => (
                <button
                  key={p.id}
                  onClick={() =>
                    openVendorPage(navigate, "inventory", {
                      product: String(p.id),
                    })
                  }
                >
                  <div className={`mini-art art-bg-${p.art}`}>
                    <Produce kind={p.art} />
                  </div>
                  <span>
                    <strong>{t(p.name)}</strong>
                    <small>
                      {p.stock
                        ? t("仅剩 {count} {unit}", {
                            count: p.stock,
                            unit: t(p.unit),
                          })
                        : t("已售罄，及时补货")}
                    </small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <div className="vendor-stock-good">
              <CheckCircle2 size={33} />
              <strong>{t("库存状态良好")}</strong>
              <p>{t("暂无今日低库存商品，记得核对现场销售。")}</p>
            </div>
          )}
          <button
            className="button secondary full-width"
            onClick={() =>
              openVendorPage(navigate, "inventory", {
                status: data.outOfStock ? "out" : "low",
              })
            }
          >
            {t("检查商品与库存")}
            <ArrowRight size={15} />
          </button>
        </section>
      </div>
      <p className="vendor-footnote">
        <Leaf size={15} />
        {t("金额按预购记录统计；称重商品的最终收款请在线下核对。")}
      </p>
    </div>
  );
}

export function VendorOrders({
  today,
  slots,
  revision,
  refresh,
  notify,
}: {
  today: string;
  slots: string[];
  revision: number;
  refresh: () => void;
  notify: (message: string) => void;
}) {
  const { t, language } = useLanguage();
  const {
    data: orders = [],
    setData,
    error,
    loading,
  } = useVendorData<Order[]>("/orders", revision);
  const initialStatus =
    new URLSearchParams(window.location.search).get("status") ?? "all";
  const [status, setStatus] = useState(
    ["all", ...Object.keys(orderLabels)].includes(initialStatus)
      ? initialStatus
      : "all",
  );
  const [search, setSearch] = useState(
    () => new URLSearchParams(window.location.search).get("search") ?? "",
  );
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState<{
    order: Order;
    status: "completed" | "cancelled";
  }>();
  const [actionError, setActionError] = useState("");
  const closeConfirm = useCallback(() => {
    setConfirm(undefined);
    setActionError("");
  }, []);
  const changeStatus = (next: string) => {
    setStatus(next);
    const params = new URLSearchParams(window.location.search);
    params.set("status", next);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params}`,
    );
  };
  const update = async (order: Order, next: OrderStatus) => {
    if (busy) return;
    setBusy(order.id);
    setActionError("");
    try {
      const saved = await api<Order>(`/orders/${order.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      setData((current) =>
        current?.map((item) => (item.id === saved.id ? saved : item)),
      );
      closeConfirm();
      refresh();
      notify(
        next === "cancelled"
          ? "订单已取消，库存已归还"
          : next === "confirmed"
            ? "订单已确认，请等待顾客自提"
            : "订单已完成",
      );
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const query = search.trim().toLocaleLowerCase();
  const matching = orders.filter(
    (o) =>
      (!date || o.pickup_date === date) &&
      (!slot || o.pickup_slot === slot) &&
      (!query ||
        [
          o.id,
          o.client_name,
          o.note,
          ...o.items.map((i) => t(i.name)),
          ...o.items.map((i) => i.name),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query)),
  );
  const visible = matching.filter(
    (o) => status === "all" || o.status === status,
  );
  const reset = () => {
    setSearch("");
    setDate("");
    setSlot("");
    changeStatus("all");
    const params = new URLSearchParams(window.location.search);
    params.delete("search");
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params}`,
    );
  };
  return (
    <div className="vendor-orders">
      <div className="vendor-order-guide">
        <span className="vendor-task-icon">
          <Package size={23} />
        </span>
        <div>
          <strong>{t("确认预购 → 准备商品 → 自提并收款")}</strong>
          <p>{t("预购采用到场付款。交付商品并收到款项后，再标记订单完成。")}</p>
        </div>
      </div>
      <div className="vendor-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("订单号、顾客或商品名称…")}
            aria-label={t("搜索预购订单")}
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label={t("清除搜索")}>
              <X size={15} />
            </button>
          )}
        </label>
        <label className="vendor-filter-label">
          {t("自提日期")}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="vendor-filter-label">
          {t("自提时段")}
          <select value={slot} onChange={(e) => setSlot(e.target.value)}>
            <option value="">{t("全部时段")}</option>
            {slots.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <VendorRefresh refresh={refresh} loading={loading} />
      </div>
      <div className="vendor-tabs" role="group" aria-label={t("订单状态筛选")}>
        {[["all", "全部订单"], ...Object.entries(orderLabels)].map(
          ([key, label]) => (
            <button
              key={key}
              aria-pressed={status === key}
              onClick={() => changeStatus(key)}
            >
              {t(label)}
              <span>
                {
                  matching.filter((o) => key === "all" || o.status === key)
                    .length
                }
              </span>
            </button>
          ),
        )}
      </div>
      <div className="vendor-results">
        <span role="status">
          {t("共 {count} 笔预购", { count: visible.length })}
        </span>
        {(search || date || slot || status !== "all") && (
          <button className="text-button" onClick={reset}>
            {t("清除筛选")}
          </button>
        )}
      </div>
      {actionError && !confirm && (
        <VendorError error={actionError} refresh={refresh} />
      )}
      {error ? (
        <VendorError error={error} refresh={refresh} />
      ) : loading && !orders.length ? (
        <div className="loading-panel">
          <LoaderCircle className="spin" />
          {t("正在读取预购订单…")}
        </div>
      ) : !visible.length ? (
        <Empty
          icon={<ShoppingBag />}
          title={orders.length ? "没有符合条件的预购" : "新鲜订单，很快相见"}
          text={
            orders.length
              ? "试试其他关键词，或清除筛选查看全部订单。"
              : "收到预购后，在这里查看并开始备货。"
          }
          action={
            orders.length ? (
              <button className="button secondary" onClick={reset}>
                {t("清除筛选")}
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="vendor-order-grid">
          {visible.map((o) => (
            <article className="vendor-panel vendor-order" key={o.id}>
              <div className="vendor-order-top">
                <div>
                  <strong>{o.id}</strong>
                  <small>
                    {new Intl.DateTimeFormat(
                      language === "en" ? "en-US" : "zh-CN",
                      {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "America/New_York",
                      },
                    ).format(
                      new Date(`${o.created_at.replace(" ", "T")}Z`),
                    )}{" "}
                    ET
                  </small>
                </div>
                <span className={`status-badge status-${o.status}`}>
                  {t(orderLabels[o.status])}
                </span>
              </div>
              <div className="vendor-pickup-info">
                <span className="vendor-order-avatar">
                  {o.client_name.slice(0, 1)}
                </span>
                <div>
                  <strong>{o.client_name}</strong>
                  <small>
                    {o.pickup_date} · {o.pickup_slot} ET
                  </small>
                </div>
                {o.pickup_date < today &&
                  (o.status === "pending" || o.status === "confirmed") && (
                    <span className="vendor-overdue">{t("往日未履约")}</span>
                  )}
              </div>
              <div className="vendor-order-items">
                {o.items.map((i) => (
                  <div key={i.product_id}>
                    <span>
                      {t(i.name)}
                      <small>
                        {money(i.price_cents)} / {t(i.unit)}
                      </small>
                    </span>
                    <span>
                      × {i.quantity}
                      <strong>{money(i.price_cents * i.quantity)}</strong>
                    </span>
                  </div>
                ))}
              </div>
              {o.note && (
                <p className="vendor-order-note">
                  <strong>{t("顾客备注")}</strong>
                  {o.note}
                </p>
              )}
              <div className="vendor-order-total">
                <span>{t("到场付款")}</span>
                <strong>{money(o.total_cents)}</strong>
              </div>
              {(o.status === "pending" || o.status === "confirmed") && (
                <div className="vendor-order-actions">
                  <button
                    className="button subtle"
                    disabled={!!busy || loading}
                    onClick={() => {
                      setActionError("");
                      setConfirm({ order: o, status: "cancelled" });
                    }}
                  >
                    {t("取消订单")}
                  </button>
                  <button
                    className="button primary"
                    disabled={!!busy || loading}
                    onClick={() =>
                      o.status === "pending"
                        ? void update(o, "confirmed")
                        : (setActionError(""),
                          setConfirm({ order: o, status: "completed" }))
                    }
                  >
                    {busy === o.id ? (
                      <LoaderCircle size={15} className="spin" />
                    ) : (
                      <Check size={15} />
                    )}
                    {t(
                      busy === o.id
                        ? "正在更新…"
                        : o.status === "pending"
                          ? "确认预购"
                          : "确认已自提并收款",
                    )}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {confirm && (
        <Modal
          title={
            confirm.status === "completed"
              ? "确认自提并收款？"
              : "取消这份预购？"
          }
          onClose={closeConfirm}
          busy={!!busy}
        >
          <p className="modal-intro">
            {confirm.order.id} · {confirm.order.client_name}
          </p>
          <p className="vendor-confirm-copy">
            {t(
              confirm.status === "completed"
                ? "请确认商品已交付，并已收到 {amount}。完成后无法撤回。"
                : "取消后，预留库存会自动归还。已取消订单无法恢复。",
              { amount: money(confirm.order.total_cents) },
            )}
          </p>
          {actionError && (
            <p className="form-error" role="alert">
              {t(actionError)}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={closeConfirm}
              disabled={!!busy}
            >
              {t("返回订单")}
            </button>
            <button
              className={`button ${confirm.status === "completed" ? "primary" : "danger"}`}
              disabled={!!busy}
              onClick={() => void update(confirm.order, confirm.status)}
            >
              {t(
                busy
                  ? "正在更新…"
                  : confirm.status === "completed"
                    ? "确认完成"
                    : "确认取消",
              )}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
