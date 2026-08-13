// backend/utils/payoutDates.test.js
// Run with: node --test backend/utils/payoutDates.test.js
//
// parseWallClock returning null is not a harmless no-op: the transactions route
// drops the date predicate entirely when it gets null, which answers an all-time
// query under a date-range heading. These cases pin down exactly what it accepts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWallClock } from "./payoutDates.js";

test("date-only parses to UTC midnight", () => {
  const d = parseWallClock("2026-08-14");
  assert.equal(d.toISOString(), "2026-08-14T00:00:00.000Z");
});

test("date-only with endOfDay parses to the inclusive end of that day", () => {
  const d = parseWallClock("2026-08-14", { endOfDay: true });
  assert.equal(d.toISOString(), "2026-08-14T23:59:59.999Z");
});

test("explicit time wins over endOfDay", () => {
  const d = parseWallClock("2026-08-14T14:30", { endOfDay: true });
  assert.equal(d.toISOString(), "2026-08-14T14:30:00.000Z");
});

test("seconds are accepted", () => {
  const d = parseWallClock("2026-08-14T14:30:45");
  assert.equal(d.toISOString(), "2026-08-14T14:30:45.000Z");
});

test("an ISO string with milliseconds is REJECTED", () => {
  // The trap: new Date().toISOString() produces exactly this shape. A caller
  // building a preset that way silently loses its date filter.
  assert.equal(parseWallClock("2026-08-14T00:00:00.000Z"), null);
});

test("a trailing Z is rejected", () => {
  assert.equal(parseWallClock("2026-08-14T00:00:00Z"), null);
});

test("non-ISO shapes are rejected", () => {
  assert.equal(parseWallClock("14/08/2026"), null);
  assert.equal(parseWallClock("2026-8-14"), null);
  assert.equal(parseWallClock(""), null);
  assert.equal(parseWallClock(undefined), null);
  assert.equal(parseWallClock(null), null);
});

test("an out-of-range day rolls forward rather than erroring", () => {
  // Date.UTC(2026, 1, 30) rolls into March. Documented so nobody mistakes it
  // for validation.
  const d = parseWallClock("2026-02-30");
  assert.equal(d.toISOString().slice(0, 10), "2026-03-02");
});
