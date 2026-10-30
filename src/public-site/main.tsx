import React, { lazy } from "react";
import ReactDOM from "react-dom/client";
import { ArrowRight, BookOpen, CalendarDays, CircleHelp, ExternalLink, Eye, Leaf, MapPin } from "lucide-react";
import { LanguageProvider, LanguageSwitcher, useLanguage } from "../i18n";
import { PageLink, useNavigation, type Page } from "../navigation";
import { NextMarketHero } from "../MarketVisit";
import { PageBoundary } from "../PageBoundary";
import { Produce } from "../Produce";
import guide from "../../references/rutgers-market-guide.json";
import "../styles.css";
import "../website.css";
import "../simple-visitor.css";
import "./public-site.css";

const Demo = lazy(() => import("./Demo"));
const MarketGuide = lazy(() => import("../MarketGuide"));
const HelpCenter = lazy(() => import("../MarketGuide").then((module) => ({ default: module.HelpCenter })));
const ReferencePrices = lazy(() => import("../ReferencePrices"));
const destinations = [
  { page: "demo", zh: "Demo 展示", en: "Project demo", icon: Eye },
  { page: "markets", zh: "市场与导航", en: "Markets & directions", icon: MapPin },
  { page: "prices", zh: "价格档案", en: "Price archive", icon: BookOpen },
  { page: "help", zh: "帮助与资源", en: "Help & resources", icon: CircleHelp },
] as const;

