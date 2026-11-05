import { ArrowRight, Banknote, ClipboardCheck, Receipt, Store } from "lucide-react";
import { money } from "./api";
import { useLanguage } from "./i18n";
import type { SchoolOverview } from "./types";
import type { Page } from "./navigation";
import TenderAnalytics from './TenderAnalytics';

export default function BusinessAnalytics({ data, navigate }: { data: SchoolOverview; navigate: (page: Page) => void }) {
  const { t } = useLanguage();
  const { receipts: r, attendance: a, reports: s, fees: f } = data.analytics.business;
  const receiptsTotal = r.cashCents + r.cardCents + r.snapCents;
  const coverage = data.summary.completed ? r.orders / data.summary.completed * 100 : null;
  const reportCoverage = a.checkedIn ? s.reports / a.checkedIn * 100 : null;
  const pct = (n: number | null) => n === null ? "—" : `${n.toFixed(1)}%`;
  return <div className="business-dashboard">
    <div className="business-context"><div><span className="eyebrow">BUSINESS HEALTH</span><h3>{t("商户卖得好，市场也要办得下去。")}</h3><p>{t("商品销售、运营方费用和公益支持，分开核对。")}</p></div><button className="business-link" onClick={() => navigate("school-community")}>{t("补充运营记录")}<ArrowRight size={15} /></button></div>
    <div className="business-grid">
      <TenderAnalytics mix={data.analytics.business.tenderMix} reports={s.reports}/>
      <section className="panel business-panel"><div className="decision-heading"><div className="decision-heading-title"><span className="decision-section-icon"><Banknote size={19} /></span><div><span className="eyebrow">VENDOR SALES</span><h3>{t("平台订单收款登记")}</h3></div></div></div><div className="business-lead"><strong>{money(receiptsTotal)}</strong><span>{r.orders} / {data.summary.completed} {t("完成订单已登记收款")}</span></div><div className="business-progress"><i style={{ width: `${coverage ?? 0}%` }} /></div><p className="business-progress-label">{t("收款记录覆盖率")} <b>{pct(coverage)}</b></p><dl className="business-facts">{[["现金登记", money(r.cashCents)], ["银行卡登记", money(r.cardCents)], ["SNAP/EBT 登记", money(r.snapCents)], ["缺收款记录的完成订单", data.summary.completed - r.orders]].map(([label, value]) => <div key={String(label)}><dt>{t(String(label))}</dt><dd>{value}</dd></div>)}</dl><p className="school-footnote">{t("按本期自提订单关联收款凭据；线下登记不等于银行已结算，也不属于运营方收入。")}</p></section>
      <section className="panel business-panel"><div className="decision-heading"><div className="decision-heading-title"><span className="decision-section-icon blue"><Receipt size={19} /></span><div><span className="eyebrow">OPERATOR FEES</span><h3>{t("运营方商户费用")}</h3></div></div></div><div className="business-lead"><strong>{money(f.periodReceiptsCents)}</strong><span>{t("本期登记的费用收款")}</span></div><dl className="business-facts">{[["本期到期账单", f.invoices], ["到期账单金额", money(f.billedCents)], ["到期账单已登记收款", money(f.paidCents)], ["到期账单当前未收", money(f.outstandingCents)], ["其中已逾期未收", money(f.overdueCents)]].map(([label, value]) => <div key={String(label)}><dt>{t(String(label))}</dt><dd>{value}</dd></div>)}</dl><p className="school-footnote">{t("本期费用收款按美国东部登记日期统计；账单按到期日归组，余额反映当前状态。商品销售额不计作运营方收入。")}</p></section>
      <section className="panel business-panel"><div className="decision-heading"><div className="decision-heading-title"><span className="decision-section-icon amber"><Store size={19} /></span><div><span className="eyebrow">ATTENDANCE</span><h3>{t("出摊与销售填报覆盖")}</h3></div></div></div><div className="business-lead"><strong>{pct(reportCoverage)}</strong><span>{s.reports} / {a.checkedIn} {t("已签到商户场次有销售填报")}</span></div><div className="business-progress"><i style={{ width: `${reportCoverage ?? 0}%` }} /></div><dl className="business-facts">{[["已登记出摊场次", a.sessions], ["商户出摊安排", a.assignments], ["已签到商户场次", a.checkedIn], ["已登记缺席", a.absent], ["尚未确认出勤", a.unconfirmed], ["待补销售填报", a.checkedIn - s.reports], ["商户申报销售额", s.reports ? money(s.grossCents) : "—"], ["商户申报交易笔数", s.reports ? s.transactions : "—"]].map(([label, value]) => <div key={String(label)}><dt>{t(String(label))}</dt><dd>{value}</dd></div>)}</dl><p className="school-footnote">{t("仅统计本期已到日期且未取消的场次。商户申报包含预购与现场销售，不能与平台订单相加；缺报不等于零销售。")}</p></section>
      <section className="panel business-panel business-readiness"><div className="decision-heading"><div className="decision-heading-title"><span className="decision-section-icon"><ClipboardCheck size={19} /></span><div><span className="eyebrow">MODEL INPUTS</span><h3>{t("长期经营模型还缺什么")}</h3></div></div></div><p className="business-model-intro">{t("收入有记录，还需要完整成本与支持来源，才能判断可持续经营。")}</p><ul>{[["商品价格与交付销量", "已有平台记录", true], ["商户出摊与销售填报", "可录入，需持续补齐", true], ["商户进货、运输与人工成本", "尚未采集", false], ["商品损耗与实物库存流水", "尚未采集", false], ["场地、保险与运营人力成本", "尚未采集", false], ["资助、捐赠与公益补贴", "尚未采集", false]].map(([label, status, available]) => <li key={String(label)}><span>{t(String(label))}</span><b className={available ? "ready" : "missing"}>{t(String(status))}</b></li>)}</ul><p className="school-footnote">{t("暂不计算利润、盈亏平衡或补贴依赖率；缺失成本不按零处理。")}</p></section>
    </div>
  </div>;
}
