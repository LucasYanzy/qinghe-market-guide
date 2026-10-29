import { useState } from "react";
import { ArrowUpRight, Clock3 } from "lucide-react";
import { money, shortDate } from "./api";
import { useLanguage } from "./i18n";
import { openVendorPage, orderLabels } from "./vendorSupport";
import type { Page } from "./navigation";
import type { Dashboard, OrderStatus } from "./types";

const statusColors = {
  pending: "#c39948",
  confirmed: "#799e8e",
  completed: "#375d47",
};
export function VendorAnalytics({
  data,
  today,
  navigate,
}: {
  data: Dashboard;
  today: string;
  navigate: (page: Page) => void;
}) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState<string>();
  const active =
    data.series.find((day) => day.date === selected) ?? data.series.at(-1)!;
  const maximum = Math.max(
    500,
    Math.ceil(
      Math.max(
        ...data.series.map((day) => day.completedCents + day.reservedCents),
      ) / 500,
    ) * 500,
  );
  const weekTotal = data.series.reduce(
    (sum, day) => sum + day.completedCents + day.reservedCents,
    0,
  );
  const count =
    data.statusCounts.pending +
    data.statusCounts.confirmed +
    data.statusCounts.completed;
  const circumference = 2 * Math.PI * 48;
  let offset = 0;
  return (
    <>
      <div className="vendor-analytics-grid">
        <section
          className="vendor-panel vendor-trend"
          aria-label={t("近七天预购金额")}
        >
          <div className="vendor-panel-heading">
            <div>
              <span className="eyebrow">THE PAST 7 DAYS</span>
              <h3>{t("每一天的收获")}</h3>
            </div>
            <span className="vendor-chart-unit">USD</span>
          </div>
          <div className="vendor-chart-total">
            <strong>{money(weekTotal)}</strong>
            <span>{t("近 7 天有效预购金额")}</span>
          </div>
          <div className="vendor-chart-legend">
            <span>
              <i className="completed" />
              {t("已完成金额")}
            </span>
            <span>
              <i className="reserved" />
              {t("待履约金额")}
            </span>
          </div>
          <div className="vendor-bar-chart">
            {weekTotal === 0 && (
              <p className="vendor-chart-empty">{t("近七天暂无预购记录")}</p>
            )}
            <div className="vendor-chart-axis" aria-hidden="true">
              <span>{money(maximum)}</span>
              <span>{money(maximum / 2)}</span>
              <span>$0</span>
            </div>
            <div className="vendor-chart-days">
              {data.series.map((day) => (
                <button
                  key={day.date}
                  className={`vendor-chart-day ${active.date === day.date ? "is-active" : ""}`}
                  onMouseEnter={() => setSelected(day.date)}
                  onFocus={() => setSelected(day.date)}
                  onClick={() =>
                    openVendorPage(navigate, "orders", { date: day.date })
                  }
                  aria-label={t("查看 {date} 的 {count} 笔预购，共 {amount}", {
                    date: day.date,
                    count: day.orders,
                    amount: money(day.completedCents + day.reservedCents),
                  })}
                >
                  <span className="vendor-chart-track" aria-hidden="true">
                    <span
                      className="vendor-chart-stack"
                      style={{
                        height: `${((day.completedCents + day.reservedCents) / maximum) * 100}%`,
                      }}
                    >
                      <span
                        className="reserved"
                        style={{ flex: day.reservedCents }}
                      />
                      <span
                        className="completed"
                        style={{ flex: day.completedCents }}
                      />
                    </span>
                  </span>
                  <span className="vendor-chart-day-label">
                    {day.date === today ? t("今天") : shortDate(day.date)}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="vendor-chart-readout" aria-live="polite">
            <span>
              {shortDate(active.date)} ·{" "}
              {t("{count} 笔预购", { count: active.orders })}
            </span>
            <strong>
              {money(active.completedCents + active.reservedCents)}
            </strong>
            <ArrowUpRight size={14} />
          </div>
          <p className="vendor-chart-note">
            {t("按自提日期统计，不含已取消订单。点击日期查看明细。")}
          </p>
        </section>
        <section
          className="vendor-panel vendor-fulfillment"
          aria-label={t("今日履约进度")}
        >
          <div className="vendor-panel-heading">
            <div>
              <span className="eyebrow">TODAY'S FULFILLMENT</span>
              <h3>{t("今日履约进度")}</h3>
            </div>
            <span className="vendor-chart-unit">{shortDate(today)}</span>
          </div>
          <div
            className="vendor-donut"
            role="img"
            aria-label={t("今日有效预购 {total} 笔，已完成 {completed} 笔", {
              total: count,
              completed: data.statusCounts.completed,
            })}
          >
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle
                cx="60"
                cy="60"
                r="48"
                fill="none"
                stroke="#edf1e8"
                strokeWidth="11"
              />
              {(Object.keys(statusColors) as (keyof typeof statusColors)[]).map(
                (status) => {
                  const length = count
                    ? (data.statusCounts[status] / count) * circumference
                    : 0;
                  const start = offset;
                  offset += length;
                  return (
                    <circle
                      key={status}
                      cx="60"
                      cy="60"
                      r="48"
                      fill="none"
                      stroke={statusColors[status]}
                      strokeWidth="11"
                      strokeDasharray={`${length} ${circumference - length}`}
                      strokeDashoffset={-start}
                      transform="rotate(-90 60 60)"
                    />
                  );
                },
              )}
            </svg>
            <div>
              <strong>
                {count
                  ? `${Math.round((data.statusCounts.completed / count) * 100)}%`
                  : "—"}
              </strong>
              <span>{t(count ? "已完成" : "今日暂无预购")}</span>
            </div>
          </div>
          <div className="vendor-status-legend">
            {(Object.keys(statusColors) as (keyof typeof statusColors)[]).map(
              (status) => (
                <button
                  key={status}
                  onClick={() =>
                    openVendorPage(navigate, "orders", { date: today, status })
                  }
                >
                  <i style={{ background: statusColors[status] }} />
                  <span>{t(orderLabels[status as OrderStatus])}</span>
                  <strong>{data.statusCounts[status]}</strong>
                  <ArrowUpRight size={13} />
                </button>
              ),
            )}
          </div>
          <button
            className="vendor-cancelled-link"
            onClick={() =>
              openVendorPage(navigate, "orders", {
                date: today,
                status: "cancelled",
              })
            }
          >
            {t("另有 {count} 笔已取消", { count: data.statusCounts.cancelled })}
            <ArrowUpRight size={12} />
          </button>
        </section>
      </div>
      <section
        className="vendor-pickup-schedule"
        aria-label={t("今日自提安排")}
      >
        <div>
          <Clock3 size={18} />
          <h3>{t("今日自提安排")}</h3>
          <span>ET</span>
        </div>
        <div className="vendor-slot-grid">
          {data.pickupSummary.map((slot) => (
            <button
              key={slot.slot}
              onClick={() =>
                openVendorPage(navigate, "orders", {
                  date: today,
                  slot: slot.slot,
                  status: "open",
                })
              }
            >
              <span className="vendor-slot-time">
                {slot.slot}
                <ArrowUpRight size={14} />
              </span>
              <strong>
                {slot.pending + slot.confirmed}
                <small>{t("笔待履约")}</small>
              </strong>
              <span className="vendor-slot-breakdown">
                {t("待确认 {pending} · 待自提 {confirmed}", {
                  pending: slot.pending,
                  confirmed: slot.confirmed,
                })}
              </span>
              <span className="vendor-slot-track" aria-hidden="true">
                <span
                  style={{
                    width: `${slot.pending + slot.confirmed + slot.completed ? (slot.completed / (slot.pending + slot.confirmed + slot.completed)) * 100 : 0}%`,
                  }}
                />
              </span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
