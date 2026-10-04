/**
 * This repository is public, so nothing personal enters it (CONSTITUTION.md
 * rule 7): the source names no domain and describes no domain's evidence.
 * Fails on any match outside this file.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const SELF = join("scripts", "check-hygiene.mjs");

const FORBIDDEN = [
  /\b\w+-intelligence\b/i,
  /\bjolie\b/i,
  /\bmuesli\b/i,
  /\bdiary\b/i,
  /\bmortoni\b/i,
];

/** Where the repository may name its own home. */
const ALLOWED = new Set(["package.json", "README.md", "LICENSE"]);
const ALLOWED_PATTERNS = [/github(?:\.com[/:]|:)mortoni\/alanos-domain-kit/];

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", "dist", ".git", "_to_delete"].includes(entry)) {
      continue;
    }
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
};
walk(root);

let problems = 0;
for (const path of files) {
  const name = relative(root, path);
  if (name === SELF || name === "LICENSE") continue;
  if (/\.(png|jpg|gif|woff2?)$/.test(name)) continue;
  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((line, index) => {
    for (const pattern of FORBIDDEN) {
      const match = pattern.exec(line);
      if (match === null) continue;
      const allowedHere =
        ALLOWED.has(name) &&
        ALLOWED_PATTERNS.some((allowed) => allowed.test(line));
      if (allowedHere) continue;
      console.error(
        `${name}:${index + 1}: "${match[0]}" must not enter this repository`,
      );
      problems++;
    }
  });
}

if (problems > 0) {
  console.error(`${problems} hygiene problem(s). See CONSTITUTION.md rule 7.`);
  process.exit(1);
}
console.log(`hygiene: ${files.length - 1} files clean`);
