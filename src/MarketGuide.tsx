import { useLanguage } from "./i18n";
import { matchesSearch } from "./translations/translate";
import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  Clock3,
  Copy,
  ExternalLink,
  Leaf,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Search,
  ShoppingBag,
  Store,
} from "lucide-react";
import guide from "../references/rutgers-market-guide.json";

export function OfficialSource() {
  const { t } = useLanguage();
  return (
    <section className="official-market-reference">
      <div className="official-reference-icon">
        <Store size={25} />
      </div>
      <div className="official-reference-copy">
        <span className="eyebrow">{t("RUTGERS · OFFICIAL INFORMATION")}</span>
        <h2>{t(guide.name)}</h2>
        <p>{t("地址与市场介绍已按 Rutgers 官方页面整理。核对日期：{date}。", { date: guide.checkedOn })}
        </p>
        <small>{t(guide.scheduleNotice)}</small>
      </div>
      <a
        className="button official-reference-link"
        href={guide.sourceUrl}
        target="_blank"
        rel="noreferrer"
      >{t("查看官方原文")}<ExternalLink size={15} />
      </a>
    </section>
  );
}

export default function MarketGuide() {
  const { t } = useLanguage();
  const [area, setArea] = useState("全部地点");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("driving");
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const locations = guide.locations.filter(
    (l) =>
      (area === "全部地点" || l.area === area) &&
      matchesSearch(search, l.name, l.address, l.area),
  );
  const copy = async (id: string, address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(id);
      setError("");
    } catch {
      setError("浏览器不支持复制，请直接选中卡片上的地址复制。");
    }
  };
  return (
    <div className="market-guide">
      <OfficialSource />
      <div className="guide-toolbar">
        <div className="category-tabs" aria-label={t("市场区域")}>
          {["全部地点", "Rutgers 校园", "New Brunswick 社区"].map((a) => (
            <button
              key={a}
              className={a === area ? "selected" : ""}
              onClick={() => setArea(a)}
            >
              {t(a)}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label={t("搜索市场地址")}
            placeholder={t("搜索市场或地址…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="guide-mode">
        <span>{t("显示 {count} 个地点 · 导航出行方式", { count: locations.length })}</span>
        <select
          aria-label={t("导航出行方式")}
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="driving">{t("驾车")}</option>
          <option value="walking">{t("步行")}</option>
          <option value="transit">{t("公共交通")}</option>
        </select>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}
      <div className="official-location-grid">
        {locations.map((l) => (
          <article className="panel official-location-card" key={l.id}>
            <div className="location-card-top">
              <span className="location-symbol">
                <MapPin size={23} />
              </span>
              <span
                className={`status-badge ${l.status === "historical" ? "status-pending" : "status-cancelled"}`}
              >
                {t(l.status === "historical"
                  ? "历史日程 · 待确认今年安排"
                  : "具体时间待公布")}
              </span>
            </div>
            <span className="eyebrow">{t(l.area)}</span>
            <h2>{t(l.name)}</h2>
            <div className="market-detail">
              <MapPin size={18} />
              <div>
                <strong>{t("官网地址")}</strong>
                <p>{t(l.address)}</p>
                <small className="helper-text">{t("原文：")}{t(l.sourceAddress)}</small>
              </div>
            </div>
            <div className="market-detail">
              <Clock3 size={18} />
              <div>
                <strong>{t(l.schedule)}</strong>
                <p>{t(l.season)}{t(" · 美国东部时间")}</p>
              </div>
            </div>
            <p className="location-note">{t(l.note)}</p>
            <div className="navigation-buttons">
              <a
                className="button primary"
                target="_blank"
                rel="noreferrer"
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(l.address)}&travelmode=${mode}`}
              >
                <Navigation size={16} />{t("Google 地图")}<ExternalLink size={13} />
              </a>
              <a
                className="button secondary"
                target="_blank"
                rel="noreferrer"
                href={`https://maps.apple.com/?daddr=${encodeURIComponent(l.address)}&dirflg=${mode === "walking" ? "w" : mode === "transit" ? "r" : "d"}`}
              >{t("Apple 地图")}<ArrowUpRight size={14} />
              </a>
              <button
                className="icon-button"
                aria-label={t("复制 {0} 地址", {0: t(l.name)})}
                onClick={() => void copy(l.id, l.address)}
              >
                {copied === l.id ? <Check size={17} /> : <Copy size={17} />}
              </button>
            </div>
            {copied === l.id && (
              <p className="helper-text" role="status">{t("地址已复制")}</p>
            )}
          </article>
        ))}
      </div>
      {!locations.length && (
        <div className="empty-state">
          <Search />
          <h3>{t("没有找到对应地点")}</h3>
          <p>{t("试试其他关键词或切换区域。")}</p>
          <button
            className="button secondary"
            onClick={() => {
              setSearch("");
              setArea("全部地点");
            }}
          >{t("清除筛选")}</button>
        </div>
      )}
      <section className="panel offerings-panel">
        <div>
          <span className="eyebrow">{t("FRESH. LOCAL. SUSTAINABLE.")}</span>
          <h2>{t("在市集，还能遇见什么？")}</h2>
          <p>{t("官网介绍的市场品类；具体摊位及当天供应以现场为准。")}</p>
        </div>
        <div className="offering-tags">
          {guide.offerings.map((o) => (
            <span key={o}>
              <Leaf size={14} />
              {t(o)}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
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
    <div className="help-center">
      <section className="panel support-hero">
        <span className="eyebrow">
          {t("STUDENT BASIC NEEDS · COMMUNITY RESOURCES")}
        </span>
        <h2>{t("让新鲜更容易获得。")}</h2>
        <p>{t("了解食品援助资源，也了解这份预购如何完成。")}</p>
      </section>
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
        <p className="helper-text">{t("页面核对日期：{date}；相关页面的市场日程仍列示 2025 年。", { date: guide.marketBucks.checkedOn })}</p>
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
      <section className="panel faq-panel">
        <div className="panel-heading">
          <h2>{t("常见问题与使用指引")}</h2>
        </div>
        {faqs.map(([q, a]) => (
          <details key={q}>
            <summary>{t(q)}</summary>
            <p>{t(a)}</p>
          </details>
        ))}
      </section>
      <section className="panel contact-panel">
        <div>
          <h3>{t("联系 Rutgers 官方办公室")}</h3>
          <p>{t(guide.contact.name)}</p>
          <p>{guide.contact.address}{t("（办公室地址，非市集地点）")}</p>
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
