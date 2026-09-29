/**
 * What a reader is shown, and what the list itself has to hold to be readable.
 */
import { LATEST_BUILD, RELEASES, releasesFor, releasesSince } from "@/lib/whats-new";

let checks = 0;
function ok(cond: boolean, what: string) {
  checks++;
  if (!cond) throw new Error(`FAILED: ${what}`);
}

// The list, as a list.
ok(RELEASES.length > 0, "there is at least one release");
ok(LATEST_BUILD === RELEASES[0].build, "the latest build is the first one");
const builds = RELEASES.map((r) => r.build);
ok(
  builds.every((b, i) => i === 0 || b < builds[i - 1]),
  "builds descend, newest first",
);
ok(new Set(builds).size === builds.length, "no build number appears twice");
ok(
  RELEASES.every((r) => !Number.isNaN(new Date(r.at).getTime())),
  "every release has a date that parses",
);
ok(
  RELEASES.every((r) => r.changes.length > 0),
  "no release is empty",
);

// An admin sees the list as written.
ok(releasesFor(true) === RELEASES, "an admin gets the list itself, unfiltered");

// Everybody else sees it without the screens they cannot open.
const mine = releasesFor(false);
ok(
  mine.every((r) => r.changes.every((c) => !c.admin)),
  "no admin-only line survives the filter",
);
ok(
  mine.every((r) => r.changes.length > 0),
  "a release left empty by the filter is dropped, not shown blank",
);
ok(
  RELEASES.some((r) => r.changes.some((c) => c.admin)),
  "the filter has something to do — some line is admin-only",
);
// Filtering copies rather than edits: the source has to survive being read.
ok(
  RELEASES.some((r) => r.changes.some((c) => c.admin)),
  "filtering did not strip the admin lines out of the source",
);

// The thing the mark is for.
ok(releasesSince(LATEST_BUILD).length === 0, "up to date means no news");
ok(releasesSince(0).length === RELEASES.length, "a browser that never looked has all of it");
ok(
  releasesSince(RELEASES[1].build).length === 1,
  "one build behind is one build of news",
);

console.log(`ok — ${checks} checks`);
