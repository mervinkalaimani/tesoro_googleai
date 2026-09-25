/**
 * relativeDay, either side of today. The day boundaries are where this kind of
 * function goes wrong — an hour of clock time is not a day, and "tomorrow" at
 * 11pm is eleven hours away, not twenty-four.
 *
 *   npx esbuild src/lib/format.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=.selfcheck.mjs && node .selfcheck.mjs
 */
import assert from "node:assert";

import { relativeDay } from "@/lib/format";

/** Late on a Wednesday, so "tomorrow" is only just over an hour away. */
const now = new Date(2026, 8, 23, 22, 45);
const at = (dayOffset: number, h = 9) => new Date(2026, 8, 23 + dayOffset, h);

assert.equal(relativeDay(at(0), now), "Today");
assert.equal(relativeDay(at(0, 1), now), "Today");
assert.equal(relativeDay(at(1, 0), now), "Tomorrow", "an hour past midnight is still tomorrow");
assert.equal(relativeDay(at(-1), now), "Yesterday");
assert.equal(relativeDay(at(2), now), "In 2 days");
assert.equal(relativeDay(at(-2), now), "2 days ago");
assert.equal(relativeDay(at(30), now), "In 30 days");
assert.equal(relativeDay(at(60), now), "In 60 days");
// Past two months the wait is easier read as a date than counted in days.
assert.equal(relativeDay(at(61), now), "23, Nov '26");
// Backwards it has always been a date after a week.
assert.equal(relativeDay(at(-7), now), "16, Sep '26");

console.log("format: relativeDay reads forward and back across the day boundary.");
