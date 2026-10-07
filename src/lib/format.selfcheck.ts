/**
 * relativeDay, either side of today. The day boundaries are where this kind of
 * function goes wrong — an hour of clock time is not a day, and "tomorrow" at
 * 11pm is eleven hours away, not twenty-four.
 *
 *   npx esbuild src/lib/format.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=.selfcheck.mjs && node .selfcheck.mjs
 */
import assert from "node:assert";

import { daysAgo, relativeDay, timeAgo } from "@/lib/format";

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

// daysAgo only ever looks back: a shelf of what was just added has no use for
// "In 2 days", and a date typed a day ahead is a typo rather than news.
assert.equal(daysAgo(at(0), now), "Today");
assert.equal(daysAgo(at(1, 0), now), "Today", "a day ahead is not news from the future");
assert.equal(daysAgo(at(-1), now), "Yesterday");
assert.equal(daysAgo(at(-1, 23), now), "Yesterday", "late yesterday is still yesterday");
assert.equal(daysAgo(at(-5), now), "5 days ago");
assert.equal(daysAgo(at(-40), now), "40 days ago", "never falls back to a date");

console.log("format: daysAgo counts backwards only.");

// timeAgo: minutes and hours matter while somebody is waiting; past a day the
// hour stops mattering and daysAgo takes over again.
{
  const now = new Date(2026, 9, 7, 15, 0, 0);
  const back = (ms: number) => new Date(now.getTime() - ms);
  assert.equal(timeAgo(back(5_000), now), "just now");
  assert.equal(timeAgo(back(59_000), now), "just now");
  assert.equal(timeAgo(back(60_000), now), "1 min ago");
  assert.equal(timeAgo(back(30 * 60_000), now), "30 mins ago");
  assert.equal(timeAgo(back(59 * 60_000), now), "59 mins ago");
  assert.equal(timeAgo(back(60 * 60_000), now), "1 hr ago");
  assert.equal(timeAgo(back(5 * 60 * 60_000), now), "5 hrs ago");
  assert.equal(timeAgo(back(23 * 60 * 60_000), now), "23 hrs ago");
  // A day back from 3pm is 3pm yesterday, which daysAgo calls Yesterday.
  assert.equal(timeAgo(back(24 * 60 * 60_000), now), "Yesterday");
  assert.equal(timeAgo(back(3 * 24 * 60 * 60_000), now), "3 days ago");
  // A clock a little ahead of the server is this moment, not the future.
  assert.equal(timeAgo(new Date(now.getTime() + 20_000), now), "just now");
}

console.log("format: timeAgo counts minutes and hours, then hands over to days.");
