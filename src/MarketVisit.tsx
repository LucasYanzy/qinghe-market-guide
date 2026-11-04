import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Clock3, ExternalLink, MapPin, Navigation } from "lucide-react";
import guide from "../references/rutgers-market-guide.json";
import { useLanguage } from "./i18n";
import { PageLink, type Page } from "./navigation";
import { addDays, directionsUrl, eventCalendar, eventStatus, eventsOnDate, formatMarketDate, marketClock, upcomingEvents, validDate, type MarketEvent, type TravelMode } from "./marketSchedule";
import "./market-visit.css";
import { SessionDirectory } from './SessionDirectory';
import { useWorkflow } from './workflowSupport';

type SessionNotice={date:string;official_location_id:string;cancelled:number;notice:string};
function useSessionNotices(from:string,to=from) {
  const [revision,setRevision]=useState(0);
  useEffect(()=>{const reload=()=>setRevision(n=>n+1);window.addEventListener('focus',reload);return()=>window.removeEventListener('focus',reload);},[]);
  return useWorkflow<SessionNotice[]>(`/session-directory?from=${from}&to=${to}`,revision);
}

export function useMarketNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = window.setInterval(update, 30_000);
    const visible = () => { if (!document.hidden) update(); };
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  return now;
}

function CalendarLink({ event }: { event: MarketEvent }) {
  const { t } = useLanguage();
  return <a className="button secondary" download={`market-${event.location.id}-${event.date}.ics`}
    href={`data:text/calendar;charset=utf-8,${encodeURIComponent(eventCalendar(event))}`}>
    <CalendarPlus size={16} />{t("加入日历")}
  </a>;
}

export function VisitActions({ event, mode = "driving" }: { event: MarketEvent; mode?: TravelMode }) {
  const { t } = useLanguage();
  return <div className="visit-actions">
    <a className="button primary" href={directionsUrl(event.location.address, mode)} target="_blank" rel="noreferrer">
      <Navigation size={16} />{t("导航到这里")}<ExternalLink size={13} />
    </a>
    <CalendarLink event={event} />
  </div>;
}

export function EventBadge({ event, now, cancelled=false }: { event: MarketEvent; now: Date; cancelled?:boolean }) {
  const { t } = useLanguage();
  const status = eventStatus(event, now);
  return <span className={`visit-badge visit-badge-${status}`}>
    <span aria-hidden="true" />{t(cancelled ? "场次已取消" : status === "open" ? "按日程 · 营业时段内" : status === "ended" ? "本场已结束" : "官方已公布")}
  </span>;
}

export function NextMarketHero({ navigate }: { navigate: (page: Page) => void }) {
  const { t, language } = useLanguage();
  const now = useMarketNow();
  const clock = marketClock(now);
  const notices=useSessionNotices(clock.date,addDays(clock.date,365));
  const candidates=upcomingEvents(guide.locations,now,12);
  const cancelled=candidates.filter(event=>notices.data?.some(s=>s.cancelled&&s.date===event.date&&s.official_location_id===event.location.id));
  const events=candidates.filter(event=>!cancelled.includes(event)).slice(0,4);
  const next = events[0];
  return <section className="next-market-hero" aria-label={t("最近开市安排")}>
    <div className="next-market-main">
      <span className="eyebrow">YOUR NEXT MARKET VISIT</span>
      {cancelled.map(event=><div className="ops-advice" role="status" key={`${event.date}:${event.location.id}`}><strong>{formatMarketDate(event.date,language)} · {t(event.location.name)} · {t("场次已取消")}</strong><p>{notices.data?.find(s=>s.cancelled&&s.date===event.date&&s.official_location_id===event.location.id)?.notice}</p></div>)}
      {notices.error&&<p role="alert">{t(notices.error)}</p>}
      {next ? <>
        <div className="next-market-label"><CalendarDays size={18} />
          {t(eventStatus(next, now) === "open" ? "今天可以逛这里" : next.date === clock.date ? "今天这场，记好时间" : "下一场市集")}
          <EventBadge event={next} now={now} />
        </div>
        <h2>{formatMarketDate(next.date, language)}</h2>
        <div className="next-market-hours">{next.session.opens}<span>–</span>{next.session.closes}<small>{t("美国东部时间")}</small></div>
        <h3>{t(next.location.name)}</h3>
        <p className="visit-address"><MapPin size={16} /><span>{next.location.address}</span></p>
        <VisitActions event={next} />
        <SessionDirectory date={next.date} officialLocationId={next.location.id} compact />
      </> : <>
        <h2>{t("等待新一季的相见")}</h2>
        <p>{t("已公布日程中暂无后续场次。请查看官方最新公告，新一季日期公布后再安排出行。")}</p>
        <a className="button primary" href={guide.sourceUrl} target="_blank" rel="noreferrer">{t("查看官方日程")}<ExternalLink size={15} /></a>
      </>}
      <p className="visit-source">{t("按官方日程整理，临时变更请查看公告。")}
        <a href={guide.sourceUrl} target="_blank" rel="noreferrer">{t("官方日程")}<ExternalLink size={11} /></a>
      </p>
    </div>
    <aside className="next-market-aside">
      <div className="next-market-aside-title"><span>{t("接下来，还可以去")}</span><span>2026</span></div>
      {events.slice(1).map((event) => <a className="next-market-preview" key={`${event.location.id}-${event.date}`}
        href={`/markets?date=${event.date}`}>
        <div className="visit-mini-date"><strong>{new Date(`${event.date}T12:00:00Z`).getUTCDate()}</strong>
          <span>{formatMarketDate(event.date, language, { weekday: "short", month: undefined, day: undefined })}</span></div>
        <div><b>{t(event.location.name)}</b><span>{formatMarketDate(event.date, language, { weekday: undefined })} · {event.session.opens}–{event.session.closes}</span></div>
        <ChevronRight size={17} />
      </a>)}
      {events.length < 2 && <p className="visit-last-season">{t("后续场次以官方公布为准。")}</p>}
      <PageLink className="visit-all-link" page="markets" navigate={navigate}>{t("查看开市日历与所有地点")}<ArrowRight size={17} /></PageLink>
      <div className="visit-season-note"><CalendarDays size={17} /><span>{t("营业季、例外休市、完整地址，一起查清楚。")}</span></div>
    </aside>
  </section>;
}

