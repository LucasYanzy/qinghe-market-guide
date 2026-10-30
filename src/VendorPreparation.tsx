import {
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardList,
  Package,
} from "lucide-react";
import { quantityUnit } from "./translations/translate";
import { useLanguage } from "./i18n";
import { Empty } from "./ui";
import type { Order, OrderItem, OrderStatus } from "./types";

export function VendorOrderProgress({ status }: { status: OrderStatus }) {
  const { t } = useLanguage();
  if (status === "cancelled")
    return (
      <p className="vendor-order-closed">{t("订单已取消，预留库存已归还。")}</p>
    );
  const index = { pending: 0, confirmed: 1, completed: 2 }[status];
  return (
    <ol className="vendor-order-progress" aria-label={t("履约步骤")}>
      {["确认预购", "备货与待自提", "自提收款"].map((label, step) => (
        <li
          key={label}
          className={step <= index ? "is-reached" : ""}
          aria-current={step === index ? "step" : undefined}
        >
          <span>
            {step < index || status === "completed" ? (
              <Check size={11} />
            ) : (
              step + 1
            )}
          </span>
          {t(label)}
        </li>
      ))}
    </ol>
  );
}

export function VendorPreparation({
  orders,
  today,
  onOpen,
  onBack,
}: {
  orders: Order[];
  today: string;
  onOpen: (date: string, slot: string) => void;
  onBack: () => void;
}) {
  const { t, language } = useLanguage();
  const confirmed = orders.filter((o) => o.status === "confirmed");
  const groups = new Map<
    string,
    {
      date: string;
      slot: string;
      orders: Order[];
      items: Map<string, OrderItem>;
    }
  >();
  for (const order of confirmed) {
    const key = `${order.pickup_date}|${order.pickup_slot}`;
    const group: {
      date: string;
      slot: string;
      orders: Order[];
      items: Map<string, OrderItem>;
    } = groups.get(key) ?? {
      date: order.pickup_date,
      slot: order.pickup_slot,
      orders: [],
      items: new Map(),
    };
    group.orders.push(order);
    for (const item of order.items) {
      // Keep renamed products and changed units separate; use order snapshots.
      const itemKey = JSON.stringify([item.product_id, item.name, item.unit]);
      const previous = group.items.get(itemKey);
      group.items.set(itemKey, {
        ...item,
        quantity: item.quantity + (previous?.quantity ?? 0),
      });
    }
    groups.set(key, group);
  }
  return (
    <section className="vendor-preparation" aria-label={t("备货清单")}>
      <div className="vendor-prep-intro">
        <ClipboardList size={20} />
        <div>
          <strong>{t("按时段，把每一份新鲜准备好")}</strong>
          <p>
            {t(
              "仅汇总当前筛选中的待自提订单。待确认订单请先确认，已完成与取消订单不计入。",
            )}
          </p>
        </div>
      </div>
      {!groups.size ? (
        <Empty
          icon={<Package />}
          title="暂无可备货的订单"
          text="切换筛选，或先在订单视图确认预购。"
          action={
            <button className="button secondary" onClick={onBack}>
              {t("返回订单视图")}
            </button>
          }
        />
      ) : (
        [...groups.values()]
          .sort(
            (a, b) =>
              a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot),
          )
          .map((group) => (
            <article
              className="vendor-panel vendor-prep-group"
              key={`${group.date}|${group.slot}`}
            >
              <header>
                <div>
                  <span className="vendor-prep-date">
                    <CalendarDays size={14} />
                    {group.date === today ? t("今天") : group.date}
                    {group.date < today && <em>{t("往日未履约")}</em>}
                  </span>
                  <h3>
                    {group.slot} <small>ET</small>
                  </h3>
                </div>
                <span>
                  {t("{count} 笔待自提", { count: group.orders.length })}
                </span>
              </header>
              <div
                className="vendor-prep-items"
                role="list"
                aria-label={t("待备商品")}
              >
                {[...group.items.values()]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((item) => (
                    <div
                      role="listitem"
                      key={JSON.stringify([
                        item.product_id,
                        item.name,
                        item.unit,
                      ])}
                    >
                      <span>{t(item.name)}</span>
                      <strong>
                        {item.quantity}
                        <small>{quantityUnit(language, item.unit, item.quantity)}</small>
                      </strong>
                    </div>
                  ))}
              </div>
              {group.orders.some((o) => o.note) && (
                <div className="vendor-prep-notes">
                  <strong>{t("备货前留意顾客备注")}</strong>
                  {group.orders
                    .filter((o) => o.note)
                    .map((o) => (
                      <p key={o.id}>
                        <span>
                          {o.client_name} · {o.id}
                        </span>
                        {o.note}
                      </p>
                    ))}
                </div>
              )}
              <footer>
                <span>{t("数量来自预购快照，称重商品现场核对。")}</span>
                <button
                  className="text-button"
                  onClick={() => onOpen(group.date, group.slot)}
                >
                  {t("查看时段订单")}
                  <ArrowRight size={14} />
                </button>
              </footer>
            </article>
          ))
      )}
    </section>
  );
}
