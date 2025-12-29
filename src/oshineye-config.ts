/**
 * Oshineye.dev Garten configuration
 * Returns accent colour based on time, season, and UK calendar.
 */

interface GartenConfig {
  container: string;
  seed: number;
  maxHeight: number;
  colors: {
    accent: string;
    palette: string;
  };
}

interface CalendarEvent {
  start: string;
  end: string;
  accent: string;
}

type TimeOfDay = "dawn" | "morning" | "afternoon" | "evening" | "night";
type Season = "spring" | "summer" | "autumn" | "winter";

const TIME: Record<TimeOfDay, string> = {
  dawn: "#e8a87c", // Soft coral - first light on the horizon
  morning: "#f5a623", // Warm gold - energising daylight
  afternoon: "#ff6b35", // Bold orange - peak productivity
  evening: "#d35f8d", // Dusky pink - winding down
  night: "#7c6aef", // Deep purple - contemplative darkness
};

const SEASON: Record<Season, string> = {
  spring: "#4ade80", // Fresh green - new growth
  summer: "#fbbf24", // Warm amber - long sunny days
  autumn: "#f97316", // Burnt orange - falling leaves
  winter: "#94a3b8", // Cool slate - bare branches, grey skies
};

const EVENTS: CalendarEvent[] = [
  { start: "01-01", end: "01-01", accent: "#ffd700" }, // New Year
  { start: "01-29", end: "01-29", accent: "#de2910" }, // Lunar New Year
  { start: "02-14", end: "02-14", accent: "#e91e63" }, // Valentine's Day
  { start: "02-15", end: "03-15", accent: "#ff6d00" }, // Fasnacht (Swiss Carnival)
  { start: "03-10", end: "03-10", accent: "#00247d" }, // Commonwealth Day
  { start: "03-17", end: "03-17", accent: "#009a44" }, // St Patrick's Day
  { start: "03-29", end: "04-21", accent: "#ab47bc" }, // Easter
  { start: "04-13", end: "04-28", accent: "#ff5722" }, // Sechseläuten (Zürich)
  { start: "04-23", end: "04-23", accent: "#cf142b" }, // St George's Day
  { start: "05-01", end: "05-01", accent: "#d32f2f" }, // May Day
  { start: "05-08", end: "05-08", accent: "#1565c0" }, // VE Day
  { start: "06-22", end: "06-22", accent: "#ffab00" }, // Windrush Day
  { start: "07-05", end: "07-05", accent: "#0072ce" }, // NHS Birthday
  { start: "08-01", end: "08-01", accent: "#ff0000" }, // Bundesfeier (Swiss National Day)
  { start: "08-24", end: "08-26", accent: "#ff6f00" }, // Notting Hill Carnival
  { start: "10-01", end: "10-31", accent: "#e4b61a" }, // Black History Month UK
  { start: "11-05", end: "11-05", accent: "#ff5722" }, // Bonfire Night
  { start: "11-09", end: "11-11", accent: "#b71c1c" }, // Remembrance
  { start: "12-24", end: "12-24", accent: "#2e7d32" }, // Christmas Eve
  { start: "12-25", end: "12-25", accent: "#c62828" }, // Christmas Day
  { start: "12-26", end: "12-26", accent: "#1565c0" }, // Boxing Day
  { start: "12-31", end: "12-31", accent: "#ffd700" }, // New Year's Eve
];

function getTimeOfDay(): TimeOfDay {
  const h = new Date().getHours();
  if (h >= 5 && h < 7) return "dawn";
  if (h >= 7 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

function getSeason(): Season {
  const m = new Date().getMonth();
  const seasons: Season[] = [
    "winter",
    "winter",
    "spring",
    "spring",
    "spring",
    "summer",
    "summer",
    "summer",
    "autumn",
    "autumn",
    "autumn",
    "winter",
  ];
  return seasons[m];
}

function getEvent(): CalendarEvent | undefined {
  const now = new Date();
  const mmdd = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return EVENTS.find((e) => {
    if (e.start <= e.end) return mmdd >= e.start && mmdd <= e.end;
    return mmdd >= e.start || mmdd <= e.end;
  });
}

function getAccent(): string {
  const event = getEvent();
  if (event) return event.accent;
  return TIME[getTimeOfDay()];
}

function getSeasonAccent(): string {
  return SEASON[getSeason()];
}

export function getGartenConfig(container: string): GartenConfig {
  return {
    container,
    seed: 123,
    maxHeight: 1.0,
    colors: {
      accent: getAccent(),
      palette: "monotone",
    },
  };
}

// Expose to global scope for browser usage
declare global {
  interface Window {
    OshineyeConfig: { getGartenConfig: typeof getGartenConfig };
  }
}

if (typeof window !== "undefined") {
  window.OshineyeConfig = { getGartenConfig };
}
