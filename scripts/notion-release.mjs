// Files a release in Notion: one Kanban card per commit, and a section on the
// Release Notes page listing them.
//
// Run by .github/workflows/notion-release.yml once a production deploy succeeds.
// Input is a file of commits from `git log` (see the workflow) — the range since
// the last release this script filed. Safe to re-run: a commit whose short SHA
// is already on a card is skipped, and nothing is appended when every commit
// in the range was.
//
//   NOTION_TOKEN   integration secret; the Kanban and the Release Notes page
//                  must both be shared with that integration
//   COMMITS_FILE   path to the git log output
//   RELEASE_SHA    the commit that was deployed
//
// What is filed is deliberately thin — short SHA, type and subject — so no
// repository links or database detail from commit bodies end up in Notion.

import { readFileSync } from "node:fs";
import {
  KANBAN_DATABASE_ID,
  RELEASE_NOTES_PAGE_ID,
  latestPhase,
  notion,
} from "./notion-version.mjs";

const RECORD = "\x1e";
const FIELD = "\x1f";

const TYPE_BY_PREFIX = {
  feat: "FEAT",
  fix: "FIX",
  docs: "DOCS",
  design: "DESIGN",
  style: "DESIGN",
  db: "DB",
  data: "DATA",
  deploy: "DEPLOY",
  ci: "DEPLOY",
  build: "DEPLOY",
  arch: "ARCH",
  research: "RESEARCH",
};

function typeOf(subject) {
  const m = /^(\w+)(?:\([^)]*\))?!?:/.exec(subject);
  return (m && TYPE_BY_PREFIX[m[1].toLowerCase()]) || "TECH";
}

/** Notion caps a rich-text run at 2000 characters. */
const text = (content, extra = {}) => ({
  type: "text",
  text: {
    content: String(content).slice(0, 1990),
    ...(extra.link ? { link: { url: extra.link } } : {}),
  },
  annotations: extra.code ? { code: true } : undefined,
});

function readCommits(path) {
  return (
    readFileSync(path, "utf8")
      .split(RECORD)
      .map((r) => r.replace(/^\s+/, ""))
      .filter(Boolean)
      .map((r) => {
        const [sha, subject, body = "", date = ""] = r.split(FIELD);
        return { sha: sha.trim(), subject: subject.trim(), body: body.trim(), date: date.trim() };
      })
      .filter((c) => c.sha && c.subject)
      // Merges restate their parents, and a commit can opt out.
      .filter(
        (c) => !/^Merge /.test(c.subject) && !/\[skip notion\]/i.test(`${c.subject} ${c.body}`),
      )
  );
}

async function alreadyFiled(shortSha) {
  const res = await notion(`databases/${KANBAN_DATABASE_ID}/query`, {
    method: "POST",
    body: { filter: { property: "Notes", rich_text: { contains: shortSha } }, page_size: 1 },
  });
  return (res.results ?? []).length > 0;
}

async function main() {
  if (!process.env.NOTION_TOKEN) {
    console.log("NOTION_TOKEN is not set — nothing filed.");
    return;
  }
  const commits = readCommits(process.env.COMMITS_FILE || "commits.txt");
  if (!commits.length) {
    console.log("No commits in this release.");
    return;
  }

  const phase = await latestPhase();
  // No links back to the repository: Notion is kept free of repo details.
  const repo = "";
  const filed = [];

  // Oldest first, so the board and the notes read in the order it happened.
  for (const c of [...commits].reverse()) {
    const short = c.sha.slice(0, 7);
    if (await alreadyFiled(short)) {
      console.log(`skip ${short} — already on the board`);
      continue;
    }
    // Subject only. Commit bodies often name tables, policies and file paths,
    // and Notion is kept free of repository and database detail.
    const note = short;
    await notion("pages", {
      method: "POST",
      body: {
        parent: { database_id: KANBAN_DATABASE_ID },
        properties: {
          Task: { title: [text(c.subject)] },
          Status: { select: { name: "Done" } },
          Type: { select: { name: typeOf(c.subject) } },
          Priority: { select: { name: "Medium" } },
          ...(phase ? { Phase: { select: { name: phase.name } } } : {}),
          Notes: { rich_text: [text(note)] },
        },
      },
    });
    filed.push(c);
    console.log(`filed ${short} ${c.subject}`);
  }

  if (!filed.length) {
    console.log("Every commit was already filed; release notes left as they are.");
    return;
  }

  const day = new Date(filed[filed.length - 1].date || Date.now()).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const release = (process.env.RELEASE_SHA || filed[filed.length - 1].sha).slice(0, 7);
  const title = `${phase ? `v${phase.version} (alpha)` : "Release"} — ${day}`;

  const row = (cells) => ({ type: "table_row", table_row: { cells } });
  await notion(`blocks/${RELEASE_NOTES_PAGE_ID}/children`, {
    method: "PATCH",
    body: {
      children: [
        { type: "divider", divider: {} },
        { type: "heading_1", heading_1: { rich_text: [text(title)] } },
        {
          type: "paragraph",
          paragraph: {
            rich_text: [
              text(`${filed.length} commit${filed.length === 1 ? "" : "s"} · deployed `),
              text(release, { code: true, link: repo ? `${repo}/commit/${release}` : undefined }),
            ],
          },
        },
        {
          type: "table",
          table: {
            table_width: 3,
            has_column_header: true,
            has_row_header: false,
            children: [
              row([[text("SHA")], [text("Type")], [text("Change")]]),
              ...filed.map((c) =>
                row([
                  [
                    text(c.sha.slice(0, 7), {
                      code: true,
                      link: repo ? `${repo}/commit/${c.sha}` : undefined,
                    }),
                  ],
                  [text(typeOf(c.subject), { code: true })],
                  [text(c.subject)],
                ]),
              ),
            ],
          },
        },
      ],
    },
  });
  console.log(`Release notes: added "${title}" with ${filed.length} commit(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
