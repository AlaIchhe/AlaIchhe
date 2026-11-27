#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OWNER = process.env.GITHUB_OWNER || process.env.GITHUB_REPOSITORY_OWNER || "AlaIchhe";
const TOKEN = process.env.GITHUB_TOKEN || "";
const README_PATH = path.resolve(process.env.README_PATH || "README.md");
const MAX_PROJECTS = Number(process.env.MAX_PROJECTS || "0");

const START_MARKER = "<!-- PROJECTS:START -->";
const END_MARKER = "<!-- PROJECTS:END -->";

const LANGUAGE_BADGES = {
  TypeScript: { alt: "TS", label: "TypeScript", color: "5BCEFA", logo: "typescript" },
  JavaScript: { alt: "JS", label: "JavaScript", color: "F5A9B8", logo: "javascript" },
  Python: { alt: "Py", label: "Python", color: "5BCEFA", logo: "python" },
  Go: { alt: "Go", label: "Go", color: "5BCEFA", logo: "go" },
  Rust: { alt: "Rust", label: "Rust", color: "F5A9B8", logo: "rust" },
  Shell: { alt: "Shell", label: "Shell", color: "5BCEFA", logo: "gnubash" },
  C: { alt: "C", label: "C", color: "5BCEFA", logo: "c" },
  "C++": { alt: "C++", label: "C++", color: "F5A9B8", logo: "cplusplus" },
  "C#": { alt: "C#", label: "C#", color: "5BCEFA", logo: "sharp" },
  Java: { alt: "Java", label: "Java", color: "F5A9B8", logo: "openjdk" },
  Kotlin: { alt: "Kotlin", label: "Kotlin", color: "5BCEFA", logo: "kotlin" },
  Swift: { alt: "Swift", label: "Swift", color: "F5A9B8", logo: "swift" },
  Dart: { alt: "Dart", label: "Dart", color: "5BCEFA", logo: "dart" },
  Vue: { alt: "Vue", label: "Vue", color: "F5A9B8", logo: "vuedotjs" },
  HTML: { alt: "HTML", label: "HTML", color: "F5A9B8", logo: "html5" },
  CSS: { alt: "CSS", label: "CSS", color: "5BCEFA", logo: "css3" },
  TeX: { alt: "LaTeX", label: "LaTeX", color: "5BCEFA", logo: "latex" },
  Dockerfile: { alt: "Docker", label: "Docker", color: "5BCEFA", logo: "docker" },
  Ruby: { alt: "Ruby", label: "Ruby", color: "F5A9B8", logo: "ruby" },
  PHP: { alt: "PHP", label: "PHP", color: "5BCEFA", logo: "php" },
  Lua: { alt: "Lua", label: "Lua", color: "5BCEFA", logo: "lua" },
  Nix: { alt: "Nix", label: "Nix", color: "5BCEFA", logo: "nixos" },
};

function encodeShieldsSegment(text) {
  return encodeURIComponent(text.replace(/-/g, "--").replace(/_/g, "__"));
}

function escapeTableCell(text) {
  return text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");
}

function renderLanguageBadge(language) {
  if (!language) return "—";
  const spec = LANGUAGE_BADGES[language];
  if (spec) {
    const label = encodeShieldsSegment(spec.label);
    return `![${spec.alt}](https://img.shields.io/badge/-${label}-${spec.color}?style=flat-square&logo=${spec.logo}&logoColor=white)`;
  }
  const label = encodeShieldsSegment(language);
  return `![${escapeTableCell(language)}](https://img.shields.io/badge/-${label}-5BCEFA?style=flat-square)`;
}

async function fetchOwnedRepos(owner) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": `${owner}-profile-projects-updater`,
  };
  if (TOKEN) {
    headers.Authorization = `Bearer ${TOKEN}`;
  }

  const repos = [];
  for (let page = 1; ; page += 1) {
    const url = `https://api.github.com/users/${encodeURIComponent(owner)}/repos?type=owner&per_page=100&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API error (${res.status}): ${body}`);
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos;
}

export function selectProjects(repos, owner, maxProjects = 0) {
  const filtered = repos
    .filter((repo) => {
      if (repo.private) return false;
      if (repo.fork) return false;
      if (repo.archived) return false;
      if (repo.name.toLowerCase() === owner.toLowerCase()) return false;
      return (repo.stargazers_count ?? 0) > 0;
    })
    .sort((a, b) => {
      const starDiff = (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0);
      if (starDiff !== 0) return starDiff;
      const forkDiff = (b.forks_count ?? 0) - (a.forks_count ?? 0);
      if (forkDiff !== 0) return forkDiff;
      return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    });

  return maxProjects > 0 ? filtered.slice(0, maxProjects) : filtered;
}

export function renderProjectsBlock(projects, owner) {
  if (projects.length === 0) {
    return `${START_MARKER}\n${END_MARKER}`;
  }

  const rows = projects.map((repo) => {
    const name = escapeTableCell(repo.name);
    const starsBadge = `![stars](https://img.shields.io/github/stars/${encodeURIComponent(owner)}/${encodeURIComponent(repo.name)}?style=flat-square&color=F5A9B8)`;
    const projectCell = `[**${name}**](${repo.html_url}) <br> ${starsBadge}`;
    const descCell = repo.description ? escapeTableCell(repo.description) : "—";
    const techCell = renderLanguageBadge(repo.language);
    return `| ${projectCell} | ${descCell} | ${techCell} |`;
  });

  return [
    START_MARKER,
    "",
    "---",
    "",
    "### Projects",
    "",
    "| Project | Description | Tech |",
    "| :-- | :-- | :-- |",
    ...rows,
    "",
    END_MARKER,
  ].join("\n");
}

export function replaceProjectsSection(readme, block) {
  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(`Missing or invalid markers (${START_MARKER} ... ${END_MARKER}) in ${README_PATH}`);
  }
  return readme.slice(0, startIdx) + block + readme.slice(endIdx + END_MARKER.length);
}

async function main() {
  const repos = await fetchOwnedRepos(OWNER);
  const projects = selectProjects(repos, OWNER, MAX_PROJECTS);
  const block = renderProjectsBlock(projects, OWNER);

  const currentReadme = fs.readFileSync(README_PATH, "utf8");
  const updatedReadme = replaceProjectsSection(currentReadme, block);

  if (updatedReadme === currentReadme) {
    console.log(`No changes needed (${projects.length} starred project(s)).`);
    return;
  }

  fs.writeFileSync(README_PATH, updatedReadme, "utf8");
  console.log(
    `Updated ${README_PATH} with ${projects.length} project(s): ${projects
      .map((r) => `${r.name} (★${r.stargazers_count})`)
      .join(", ")}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
