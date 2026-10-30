export const marketTimeZone = "America/New_York";

export interface MarketSession {
  startDate: string;
  endDate: string;
  weekday: number;
  opens: string;
  closes: string;
  closedDates: string[];
}

export interface OfficialLocation {
  id: string;
  name: string;
  area: string;
  address: string;
  sourceAddress: string;
  schedule: string;
  season: string;
  status: string;
  note: string;
  sourceUrl: string;
  sessions: MarketSession[];
}

export interface MarketEvent {
  location: OfficialLocation;
  session: MarketSession;
  date: string;
}

const clockFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: marketTimeZone,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function marketClock(now: Date) {
  const parts = Object.fromEntries(clockFormat.formatToParts(now).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function formatMarketDate(date: string, language: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", {
    timeZone: "UTC", month: "short", day: "numeric", weekday: "short", ...options,
  }).format(new Date(`${date}T12:00:00Z`));
}

export function eventsOnDate(locations: OfficialLocation[], date: string): MarketEvent[] {
  if (!validDate(date)) return [];
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return locations.flatMap((location) => location.status !== "confirmed" ? [] :
    location.sessions.filter((session) => date >= session.startDate && date <= session.endDate &&
      session.weekday === weekday && !session.closedDates.includes(date))
      .map((session) => ({ location, session, date })),
  ).sort((a, b) => a.session.opens.localeCompare(b.session.opens) || a.location.name.localeCompare(b.location.name));
}

// Never extend a recurrence past the published season or include an unpublished market.
export function upcomingEvents(locations: OfficialLocation[], now: Date, limit = 3): MarketEvent[] {
  const clock = marketClock(now);
  const lastDate = locations.flatMap((location) => location.status === "confirmed" ?
    location.sessions.map((session) => session.endDate) : []).sort().at(-1);
  const result: MarketEvent[] = [];
  if (!lastDate) return result;
  for (let date = clock.date; date <= lastDate && result.length < limit; date = addDays(date, 1)) {
    result.push(...eventsOnDate(locations, date).filter((event) => date !== clock.date || event.session.closes > clock.time));
  }
  return result.slice(0, limit);
}

export function eventStatus(event: MarketEvent, now: Date): "upcoming" | "open" | "ended" {
  const clock = marketClock(now);
  if (event.date < clock.date || (event.date === clock.date && clock.time >= event.session.closes)) return "ended";
  if (event.date === clock.date && clock.time >= event.session.opens) return "open";
  return "upcoming";
}

export type TravelMode = "driving" | "walking" | "transit";
export function directionsUrl(address: string, mode: TravelMode, provider: "google" | "apple" = "google"): string {
  const destination = encodeURIComponent(address);
  return provider === "google" ? `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=${mode}` :
    `https://maps.apple.com/?daddr=${destination}&dirflg=${mode === "walking" ? "w" : mode === "transit" ? "r" : "d"}`;
}

function calendarText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

// RFC 5545: fold by UTF-8 octets, not characters, so Chinese text remains valid.
function foldCalendarLine(line: string): string {
  const encoder = new TextEncoder();
  let result = "", width = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (width + size > 75) { result += "\r\n "; width = 1; }
    result += character; width += size;
  }
  return result;
}

export function eventCalendar(event: MarketEvent, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const date = event.date.replaceAll("-", "");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Qinghe//Market visits//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE", `TZID:${marketTimeZone}`,
    "BEGIN:DAYLIGHT", "DTSTART:20070311T020000", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0400", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "DTSTART:20071104T020000", "TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD", "END:VTIMEZONE",
    "BEGIN:VEVENT", `UID:${event.location.id}-${date}@qinghe.local`, `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${marketTimeZone}:${date}T${event.session.opens.replace(":", "")}00`,
    `DTEND;TZID=${marketTimeZone}:${date}T${event.session.closes.replace(":", "")}00`,
    `SUMMARY:${calendarText(event.location.name)}`, `LOCATION:${calendarText(event.location.address)}`,
    `DESCRIPTION:${calendarText(`Rutgers Community Farmers Market\n${event.location.sourceUrl}\nCheck official updates before visiting.`)}`,
    `URL:${event.location.sourceUrl}`, "END:VEVENT", "END:VCALENDAR", "",
  ].map(foldCalendarLine).join("\r\n");
}
