import { afterEach, describe, expect, test } from "bun:test";
import { setSystemTime } from "bun:test";
import { getGartenConfig } from "../src/oshineye-config";

// Local-time dates: getGartenConfig reads getHours()/getMonth()/getDate().
function accentAt(month: number, day: number, hour = 10): string {
  setSystemTime(new Date(2026, month - 1, day, hour, 0, 0));
  return getGartenConfig("#garden").colors.accent;
}

afterEach(() => setSystemTime());

describe("garden accent", () => {
  // Expected colours are the ones the EVENTS table in src/oshineye-config.ts
  // assigns to each named day. A one-day event must win on its own day even
  // when it falls inside a longer season such as Fasnacht or Sechseläuten.
  test.each([
    ["Commonwealth Day inside Fasnacht", 3, 10, "#00247d"],
    ["St George's Day inside Sechseläuten", 4, 23, "#cf142b"],
    ["Valentine's Day", 2, 14, "#e91e63"],
    ["Christmas Day", 12, 25, "#c62828"],
  ])("%s", (_name, month, day, accent) => {
    expect(accentAt(month, day)).toBe(accent);
  });

  test("a multi-day event colours every day of its range", () => {
    // Fasnacht runs 02-15..03-15.
    expect(accentAt(2, 15)).toBe("#ff6d00");
    expect(accentAt(3, 15)).toBe("#ff6d00");
    expect(accentAt(3, 16)).not.toBe("#ff6d00");
  });

  // On a day with no event, the hour picks the accent. Boundaries come from
  // getTimeOfDay: dawn 5-7, morning 7-12, afternoon 12-17, evening 17-21.
  test.each([
    [4, "#7c6aef"], // night
    [5, "#e8a87c"], // dawn
    [7, "#f5a623"], // morning
    [11, "#f5a623"],
    [12, "#ff6b35"], // afternoon
    [17, "#d35f8d"], // evening
    [21, "#7c6aef"], // night
  ])("no event: hour %i uses the time-of-day accent", (hour, accent) => {
    expect(accentAt(6, 10, hour)).toBe(accent);
  });

  test("an event outranks the time of day", () => {
    expect(accentAt(12, 25, 23)).toBe("#c62828");
  });
});
