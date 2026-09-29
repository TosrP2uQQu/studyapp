// day.js — study-day boundaries. The study day rolls over at
// 04:00 local (not midnight), so late-night sessions count as
// "today". All date math uses noon-anchored local Dates to stay
// correct across DST transitions and timezone changes.
export const DAY_START_HOUR = 4;

export function pad2(n) {
  return String(n).padStart(2, '0');
}

// Local calendar-day string YYYY-MM-DD for a Date.
export function dayString(d) {
  const x = d instanceof Date ? d : new Date(d);
  const y = x.getFullYear();
  return `${y}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
}

// Which study day does this timestamp belong to?
// Before 04:00 local it still counts as the previous day.
export function studyDayString(when) {
  const d = when instanceof Date ? new Date(when) : new Date(when);
  if (d.getHours() < DAY_START_HOUR) {
    d.setDate(d.getDate() - 1);
  }
  return dayString(d);
}

// Due-date string N days after a study day (DST-safe: noon anchor,
// then read back the calendar day).
export function dueString(fromDay, days) {
  const parts = String(fromDay).slice(0, 10).split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const dd = parseInt(parts[2], 10);
  const d = new Date(y, m, dd, 12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return dayString(d);
}

// True when both timestamps fall in the same study day.
export function sameStudyDay(a, b) {
  return studyDayString(a) === studyDayString(b);
}
