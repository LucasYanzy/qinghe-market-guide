import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addDays, directionsUrl, eventCalendar, eventStatus, eventsOnDate, marketClock, upcomingEvents, validDate } from "../src/marketSchedule.ts";

const guide = JSON.parse(readFileSync(new URL("../references/rutgers-market-guide.json", import.meta.url), "utf8"));
const locations = guide.locations;
const idsOn = (date) => eventsOnDate(locations, date).map((event) => event.location.id);

test("published seasons include their last day, exclude closures, and never extend into a new year", () => {
  assert.deepEqual(idsOn("2026-08-27"), ["college-ave"]);
  assert.deepEqual(idsOn("2026-10-01"), []);
  assert.deepEqual(idsOn("2026-11-19"), ["college-ave"]);
  assert.deepEqual(idsOn("2026-11-26"), []);
  assert.deepEqual(idsOn("2026-05-22"), ["cooks"]);
  for (const date of ["2026-06-19", "2026-07-03", "2026-07-04"]) assert.deepEqual(idsOn(date), []);
  assert.deepEqual(idsOn("2026-11-20"), ["cooks"]);
  assert.deepEqual(idsOn("2026-11-21"), ["jones-ave"]);
  assert.deepEqual(idsOn("2027-05-21"), []);
  assert.deepEqual(upcomingEvents(locations, new Date("2026-11-22T00:00:00-05:00")), []);
});

test("Jones Avenue Tuesday and Saturday seasons have independent end dates", () => {
  assert.deepEqual(idsOn("2026-10-27"), ["jones-ave"]);
  assert.deepEqual(idsOn("2026-11-03"), []);
  assert.deepEqual(idsOn("2026-10-31"), ["jones-ave"]);
  const next = upcomingEvents(locations.filter((location) => location.id === "jones-ave"), new Date("2026-10-29T10:00:00-04:00"), 5);
  assert.deepEqual(next.map((event) => event.date), ["2026-10-31", "2026-11-07", "2026-11-14", "2026-11-21"]);
});

test("upcoming markets retain an open market and advance exactly at closing time", () => {
  const before = upcomingEvents(locations, new Date("2026-10-29T10:59:00-04:00"));
  assert.equal(before[0].date, "2026-10-29");
  assert.equal(eventStatus(before[0], new Date("2026-10-29T10:59:00-04:00")), "upcoming");
  assert.equal(eventStatus(before[0], new Date("2026-10-29T11:00:00-04:00")), "open");
  assert.equal(upcomingEvents(locations, new Date("2026-10-29T15:59:59-04:00"))[0].location.id, "college-ave");
  assert.equal(eventStatus(before[0], new Date("2026-10-29T16:00:00-04:00")), "ended");
  assert.equal(upcomingEvents(locations, new Date("2026-10-29T16:00:00-04:00"))[0].location.id, "cooks");
});

test("market clock follows New York across UTC midnight and daylight saving changes", () => {
  assert.deepEqual(marketClock(new Date("2026-10-30T01:00:00Z")), { date: "2026-10-29", time: "21:00" });
  assert.deepEqual(marketClock(new Date("2026-11-01T05:30:00Z")), { date: "2026-11-01", time: "01:30" });
  assert.deepEqual(marketClock(new Date("2026-11-01T06:30:00Z")), { date: "2026-11-01", time: "01:30" });
  assert.deepEqual(marketClock(new Date("2026-11-01T05:00:00Z")), { date: "2026-11-01", time: "01:00" });
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-11-01", -1), "2026-10-31");
});

test("unpublished Busch information and malformed dates never create a calendar event", () => {
  const busch = locations.find((location) => location.id === "busch");
  assert.deepEqual(upcomingEvents([busch], new Date("2026-01-01T12:00:00Z")), []);
  for (const invalid of ["2026-02-30", "2026-13-01", "invalid", "2026-1-1", ""]) {
    assert.equal(validDate(invalid), false);
    assert.deepEqual(eventsOnDate(locations, invalid), []);
  }
  assert.equal(validDate("2028-02-29"), true);
});

test("calendar exports one dated visit with a real timezone, source, address, and UTF-8 folding", () => {
  const event = eventsOnDate(locations, "2026-11-05")[0];
  const calendar = eventCalendar({ ...event, location: { ...event.location, name: "中文市集，带上购物袋。".repeat(15) } }, new Date("2026-10-29T12:00:00Z"));
  const unfolded = calendar.replace(/\r\n /g, "");
  assert.match(unfolded, /DTSTART;TZID=America\/New_York:20261105T110000/);
  assert.match(unfolded, /DTEND;TZID=America\/New_York:20261105T160000/);
  assert.match(unfolded, /BEGIN:VTIMEZONE/);
  assert.match(unfolded, /TZOFFSETTO:-0500/);
  assert.match(unfolded, /LOCATION:126 College Avenue\\, New Brunswick\\, NJ 08901/);
  assert.ok(unfolded.includes(guide.sourceUrl));
  assert.equal((calendar.match(/BEGIN:VEVENT/g) ?? []).length, 1);
  assert.equal(calendar.includes("\uFFFD"), false);
  for (const line of calendar.split("\r\n")) assert.ok(Buffer.byteLength(line, "utf8") <= 75);
});

test("navigation uses the full official address and each provider's selected travel mode", () => {
  const address = "178 Jones Avenue, New Brunswick, NJ";
  for (const [mode, apple] of [["walking", "w"], ["transit", "r"], ["driving", "d"]]) {
    const googleUrl = new URL(directionsUrl(address, mode));
    assert.equal(googleUrl.searchParams.get("destination"), address);
    assert.equal(googleUrl.searchParams.get("travelmode"), mode);
    const appleUrl = new URL(directionsUrl(address, mode, "apple"));
    assert.equal(appleUrl.searchParams.get("daddr"), address);
    assert.equal(appleUrl.searchParams.get("dirflg"), apple);
    assert.equal(googleUrl.searchParams.has("origin"), false);
  }
});