function PublicSite() {
  const { language } = useLanguage();
  const { page, navigate } = useNavigation();
  const en = language === "en";
  const copy = (zh: string, english: string) => en ? english : zh;
  const heading = page === "demo" ? copy("一座市集，三种视角。", "One market. Three perspectives.") : page === "markets" ? copy("哪天去，去哪逛。", "Plan your next market visit.")
    : page === "prices" ? copy("每一份价格，都有来处。", "A little context for every price.")
    : page === "help" ? copy("来逛市集，也找到支持。", "Fresh food. A little more support.")
    : page === "about" ? copy("让新鲜，发生在身边。", "Freshness, a little closer to home.")
    : copy("下一场新鲜，离你不远。", "Your next fresh find is close by.");
  return <div className="public-site">
    <a href="#main" className="public-skip">{copy("跳转到内容", "Skip to content")}</a>
    <header className="visitor-header">
      <PageLink page="discover" navigate={navigate} className="visitor-brand">
        <span><Leaf size={23} /></span><strong>{copy("青禾", "Qinghe")}<small>QINGHE</small></strong>
      </PageLink>
      <nav className="public-nav" aria-label={copy("主导航", "Main navigation")}>
        {destinations.map((item) => <PageLink key={item.page} page={item.page} navigate={navigate} active={page === item.page}><item.icon size={17} />{en ? item.en : item.zh}</PageLink>)}
      </nav>
      <LanguageSwitcher />
    </header>
    <main id="main" className="public-main" tabIndex={-1}>
      <div className="public-heading"><span className="eyebrow">RUTGERS · COMMUNITY FARMERS MARKET</span><h1>{heading}</h1>
        <p>{copy("开市时间、地点和到场指引，一起查清楚。", "Dates, locations and directions, all in one place.")}</p>
      </div>
      <PageBoundary>
        {page === "discover" ? <>
          <NextMarketHero navigate={navigate} liveSessions={false} />
          <section className="public-explore" aria-label={copy("探索市集", "Explore the market")}>
            <article className="public-feature"><div><span className="eyebrow">FRESH AIR. LOCAL FINDS.</span><h2>{copy("从校园出发，\n遇见当季的好。", "A short trip.\nA seasonal discovery.")}</h2><p>{copy("发现 Rutgers 和 New Brunswick 周边的社区市场。出门前先核对日期，再把路交给导航。", "Explore community markets around Rutgers and New Brunswick. Check the date, then find your way there.")}</p><PageLink page="markets" navigate={navigate} className="button primary">{copy("查看市场与日历", "Explore markets & dates")}<ArrowRight size={16} /></PageLink></div><div className="public-produce" aria-hidden="true"><Produce kind="tomato" /><Produce kind="carrot" /><Produce kind="broccoli" /></div></article>
            <div className="public-feature-links">{destinations.map((item) => <PageLink key={item.page} page={item.page} navigate={navigate}><item.icon size={22} /><strong>{en ? item.en : item.zh}</strong><ArrowRight size={17} /></PageLink>)}</div>
          </section>
          <section className="public-note"><CalendarDays size={21} /><div><strong>{copy("出行前，再看一眼官方公告。", "Check official updates before you go.")}</strong><p>{copy(`当前日程按市场运营方资料整理，核对于 ${guide.checkedOn}。天气或临时安排可能改变营业情况。`, `Schedules were checked against the market organizer’s information on ${guide.checkedOn}. Weather and other changes may affect opening hours.`)}</p><a href={guide.sourceUrl} target="_blank" rel="noreferrer">{copy("查看官方日程", "View the official schedule")}<ExternalLink size={13} /></a></div></section>
        </> : page === "demo" ? <Demo /> : page === "markets" ? <MarketGuide liveSessions={false} /> : page === "prices" ? <ReferencePrices /> : page === "help" ? <HelpCenter publicOnly /> : page === "about" ? <section className="panel public-about"><Leaf size={28} /><h2>{copy("关于青禾", "About Qinghe")}</h2><p>{copy("青禾是一个独立的社区市集项目，帮助同学与邻里查询 Rutgers 周边市场的开市时间、完整地址和导航，也保留带有来源说明的历史采价资料。", "Qinghe is an independent community market project helping students and neighbors find Rutgers-area market dates, addresses and directions, with a sourced historical price archive.")}</p><p>{copy("本网站并非 Rutgers 官方网站。当前开放市场导览与信息查询；线上预购服务尚未开放，本站不接受真实订单或付款。", "This is not an official Rutgers website. Market information and visit planning are available here; online preorders are not open, and this site does not accept real orders or payments.")}</p><a href={guide.sourceUrl} className="button primary" target="_blank" rel="noreferrer">{copy("访问市场运营方官网", "Visit the market organizer")}<ExternalLink size={15} /></a></section>
          : <section className="panel public-about"><MapPin size={30} /><h2>{copy("这条小路还没通往市集", "This path doesn’t lead to the market yet")}</h2><p>{copy("线上预购和管理服务尚未在此网站开放。先查看市场时间与地点，安排下一次到访。", "Online ordering and management services are not open on this site. Explore dates and locations to plan your visit.")}</p><PageLink page="markets" navigate={navigate} className="button primary">{copy("查看市场与导航", "See markets & directions")}<ArrowRight size={16} /></PageLink></section>}
      </PageBoundary>
    </main>
    <footer className="visitor-footer public-footer"><span>{copy("青禾 QINGHE", "Qinghe")}<small>{copy("独立社区市集项目 · 非 Rutgers 官方网站", "Independent community project · Not an official Rutgers website")}</small></span><nav aria-label={copy("页脚导航", "Footer navigation")}><PageLink page="about" navigate={navigate}>{copy("关于青禾", "About")}</PageLink><a href="https://github.com/LucasYanzy/qinghe-market-guide" target="_blank" rel="noreferrer">GitHub<ExternalLink size={12} /></a></nav></footer>
    <nav className="public-mobile-nav" aria-label={copy("快捷导航", "Quick navigation")}>{destinations.map((item) => <PageLink key={item.page} page={item.page as Page} navigate={navigate} active={page === item.page}><item.icon size={20} /><span>{en ? item.en : item.zh}</span></PageLink>)}</nav>
  </div>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><LanguageProvider><PublicSite /></LanguageProvider></React.StrictMode>);
