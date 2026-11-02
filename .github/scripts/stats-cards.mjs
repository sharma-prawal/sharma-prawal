// Writes the two GitHub activity cards used by the profile README.
// Usage: GITHUB_TOKEN=... node stats-cards.mjs <login> <output-dir>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [login, outDir] = process.argv.slice(2);
const year = new Date().getUTCFullYear();

const query = `query ($login: String!, $from: DateTime!) {
  user(login: $login) {
    repositories(ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, first: 100) {
      totalCount
      nodes {
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
    pullRequests(states: MERGED) { totalCount }
    contributionsCollection(from: $from) {
      contributionCalendar { totalContributions }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query, variables: { login, from: `${year}-01-01T00:00:00Z` } }),
});
const { data, errors } = await res.json();
if (errors || !data?.user) throw new Error(JSON.stringify(errors ?? data));
const { user } = data;

const totals = new Map();
for (const repo of user.repositories.nodes) {
  for (const { size, node } of repo.languages.edges) {
    const entry = totals.get(node.name) ?? { name: node.name, color: node.color ?? "#858585", size: 0 };
    entry.size += size;
    totals.set(node.name, entry);
  }
}
const allBytes = [...totals.values()].reduce((sum, lang) => sum + lang.size, 0);
const languages = [...totals.values()].sort((a, b) => b.size - a.size).slice(0, 6);

const card = (title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="170" viewBox="0 0 400 170" role="img" aria-label="${title}">
  <style>
    text { font-family: -apple-system, 'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif; }
    .title { font-size: 18px; font-weight: 600; fill: #70a5fd; }
    .label { font-size: 14px; fill: #38bdae; }
    .value { font-size: 14px; font-weight: 700; fill: #38bdae; }
  </style>
  <rect width="400" height="170" rx="5" fill="#1a1b27"/>
  <text x="25" y="36" class="title">${title}</text>
${body}
</svg>
`;

const stats = [
  [`Contributions in ${year}`, user.contributionsCollection.contributionCalendar.totalContributions],
  ["Pull requests merged", user.pullRequests.totalCount],
  ["Public repositories", user.repositories.totalCount],
];
const statsBody = stats
  .map(([label, value], i) => {
    const y = 76 + i * 30;
    return `  <text x="25" y="${y}" class="label">${label}</text>\n  <text x="375" y="${y}" text-anchor="end" class="value">${value.toLocaleString("en-US")}</text>`;
  })
  .join("\n");

let barX = 25;
const bar = languages
  .map((lang) => {
    const width = (lang.size / allBytes) * 350;
    const rect = `  <rect x="${barX.toFixed(2)}" y="52" width="${width.toFixed(2)}" height="8" fill="${lang.color}"/>`;
    barX += width;
    return rect;
  })
  .join("\n");
const legend = languages
  .map((lang, i) => {
    const x = 25 + (i % 2) * 180;
    const y = 86 + Math.floor(i / 2) * 26;
    const percent = ((lang.size / allBytes) * 100).toFixed(1);
    return `  <circle cx="${x + 5}" cy="${y - 5}" r="5" fill="${lang.color}"/>\n  <text x="${x + 16}" y="${y}" class="label">${lang.name} ${percent}%</text>`;
  })
  .join("\n");

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "github-stats.svg"), card("GitHub Stats", statsBody));
writeFileSync(join(outDir, "top-languages.svg"), card("Top Languages", `${bar}\n${legend}`));
