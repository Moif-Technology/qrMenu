// backend/utils/payoutDates.js
// Payment.CreatedAt is written by the DB with GETDATE() (server wall-clock),
// while the mssql driver serialises Date params using their UTC components.
// Parsing "2026-07-12T14:30" with new Date() would treat it as Node-local time
// and the driver would then shift it to UTC, skewing filters by the timezone
// offset. Building the Date from Date.UTC keeps the wall-clock values intact
// end to end.

/**
 * Parse "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm[:ss]" into a Date whose UTC fields
 * hold the given wall-clock values. A date-only "to" boundary becomes the
 * inclusive end of that day when endOfDay is true. Returns null on bad input.
 */
export function parseWallClock(value, { endOfDay = false } = {}) {
  const m = String(value).match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const date = h === undefined && endOfDay
    ? new Date(Date.UTC(+y, +mo - 1, +d, 23, 59, 59, 999))
    : new Date(Date.UTC(+y, +mo - 1, +d, +(h ?? 0), +(mi ?? 0), +(s ?? 0)));
  return Number.isNaN(date.getTime()) ? null : date;
}
