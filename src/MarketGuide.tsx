import { useLanguage } from "./i18n";
import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Clock3, Copy, ExternalLink, Leaf, Mail, MapPin, Navigation, Phone, Search, ShoppingBag, Store, X } from "lucide-react";
import guide from "../references/rutgers-market-guide.json";
import { MarketDayPlanner, useMarketNow } from "./MarketVisit";
import { directionsUrl, formatMarketDate, upcomingEvents, type TravelMode } from "./marketSchedule";
import { SnapPurchaseGuide } from "./SnapProgram";

export function OfficialSource() {
  const { t } = useLanguage();
  return (
    <section className="official-market-reference">
      <div className="official-reference-icon"><Store size={25} /></div>
      <div className="official-reference-copy">
        <span className="eyebrow">RUTGERS · OFFICIAL INFORMATION</span>
        <h2>{t(guide.name)}</h2>
        <p>{t("营业季、地址与例外休市日期按运营方官网整理。核对日期：{date}", { date: guide.checkedOn })}</p>
        <small>{t(guide.scheduleNotice)}</small>
      </div>
      <a className="button official-reference-link" href={guide.sourceUrl} target="_blank" rel="noreferrer">{t("查看官方原文")}<ExternalLink size={15} /></a>
    </section>
  );
}

export default function MarketGuide() {
  const { t, language } = useLanguage();
  const now = useMarketNow();
  const [area, setArea] = useState("全部地点");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<TravelMode>("driving");
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const locations = guide.locations.filter((location) => (area === "全部地点" || location.area === area) &&
    `${location.name} ${t(location.name)} ${location.address} ${location.area} ${t(location.area)}`.toLowerCase().includes(search.trim().toLowerCase()));
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(""), 3000);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = async (id: string, address: string) => {
    setError("");
    try {
      await navigator.clipboard.writeText(address);
      setCopied(id);
    } catch {
      setCopied("");
      setError("浏览器不支持复制，请直接选中卡片上的地址复制。");
    }
  };
  return <div className="market-guide">
    <MarketDayPlanner mode={mode} setMode={setMode} />
    <div className="market-quick-links">
      <a href="#market-locations"><MapPin size={15} />{t("浏览所有地点")}</a>
      <a href={guide.sourceUrl} target="_blank" rel="noreferrer">{t("官方日程")}<ExternalLink size={13} /></a>
      <a href={`mailto:${guide.organizer.email}`}><Mail size={15} />{t("联系市场运营方")}</a>
    </div>
    <div className="market-directory-heading" id="market-locations"><h2>{t("所有市场，地址与到场指引")}</h2><p>{t("3 个地点已公布 2026 年日程；Busch 的具体日期仍待公布。")}</p></div>
    <div className="guide-toolbar">
      <div className="category-tabs" role="group" aria-label={t("市场区域")}>
        {["全部地点", "Rutgers 校园", "New Brunswick 社区"].map((value) => <button key={value} className={value === area ? "selected" : ""} aria-pressed={value === area} onClick={() => setArea(value)}>{t(value)}</button>)}
      </div>
      <label className="search-field"><Search size={17} /><input aria-label={t("搜索市场地址")} placeholder={t("搜索市场或地址…")} value={search} onChange={(event) => setSearch(event.target.value)} />
        {search && <button aria-label={t("清除市场搜索")} onClick={() => setSearch("")}><X size={15} /></button>}
      </label>
    </div>
    <div className="guide-mode"><span role="status">{t("显示 {count} 个地点", { count: locations.length })}</span><span>{t("导航使用上方选择的出行方式")}</span></div>
    {error && <p className="form-error" role="alert">{t(error)}</p>}
    <div className="official-location-grid">
      {locations.map((location) => {
        const next = upcomingEvents([location], now, 1)[0];
        return <article className="panel official-location-card" key={location.id}>
          <div className="location-card-top"><span className="location-symbol"><MapPin size={23} /></span>
            <span className={`status-badge ${location.status === "confirmed" ? "location-confirmed" : "status-pending"}`}>{t(location.status === "confirmed" ? "2026 日程已公布" : "具体时间待公布")}</span>
          </div>
          <span className="eyebrow">{t(location.area)}</span><h2>{location.name}</h2>
          <div className="location-calendar-summary">
            <span>{t(next ? "最近一场" : location.status === "confirmed" ? "已公布营业季结束" : "日期与时间待公布")}</span>
            {next ? <><strong>{formatMarketDate(next.date, language)}</strong><small>{next.session.opens}–{next.session.closes} · {t("美国东部时间")}</small></> :
              <p className="helper-text">{t(location.status === "confirmed" ? "新一季安排以官方公告为准。" : "联系官方确认后再安排出行。")}</p>}
          </div>
          <div className="market-detail"><MapPin size={18} /><div><strong>{t("市场地址")}</strong><p>{location.address}</p></div></div>
          <div className="market-detail"><Clock3 size={18} /><div><strong>{t(location.schedule)}</strong><p>{t("美国东部时间")}</p></div></div>
          <p className="location-note">{t(location.note)}</p>
          <div className="navigation-buttons">
            <a className="button primary" target="_blank" rel="noreferrer" href={directionsUrl(location.address, mode)}><Navigation size={16} />{t("Google 地图")}<ExternalLink size={13} /></a>
            <a className="button secondary" target="_blank" rel="noreferrer" href={directionsUrl(location.address, mode, "apple")}>{t("Apple 地图")}<ArrowUpRight size={14} /></a>
            <button className="button secondary location-copy" aria-label={t("复制 {0} 地址", { 0: location.name })} onClick={() => void copy(location.id, location.address)}>
              {copied === location.id ? <Check size={16} /> : <Copy size={16} />}{t(copied === location.id ? "已复制" : "复制地址")}
            </button>
          </div>
          <details className="location-source-details"><summary>{t("营业季、休市日与信息来源")}</summary><p>{t(location.season)}</p>
            <a href={location.sourceUrl} target="_blank" rel="noreferrer">{t("查看此地点官方信息")}<ExternalLink size={12} /></a><p>{t("最近核对：{date}", { date: guide.checkedOn })}</p>
          </details>
        </article>;
      })}
    </div>
    <p className="sr-only" role="status">{copied ? t("地址已复制") : ""}</p>
    {!locations.length && <div className="empty-state"><Search /><h3>{t("没有找到对应地点")}</h3><p>{t("试试其他关键词或切换区域。")}</p><button className="button secondary" onClick={() => { setSearch(""); setArea("全部地点"); }}>{t("清除筛选")}</button></div>}
    <div className="market-official-footnote"><OfficialSource /></div>
    <section className="panel offerings-panel"><div><span className="eyebrow">FRESH. LOCAL. SUSTAINABLE.</span><h2>{t("在市集，还能遇见什么？")}</h2><p>{t("官网介绍的市场品类；具体摊位及当天供应以现场为准。")}</p></div>
      <div className="offering-tags">{guide.offerings.map((offering) => <span key={offering}><Leaf size={14} />{t(offering)}</span>)}</div>
    </section>
  </div>;
}

