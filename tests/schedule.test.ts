import { afterEach, describe, expect, it } from "vitest";
import { currentWeek, localDay, nextSlot } from "@/lib/schedule";

// Test setup uses TIMEZONE=Asia/Kolkata (UTC+5:30, no daylight saving) and MAX_POSTS_PER_WEEK=4.
// Slots come from config/schedule.ts: Tue/Wed/Thu at 09:00 or 12:30, at least 20 hours apart.
const iso = (s: string) => new Date(s);
const SAT = iso("2026-09-19T10:00:00Z"); // Saturday 15:30 IST
const TUE_0900 = iso("2026-09-22T03:30:00Z"); // Tuesday 09:00 IST
const WED_0900 = iso("2026-09-23T03:30:00Z");

const original = { tz: process.env.TIMEZONE, cap: process.env.MAX_POSTS_PER_WEEK };
afterEach(() => {
  process.env.TIMEZONE = original.tz;
  process.env.MAX_POSTS_PER_WEEK = original.cap;
});

describe("localDay", () => {
  it("reads the weekday, date and time in the configured timezone", () => {
    // Monday 20:00 UTC is already Tuesday 01:30 in India.
    expect(localDay(iso("2026-09-21T20:00:00Z"))).toEqual({ dow: 2, ymd: "2026-09-22", hm: "01:30" });
  });

  it("follows TIMEZONE", () => {
    process.env.TIMEZONE = "UTC";
    expect(localDay(iso("2026-09-21T20:00:00Z"))).toEqual({ dow: 1, ymd: "2026-09-21", hm: "20:00" });
  });
});

describe("currentWeek", () => {
  it("runs Monday to Sunday around the given day", () => {
    const week = currentWeek(SAT);
    expect(week.map((d) => d.ymd)).toEqual(["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"]);
    expect(week.map((d) => d.dow)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("can look one week ahead", () => {
    expect(currentWeek(SAT, 1)[0].ymd).toBe("2026-09-21");
  });

  it("starts the new week at local midnight, not UTC midnight", () => {
    // Sunday 19:00 UTC is Monday 00:30 in India, so it belongs to the next week.
    expect(currentWeek(iso("2026-09-20T19:00:00Z"))[0].ymd).toBe("2026-09-21");
    expect(currentWeek(iso("2026-09-20T12:00:00Z"))[0].ymd).toBe("2026-09-14");
  });
});

describe("nextSlot", () => {
  it("picks the first posting slot: Tuesday 09:00 when asked on a Saturday", () => {
    expect(nextSlot([], SAT)).toEqual(TUE_0900);
  });

  it("takes the later slot the same day if it is free", () => {
    expect(nextSlot([], iso("2026-09-22T04:00:00Z"))).toEqual(iso("2026-09-22T07:00:00Z")); // Tue 12:30 IST
  });

  it("keeps posts at least 20 hours apart, so a taken 09:00 pushes the next post to the next day", () => {
    expect(nextSlot([TUE_0900], SAT)).toEqual(WED_0900);
  });

  it("moves to next week once the weekly cap is reached", () => {
    process.env.MAX_POSTS_PER_WEEK = "2";
    expect(nextSlot([TUE_0900, WED_0900], SAT)).toEqual(iso("2026-09-29T03:30:00Z")); // Tuesday the 29th
  });

  it("counts posts already published this week against the cap", () => {
    process.env.MAX_POSTS_PER_WEEK = "1";
    expect(nextSlot([iso("2026-09-16T05:00:00Z")], iso("2026-09-17T05:00:00Z"))).toEqual(iso("2026-09-22T03:30:00Z"));
  });

  it("uses the configured timezone", () => {
    process.env.TIMEZONE = "UTC";
    expect(nextSlot([], SAT)).toEqual(iso("2026-09-22T09:00:00Z"));
  });

  it("never returns a time in the past or within ten minutes", () => {
    const slot = nextSlot([], iso("2026-09-22T03:25:00Z")); // five minutes before Tuesday 09:00 IST
    expect(slot.getTime()).toBeGreaterThan(iso("2026-09-22T03:35:00Z").getTime());
  });
});
