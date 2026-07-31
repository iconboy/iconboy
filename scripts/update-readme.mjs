#!/usr/bin/env node
/**
 * Regenerates the auto-updated blocks of README.md.
 *
 * Reads real numbers from the GitHub GraphQL API — including PRIVATE repos,
 * as long as the token has the `repo` scope — and rewrites everything between
 * the <!--START_SECTION:x--> / <!--END_SECTION:x--> markers.
 *
 * env:
 *   GH_METRICS_TOKEN    classic PAT with `repo` + `read:user`  (required)
 *   GH_LOGIN            github username                        (default: iconboy)
 *   SHOW_PRIVATE_NAMES  "true" to print real private repo names (default: false)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const TOKEN = process.env.GH_METRICS_TOKEN || process.env.GITHUB_TOKEN;
const LOGIN = process.env.GH_LOGIN || "iconboy";
const SHOW_PRIVATE_NAMES = process.env.SHOW_PRIVATE_NAMES === "true";
const README = join(dirname(fileURLToPath(import.meta.url)), "..", "README.md");

const WIDTH = 54; // inner width of the ascii boxes

if (!TOKEN) {
  console.error("✖ missing GH_METRICS_TOKEN — nothing to do");
  process.exit(1);
}

/* ------------------------------------------------------------------ query */

const QUERY = `
query($login: String!) {
  user(login: $login) {
    followers { totalCount }
    contributionsCollection {
      totalCommitContributions
      restrictedContributionsCount
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false,
                 orderBy: {field: PUSHED_AT, direction: DESC}) {
      totalCount
      nodes {
        name
        isPrivate
        stargazerCount
        pushedAt
        primaryLanguage { name }
        languages(first: 12, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name } }
        }
      }
    }
  }
}`;

async function graphql() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": `${LOGIN}-profile-readme`,
    },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data.user;
}

/* ------------------------------------------------------------------ utils */

const num = (n) => n.toLocaleString("en-US");

function streaks(weeks) {
  const days = weeks
    .flatMap((w) => w.contributionDays)
    .sort((a, b) => a.date.localeCompare(b.date));

  let longest = 0;
  let run = 0;
  for (const d of days) {
    run = d.contributionCount > 0 ? run + 1 : 0;
    if (run > longest) longest = run;
  }

  // current streak: walk backwards, tolerating an empty "today"
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].contributionCount > 0) current++;
    else if (i === days.length - 1) continue; // today not committed yet
    else break;
  }
  return { current, longest };
}

function ago(iso) {
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

/**
 * Monospace columns a string occupies. Emoji render double-width; box-drawing
 * glyphs (U+2500…) do not, so only the emoji planes count as 2.
 */
const visualLen = (s) =>
  [...s].reduce((n, ch) => {
    const cp = ch.codePointAt(0);
    if (cp === 0xfe0f) return n; // variation selector: zero width
    return n + (cp >= 0x1f000 || (cp >= 0x2600 && cp <= 0x27bf) ? 2 : 1);
  }, 0);

const pad = (s, n) => {
  const len = visualLen(s);
  return len >= n ? s : s + " ".repeat(n - len);
};

/** every box line below is exactly WIDTH visual columns wide */
const row = (label, value) =>
  `│ ${pad(label, 20)}${pad(String(value), WIDTH - 23)}│`;
const edge = (left, right, title) => {
  const head = title ? `${left}─ ${title} ` : left;
  return head + "─".repeat(Math.max(0, WIDTH - 1 - visualLen(head))) + right;
};
const top = (title) => edge("┌", "┐", title);
const rule = (title) => edge("├", "┤", title);
const bottom = () => edge("└", "┘");

/* --------------------------------------------------------------- sections */

function terminalSection(user) {
  const c = user.contributionsCollection;
  const repos = user.repositories.nodes;
  const { current, longest } = streaks(c.contributionCalendar.weeks);

  const priv = repos.filter((r) => r.isPrivate).length;
  const pub = repos.length - priv;
  const stars = repos.reduce((a, r) => a + r.stargazerCount, 0);
  const commits = c.totalCommitContributions + c.restrictedContributionsCount;

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");

  return [
    "```console",
    `$ gh stats --user ${LOGIN} --live`,
    top("contributions"),
    row("last 12 months", `${num(c.contributionCalendar.totalContributions)} contributions`),
    row("current streak", `${current} day${current === 1 ? "" : "s"}${current > 0 ? "  🔥" : ""}`),
    row("longest streak", `${longest} days`),
    row("commits (1y)", num(commits)),
    row("pull requests", num(c.totalPullRequestContributions)),
    row("code reviews", num(c.totalPullRequestReviewContributions)),
    row("issues opened", num(c.totalIssueContributions)),
    rule("repositories"),
    row("owned", `${repos.length}   (${pub} public · ${priv} private)`),
    row("stars earned", num(stars)),
    row("followers", num(user.followers.totalCount)),
    bottom(),
    `# last sync ${stamp} UTC · rebuilt daily by GitHub Actions`,
    "```",
  ].join("\n");
}

function languagesSection(user) {
  const totals = new Map();
  for (const repo of user.repositories.nodes) {
    for (const { size, node } of repo.languages.edges) {
      totals.set(node.name, (totals.get(node.name) || 0) + size);
    }
  }

  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const grand = ranked.reduce((a, [, s]) => a + s, 0) || 1;
  const top = ranked.slice(0, 8);

  const lines = top.map(([name, size]) => {
    const pct = (size / grand) * 100;
    const filled = Math.max(1, Math.round((pct / 100) * 30));
    const bar = "█".repeat(filled) + "░".repeat(30 - filled);
    return `${pad(name, 14)}${bar}  ${pct.toFixed(1).padStart(5)}%`;
  });

  const rest = ranked.slice(8).reduce((a, [, s]) => a + s, 0);
  if (rest > 0) {
    lines.push(`${pad("other", 14)}${"░".repeat(30)}  ${((rest / grand) * 100).toFixed(1).padStart(5)}%`);
  }

  return ["```text", ...lines, "```"].join("\n");
}

function activitySection(user) {
  const repos = user.repositories.nodes.slice(0, 6);
  let masked = 0;

  const lines = repos.map((r) => {
    const isHidden = r.isPrivate && !SHOW_PRIVATE_NAMES;
    const name = isHidden ? `private project #${++masked}` : r.name;
    const lock = r.isPrivate ? "🔒" : "  ";
    const lang = r.primaryLanguage?.name ?? "—";
    return `▸ ${lock} ${pad(name, 24)}${pad(lang, 14)}pushed ${ago(r.pushedAt)}`;
  });

  return ["```text", ...lines, "```"].join("\n");
}

/* ------------------------------------------------------------------- main */

function replaceSection(md, name, body) {
  const re = new RegExp(
    `(<!--START_SECTION:${name}-->)[\\s\\S]*?(<!--END_SECTION:${name}-->)`,
  );
  if (!re.test(md)) {
    console.warn(`⚠ marker "${name}" not found in README`);
    return md;
  }
  return md.replace(re, `$1\n${body}\n$2`);
}

const user = await graphql();

// the profile repo itself is scaffolding, not work — keep it out of the numbers
user.repositories.nodes = user.repositories.nodes.filter((r) => r.name !== LOGIN);

let md = readFileSync(README, "utf8");
const before = md;

md = replaceSection(md, "terminal", terminalSection(user));
md = replaceSection(md, "languages", languagesSection(user));
md = replaceSection(md, "activity", activitySection(user));

if (md === before) {
  console.log("· nothing changed");
} else {
  writeFileSync(README, md);
  console.log("✔ README updated");
}
