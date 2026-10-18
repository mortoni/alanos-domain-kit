/**
 * A new domain repository from its approved charter.
 *
 * The template under `templates/domain` is copied as it is, with the
 * charter's own words put in its placeholders: nothing here decides what a
 * domain is, and no model is involved. What comes out is callable from its
 * first commit (the status read, the improvement reads, the owner's two
 * actions) and holds no evidence and no knowledge. Everything else is built
 * in it afterwards.
 *
 * It writes only inside `target`, which must not exist yet, and never runs
 * git, a package manager or the network: whoever calls it does those, on the
 * owner's press, in this order: install, `pnpm format` (the charter's words
 * change line lengths), `pnpm emit:manifest`, `pnpm check`, the first commit.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** The parts of a charter the template uses. The charter itself is written whole. */
export interface DomainCharterInput {
  readonly charterVersion: number;
  readonly kind: string;
  readonly id: string;
  readonly repository: string;
  readonly purpose: string;
  readonly owns: readonly string[];
  readonly doesNotOwn: readonly {
    readonly what: string;
    readonly owner: string;
  }[];
  readonly stage: string;
  readonly [key: string]: unknown;
}

export interface CreateDomainOptions {
  /** The approved charter, already validated against the federation's charter schema. */
  readonly charter: DomainCharterInput;
  /** Where the repository goes. Must not exist. */
  readonly target: string;
  /** The package's name, which is also the repository's folder name. */
  readonly packageName: string;
  /** How package.json depends on this kit, for example a pinned git tag. */
  readonly kitDependency: string;
  /** The constitution version the domain declares as its floor. */
  readonly floor: string;
  /** Who commits what the domain writes, by name. */
  readonly owner: string;
  /** The date it was made, YYYY-MM-DD. */
  readonly today: string;
  /** The manifest's default visibility tier. Default: personal. */
  readonly visibility?: "personal" | "confidential";
  /** The one entity type the manifest declares until the domain has its own. Default: entry. */
  readonly entityType?: string;
}

export interface CreatedDomain {
  readonly target: string;
  /** Every file written, relative to target, sorted. */
  readonly files: readonly string[];
}

export class CreateDomainRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreateDomainRefused";
  }
}

const ID = /^[a-z][a-z0-9-]*$/;
const PLACEHOLDER = /__[A-Z][A-Z_]*__/g;

/** The template's own folder, from src/ in tests and from dist/ once built. */
export const DOMAIN_TEMPLATE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "templates",
  "domain",
);

const bullets = (lines: readonly string[]): string =>
  lines.length === 0
    ? "- Nothing yet."
    : lines.map((line) => `- ${line}`).join("\n");

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

export async function createDomain(
  options: CreateDomainOptions,
): Promise<CreatedDomain> {
  const { charter, target } = options;
  if (charter.kind !== "domain")
    throw new CreateDomainRefused(
      `the charter is kind ${charter.kind}, not domain`,
    );
  if (charter.stage !== "incubating")
    throw new CreateDomainRefused(
      `the charter is ${charter.stage}; a new domain starts incubating`,
    );
  if (!ID.test(charter.id))
    throw new CreateDomainRefused(`${charter.id} is not a domain id`);
  if (!ID.test(options.packageName))
    throw new CreateDomainRefused(
      `${options.packageName} is not a repository name`,
    );
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.today))
    throw new CreateDomainRefused(`${options.today} is not a date`);
  if (existsSync(target))
    throw new CreateDomainRefused(
      `${target} already exists; nothing was written`,
    );

  const values: Record<string, string> = {
    __ID__: charter.id,
    __PACKAGE__: options.packageName,
    __REPO_NAME__: options.packageName,
    __REPOSITORY__: charter.repository,
    __PURPOSE__: charter.purpose,
    __DESCRIPTION_JSON__: JSON.stringify(charter.purpose),
    __OWNS__: bullets(charter.owns),
    __NOT_OWNED__: bullets(
      charter.doesNotOwn.map((d) => `${d.what} (${d.owner})`),
    ),
    __FLOOR__: options.floor,
    __KIT__: options.kitDependency,
    __OWNER__: options.owner,
    __DATE__: options.today,
    __VISIBILITY__: options.visibility ?? "personal",
    __ENTITY__: options.entityType ?? "entry",
  };

  const sources = await walk(DOMAIN_TEMPLATE);
  const written: string[] = [];
  for (const source of sources) {
    const rel = relative(DOMAIN_TEMPLATE, source);
    const text = (await readFile(source, "utf8")).replace(
      PLACEHOLDER,
      (name) => {
        const value = values[name];
        if (value === undefined)
          throw new CreateDomainRefused(
            `the template names ${name}, which nothing fills (${rel})`,
          );
        return value;
      },
    );
    const path = join(target, rel);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
    written.push(rel);
  }
  await writeFile(
    join(target, "charter.json"),
    `${JSON.stringify(charter, null, 2)}\n`,
  );
  written.push("charter.json");
  return { target, files: written.sort() };
}
