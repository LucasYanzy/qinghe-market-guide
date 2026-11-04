import { useEffect, useState } from "react";
import { ArrowUpRight, ClipboardList, Clock3, Store, Users, Wallet } from "lucide-react";
import { money } from "./api";
import { useLanguage } from "./i18n";
import { serviceDeskUrl, workflowUrl, type OperatingFollowup } from "./schoolScreenTypes";

export default function SchoolScreenOperations({ data, marketId, date }: { data: OperatingFollowup; marketId: number | null; date: string }) {
  const { t } = useLanguage(), s = data.summary;
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [marketId]);
  const pages = Math.max(1, Math.ceil(data.markets.length / 5)), current = Math.min(page, pages - 1);
  const collected = s.expected ? Math.round(s.checkedIn / s.expected * 100) : null;
  const kpis = [
    { label: "已签到 / 应到摊次", value: `${s.checkedIn} / ${s.expected}`, note: "同一商户跨市场分别计次", icon: Users, href: workflowUrl("sessions", marketId, date) },
    { label: "开场后仍未签到", value: s.late, note: "核对现场，不自动判定缺席", icon: Clock3, href: workflowUrl("sessions", marketId, date) },
    { label: "已签到但未填报销售", value: s.missingReports, note: "零销售也需明确填报", icon: ClipboardList, href: workflowUrl("sales", marketId, date) },
    { label: "已填报销售额", value: s.reports ? money(s.grossCents) : "—", note: "含预购，不能与预购额相加", icon: Wallet, href: workflowUrl("sales", marketId, date) },
    { label: "逾期市场费用", value: money(s.overdueCents), note: "全部未结账单，不受周期限制", icon: Store, href: workflowUrl("invoices", marketId, date) },
    { label: "待顾客确认的调整", value: s.adjustmentCount, note: "按下方日期进入订单处理", icon: ClipboardList },
  ];
  const needsAttention = (label: string) => label === "开场后仍未签到" && s.late > 0 || label === "逾期市场费用" && s.overdueCents > 0 || label === "待顾客确认的调整" && s.adjustmentCount > 0;
  return <>
    <section className="screen-kpis" aria-label={t("出摊经营指标")}>{kpis.map(k => <article key={k.label} className={`screen-kpi ${needsAttention(k.label) ? "attention" : ""}`}><span>{t(k.label)}<k.icon size={17} /></span><strong>{k.value}</strong>{k.href ? <a href={k.href}>{t(k.note)}<ArrowUpRight size={12} /></a> : <small>{t(k.note)}</small>}</article>)}</section>
    <div className="screen-primary-grid screen-followup-primary">
      <section className="screen-panel screen-market-followup"><Title title="各市场出摊与经营" kicker="MARKET OPERATIONS" /><p className="screen-caption">{t("出摊仅统计今日非草稿、未取消场次；销售按营业日期汇总。")}</p>
        <div className="screen-table-scroll" role="region" tabIndex={0} aria-label={t("各市场经营数据")}><table className="screen-operating-table"><thead><tr>{["市场", "应到摊次", "已签到", "未签到提醒", "漏报销售", "已填报销售额", "处理"].map(label => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{data.markets.slice(current * 5, current * 5 + 5).map(m => <tr key={m.id}><th scope="row" title={t(m.name)}>{t(m.name)}</th><td>{m.expected}</td><td>{m.checkedIn}</td><td className={m.late ? "screen-warning-value" : ""}>{m.late}</td><td>{m.missingReports}</td><td>{m.reports ? money(m.grossCents) : "—"}</td><td><a href={workflowUrl("sessions", m.id, date)} aria-label={t("查看 {market} 的出摊", { market: t(m.name) })}><ArrowUpRight size={15} /></a></td></tr>)}</tbody></table></div>
        {!data.markets.length && <p className="screen-empty">{t("尚未配置市场，请先在市场设置中新增。")}</p>}
        {pages > 1 && <div className="screen-pagination"><button disabled={!current} onClick={() => setPage(current - 1)}>{t("上一页")}</button><span>{current + 1} / {pages}</span><button disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>{t("下一页")}</button></div>}
      </section>
      <section className="screen-panel screen-attendance"><Title title="今日出摊进度" kicker="ATTENDANCE · TODAY" />
        <div className="screen-attendance-overview"><div className="screen-attendance-ring" role="img" aria-label={t("签到率 {rate}", { rate: collected === null ? "—" : `${collected}%` })}><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" fill="none" stroke="#ffffff0c" strokeWidth="7" /><circle cx="60" cy="60" r="50" fill="none" stroke="#b9df91" strokeWidth="7" strokeDasharray={`${(collected ?? 0) * Math.PI} ${100 * Math.PI}`} transform="rotate(-90 60 60)" /></svg><strong>{collected === null ? "—" : `${collected}%`}</strong><span>{t("签到率")}</span></div>
          <div className="screen-attendance-breakdown">{[["已签到", s.checkedIn], ["已确认未签到", s.confirmed], ["尚未确认出摊", s.unconfirmed], ["已请假", s.absent]].map(([label, value]) => <div key={label}><span>{t(String(label))}</span><strong>{value}</strong></div>)}</div></div>
        <p className="screen-caption">{t("今日有效场次 {count} 场；请假不计入应到，签到缺口不代表实际缺席。", { count: s.sessions })}</p><a className="screen-text-link" href={workflowUrl("sessions", marketId, date)}>{t("核对出摊名单")}<ArrowUpRight size={14} /></a>
      </section>
    </div>
    <div className="screen-secondary-grid screen-followup-secondary">
      <section className="screen-panel"><Title title="销售填报完整度" kicker="REPORTED SALES" /><div className="screen-followup-total"><strong>{s.attendanceReports} / {s.checkedIn}</strong><span>{t("已签到摊次的填报完成数")}</span></div><div className="screen-mini-stats"><span>{t("全部销售填报")}<b>{s.reports}</b></span><span>{t("自报交易笔数")}<b>{s.transactions}</b></span></div><p className="screen-caption">{t("未填报的销售未知；已登记的零值计为完成。填报包含预购与现场交易，不与本站预购重复相加。")}</p><a className="screen-text-link" href={workflowUrl("sales", marketId, date)}>{t("代商户补填销售")}<ArrowUpRight size={14} /></a></section>
      <section className="screen-panel"><Title title="市场费用跟进" kicker="OPEN VENDOR INVOICES" /><div className="screen-followup-total"><strong>{money(s.unpaidCents)}</strong><span>{t("全部市场费用未收余额")}</span></div><div className="screen-mini-stats"><span>{t("未收账单")}<b>{s.invoiceCount}</b></span><span>{t("逾期账单")}<b>{s.overdueInvoiceCount}</b></span></div><p className="screen-caption">{t("余额扣除已登记的部分收款，作废及已收清账单不计入。到期日早于今日才计为逾期。")}</p><a className="screen-text-link" href={workflowUrl("invoices", marketId, date)}>{t("核对市场费用")}<ArrowUpRight size={14} /></a></section>
      <section className="screen-panel"><Title title="订单调整跟进" kicker="CUSTOMER APPROVAL" /><p className="screen-caption">{t("包含全部日期待顾客确认的调整，不会自动当作同意。")}</p>{data.adjustments.length ? <div className="screen-worklist screen-adjustment-worklist">{data.adjustments.slice(0, 3).map(a => <a key={`${a.marketId}:${a.date}`} href={serviceDeskUrl(a.marketId, a.date, "adjustments")}><span><strong>{t(a.marketName)}</strong><small>{a.date}</small></span><b>{t("{count} 单", { count: a.count })}<ArrowUpRight size={13} /></b></a>)}</div> : <p className="screen-empty">{t("暂无待确认的订单调整")}</p>}{data.adjustments.length > 3 && <p className="screen-caption">{t("显示最早的 3 组，共 {count} 组", { count: data.adjustments.length })}</p>}</section>
    </div>
  </>;
}
function Title({ title, kicker }: { title: string; kicker: string }) {
  const { t } = useLanguage(); return <div className="screen-panel-title"><span>{kicker}</span><h2>{t(title)}</h2></div>;
}