const faqs = [
  [
    "这里是 Rutgers 官方售卖平台吗？",
    "这是独立开发中的项目雏形。市场目录引用 Rutgers 官方页面；商品库存、预购与价格趋势仍是演示功能，不代表学校或商户已接入服务。",
  ],
  [
    "如何预购与取货？",
    "顾客登录后选择商品、数量与演示自提时段。提交后库存会预留，等待商户确认；到场后出示订单编号。当前预购仅供流程演示，请勿按演示订单实际出行。",
  ],
  [
    "需要在线支付吗？可以使用 Market Bucks 吗？",
    "当前系统不收取线上款项，也没有代金券核销功能。演示流程为到场付款。Market Bucks 的领取资格、可购商品和参与摊位请以官方最新说明及现场确认为准。",
  ],
  [
    "可以用 SNAP/EBT 购买吗？",
    "先确认市场和商户接受情况，再核实商品是否属于 SNAP 食品范围。网站仅提供现场付款意向和拆分预估，不办理在线 EBT 扣款；未确认的市场不会显示为接受。详细食品规则和官方查询入口见下方 SNAP/EBT 指南。",
  ],
  [
    "如何取消订单？",
    "顾客可在“我的预购”取消自己的待确认订单。商户可以取消待确认或待自提订单；取消后预留库存自动归还。已完成或已取消的订单不能再次取消。",
  ],
  [
    "价格记录能预测今天的实际价格吗？",
    "Externship 档案是历史采价，实际日期与部分净重未知，不能用于判断今日售价。另一个标签页的预测使用演示历史序列，仅用于体验，不是官方价格或售卖承诺。",
  ],
  [
    "商户如何管理每天的商品？",
    "在商户端设置售卖日期、价格、可预购数量与上架状态。只有售卖日期为当天且已上架的商品会展示给顾客；跨日不会自动补货或续售。",
  ],
  [
    "盒装、袋装商品如何比较单价？",
    "只有明确净重或件数时才可换算。历史档案保留“盒、袋、篮”等原单位；缺失重量不估算，优惠价格同时保留最低购买数量条件。",
  ],
];

export function HelpCenter() {
  const { t } = useLanguage();
  return (
    <div className="help-center simple-help">
      <section className="help-faqs" aria-labelledby="help-questions-title">
        <h2 id="help-questions-title">{t("常见问题")}</h2>
        {[faqs[1], faqs[2], faqs[4], faqs[0]].map(([question, answer]) => <details key={question} name="help-question">
          <summary>{t(question)}</summary><p>{t(answer)}</p>
        </details>)}
      </section>
      <details className="help-resource-disclosure">
        <summary><ShoppingBag size={22} /><span><strong>{t("食品援助与付款方式")}</strong><small>{t("Market Bucks、SNAP/EBT 与校内食品资源")}</small></span><ArrowUpRight size={17} /></summary>
      <section className="panel">
        <div className="panel-heading">
          <h2>
            <ShoppingBag size={20} />{t("Market Bucks 项目")}</h2>
          <a
            className="text-button"
            href={guide.marketBucks.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >{t("查看官方说明")}<ExternalLink size={14} />
          </a>
        </div>
        <p className="support-copy">{t(guide.marketBucks.summary)}</p>
        <p className="support-caution">{t(guide.marketBucks.notice)}</p>
        <p className="helper-text">{t("页面核对日期：{date}", { date: guide.marketBucks.checkedOn })}</p>
      </section>
      <div className="resource-grid">
        {guide.resources.map((r) => (
          <a
            className="panel resource-card"
            href={r.url}
            target="_blank"
            rel="noreferrer"
            key={r.name}
          >
            <h3>
              {t(r.name)}
              <ArrowUpRight size={17} />
            </h3>
            <p>{t(r.description)}</p>
          </a>
        ))}
      </div>
      <SnapPurchaseGuide />
      </details>
      <section className="panel contact-panel">
        <div>
          <h3>{t("联系 Rutgers 官方办公室")}</h3>
          <p>{guide.contact.name}</p>
        </div>
        <div>
          <a href={`tel:+1${guide.contact.phone.replaceAll("-", "")}`}>
            <Phone size={15} />
            {guide.contact.phone}
          </a>
          <a href={`mailto:${guide.contact.email}`}>
            <Mail size={15} />
            {guide.contact.email}
          </a>
        </div>
      </section>
    </div>
  );
}