function queryDate(): string | null {
  const value = new URLSearchParams(window.location.search).get("date");
  return value && validDate(value) ? value : null;
}

export function MarketDayPlanner({ mode, setMode }: { mode: TravelMode; setMode: (mode: TravelMode) => void }) {
  const { t, language } = useLanguage();
  const now = useMarketNow();
  const today = marketClock(now).date;
  const [selection, setSelection] = useState(queryDate);
  const date = selection ?? today;
  const events = eventsOnDate(guide.locations, date);
  const notices=useSessionNotices(date);
  const isCancelled=(event:MarketEvent)=>!!notices.data?.some(s=>s.cancelled&&s.date===event.date&&s.official_location_id===event.location.id);
  const weekStart = addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
  const next = upcomingEvents(guide.locations, now, 1)[0];
  const selectDate = (value: string) => {
    if (!validDate(value)) return;
    setSelection(value);
    const url = new URL(window.location.href);
    url.searchParams.set("date", value);
    window.history.replaceState(window.history.state, "", url);
  };
  useEffect(() => {
    const restore = () => setSelection(queryDate());
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  return <section className="market-day-planner" aria-label={t("开市日历")}>
    <div className="visit-planner-heading">
      <div><span className="eyebrow">WHEN & WHERE</span><h2>{t("哪天去，先看这里。")}</h2><p>{t("选择日期，查看当天的市场、时间和地址。所有时间均为美国东部时间。")}</p></div>
      <div className="visit-date-controls">
        <button className="button secondary" onClick={() => selectDate(today)}>{t("今天")}</button>
        <label className="visit-date-input"><CalendarDays size={17} /><input aria-label={t("选择出行日期")} type="date" value={date} onChange={(event) => selectDate(event.target.value)} /></label>
      </div>
    </div>
    <div className="visit-week-bar">
      <button className="icon-button" aria-label={t("上一周")} onClick={() => selectDate(addDays(date, -7))}><ChevronLeft size={19} /></button>
      <div className="visit-week" role="group" aria-label={t("按日期查看市场")}>
        {Array.from({ length: 7 }, (_, index) => {
          const day = addDays(weekStart, index);
          const count = eventsOnDate(guide.locations, day).length;
          return <button key={day} aria-pressed={date === day} aria-current={day === today ? "date" : undefined}
            aria-label={t(count === 1 ? "{date}，1 场市场" : "{date}，{count} 场市场", { date: formatMarketDate(day, language), count })} onClick={() => selectDate(day)}>
            <span>{formatMarketDate(day, language, { weekday: "short", month: undefined, day: undefined })}</span>
            <strong>{formatMarketDate(day, language, { day: "numeric", month: "numeric", weekday: undefined })}</strong>
            <i className={count ? "has-market" : ""} aria-hidden="true" />
          </button>;
        })}
      </div>
      <button className="icon-button" aria-label={t("下一周")} onClick={() => selectDate(addDays(date, 7))}><ChevronRight size={19} /></button>
    </div>
    <div className="visit-results-heading">
      <h3 aria-live="polite">{formatMarketDate(date, language)}<span>{t(events.length === 1 ? "1 场市场" : "{count} 场市场", { count: events.length })}</span></h3>
      <label>{t("出行方式")}<select aria-label={t("导航出行方式")} value={mode} onChange={(event) => setMode(event.target.value as TravelMode)}>
        <option value="driving">{t("驾车")}</option><option value="walking">{t("步行")}</option><option value="transit">{t("公共交通")}</option>
      </select></label>
    </div>
    <div className="visit-day-results" aria-live="polite" aria-atomic="true">
      {events.map((event) => <article className="visit-event" key={event.location.id}>
        <div className="visit-event-time"><Clock3 size={19} /><strong>{event.session.opens}–{event.session.closes}</strong><EventBadge event={event} now={now} cancelled={isCancelled(event)} /></div>
        <div className="visit-event-place"><h4>{t(event.location.name)}</h4><p className="visit-address"><MapPin size={15} /><span>{event.location.address}</span></p></div>
        {!isCancelled(event)&&<VisitActions event={event} mode={mode} />}
        <SessionDirectory date={date} officialLocationId={event.location.id} compact />
      </article>)}
      {!events.length && <div className="visit-no-events"><CalendarDays size={28} /><div><h4>{t("当天没有已公布的场次")}</h4><p>{t("可以换个日期，或查看最近一场。未公布的安排不计入日历。")}</p></div>
        {next ? <button className="button primary" onClick={() => selectDate(next.date)}>{t("查看最近一场")}<ArrowRight size={16} /></button> :
          <a className="button secondary" href={guide.sourceUrl} target="_blank" rel="noreferrer">{t("查看官方日程")}<ExternalLink size={14} /></a>}
      </div>}
    </div>
    <p className="visit-planner-note">{t("已排除官方休市日；营业季结束后不再自动延续。临时天气调整请查看")}{" "}<a href={guide.organizer.updatesUrl} target="_blank" rel="noreferrer">{t("官方公告")}<ExternalLink size={11} /></a>{language === "en" ? "." : "。"}</p>
  </section>;
}
