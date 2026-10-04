/**
 * Committing what a domain writes (Alan OS constitution EV-14).
 *
 * Every write is one act that commits exactly what it wrote, with its log
 * lines, in the same act. Every commit names its paths. Nothing here ever
 * stages everything, so the owner's half-done work in the tree stays his, and
 * nothing here pushes: pushing is always the owner's act.
 *
 * A commit that cannot be made (no repository, a lock left by another git, no
 * identity) never fails the action. The write is on disk and correct; the
 * result says why it was not committed and `list_pending` shows it until it
 * is.
 */
import { execFile } from "node:child_process";
import { isAbsolute, relative } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export type CommitOutcome =
  | { readonly committed: true; readonly commit: string }
  | { readonly committed: false; readonly reason: string };

export interface DomainGitOptions {
  /**
   * The domain's id, e.g. "example". Derives the environment variables the
   * engine consults (<ID>_OWNER, <ID>_OWNER_EMAIL) and the commit message
   * `commit_pending` writes.
   */
  readonly domainId: string;
  /**
   * The top-level folders this domain writes: its evidence, knowledge, logs
   * and insights. Code is never among them (EV-14).
   */
  readonly ownedPaths: readonly string[];
  /** Who signs when no environment variable overrides: the owner's name. */
  readonly defaultOwner: string;
}

export type ChangeStatus =
  "modified" | "added" | "deleted" | "renamed" | "untracked";

export interface Change {
  readonly path: string;
  readonly status: ChangeStatus;
}

const git = (root: string, args: string[], env?: NodeJS.ProcessEnv) =>
  run("git", args, {
    cwd: root,
    env: { ...process.env, ...env },
    maxBuffer: 4 * 1024 * 1024,
  });

async function isRepository(root: string): Promise<boolean> {
  try {
    const { stdout } = await git(root, ["rev-parse", "--show-toplevel"]);
    return stdout.trim() !== "";
  } catch {
    return false;
  }
}

const firstLine = (error: unknown): string =>
  (
    String((error as { stderr?: string }).stderr ?? (error as Error).message)
      .split("\n")
      .find((line) => line.trim() !== "") ?? "git refused"
  ).slice(0, 200);

/** The paths under these that differ from HEAD, untracked included. */
async function changedUnder(
  root: string,
  paths: readonly string[],
): Promise<string[]> {
  // --no-optional-locks: looking must not take the index lock, or a status
  // run beside the owner's editor (or another git) makes one of them fail.
  const { stdout } = await git(root, [
    "--no-optional-locks",
    "status",
    "--porcelain",
    "--untracked-files=all",
    "--",
    ...paths,
  ]);
  return stdout
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) =>
      line
        .slice(3)
        .trim()
        .replace(/^"(.*)"$/, "$1"),
    );
}

const statusOf = (xy: string): ChangeStatus =>
  xy === "??"
    ? "untracked"
    : xy.includes("R")
      ? "renamed"
      : xy.includes("D")
        ? "deleted"
        : xy.includes("A")
          ? "added"
          : "modified";

/** `git status --porcelain=v1 -z`: a rename carries its old path as the next field. */
export function parseStatus(out: string): Change[] {
  const fields = out.split("\0");
  const changes: Change[] = [];
  for (let i = 0; i < fields.length; i++) {
    const entry = fields[i] ?? "";
    if (entry.length < 4) continue;
    const xy = entry.slice(0, 2);
    if (xy.includes("R") || xy.includes("C")) i++;
    changes.push({ path: entry.slice(3), status: statusOf(xy) });
  }
  return changes;
}

export interface DomainGit {
  /**
   * Commit exactly these paths (relative to the repository, or absolute
   * within it). Paths that did not change are dropped; if none changed,
   * nothing is made.
   */
  readonly commitPaths: (
    repositoryRoot: string,
    paths: readonly string[],
    message: string,
    owner?: string,
  ) => Promise<CommitOutcome>;
  /** Commit everything this domain owns that has changed. `pnpm commit`. */
  readonly commitDomainOwned: (
    repositoryRoot: string,
    message: string,
    owner?: string,
  ) => Promise<CommitOutcome>;
  /** Files this domain owns that differ from HEAD. Null when not a repository. */
  readonly uncommitted: (repositoryRoot: string) => Promise<number | null>;
  /** Whether the repository has anywhere to push to. Null when not a repository. */
  readonly hasRemote: (repositoryRoot: string) => Promise<boolean | null>;
  /**
   * What has changed, sorted into what this domain would commit (`owned`) and
   * everything else (`other`: code, the owner's own files), for the owner's
   * application to show before he decides. Paths and a status only, never
   * content.
   */
  readonly changes: (
    repositoryRoot: string,
  ) => Promise<{ owned: Change[]; other: Change[] } | null>;
  /** The `list_changes` read. */
  readonly listChanges: (
    repositoryRoot: string,
    now: string,
  ) => Promise<{
    generatedAt: string;
    repository: boolean;
    owned: Change[];
    other: Change[];
  }>;
  /** The `commit_pending` action for the owner's application. */
  readonly commitPending: (
    repositoryRoot: string,
    input: unknown,
  ) => Promise<Record<string, unknown>>;
}

const envName = (domainId: string, suffix: string): string =>
  `${domainId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_${suffix}`;

/** The EV-14 commit engine, bound to one domain's id and owned paths. */
export function createDomainGit(options: DomainGitOptions): DomainGit {
  const { domainId, ownedPaths, defaultOwner } = options;
  const ownerEnv = envName(domainId, "OWNER");
  const emailEnv = envName(domainId, "OWNER_EMAIL");

  /**
   * Who signs. The owner, because the domain is his: his name, and the email
   * git is configured with, or <ID>_OWNER_EMAIL where git has none.
   */
  async function identity(
    root: string,
    owner: string,
  ): Promise<NodeJS.ProcessEnv | null> {
    let email = process.env[emailEnv] ?? "";
    try {
      email =
        (await git(root, ["config", "user.email"])).stdout.trim() || email;
    } catch {
      // Not configured; the environment may still say.
    }
    if (email === "") return null;
    return {
      GIT_AUTHOR_NAME: owner,
      GIT_AUTHOR_EMAIL: email,
      GIT_COMMITTER_NAME: owner,
      GIT_COMMITTER_EMAIL: email,
    };
  }

  async function commitPaths(
    repositoryRoot: string,
    paths: readonly string[],
    message: string,
    owner: string = process.env[ownerEnv] ?? defaultOwner,
  ): Promise<CommitOutcome> {
    if (!(await isRepository(repositoryRoot))) {
      return {
        committed: false,
        reason: "this domain is not a git repository here",
      };
    }
    const env = await identity(repositoryRoot, owner);
    if (env === null) {
      return {
        committed: false,
        reason: `git has no email to sign with; set user.email or ${emailEnv}`,
      };
    }
    const relativePaths = [
      ...new Set(
        paths.map((p) => (isAbsolute(p) ? relative(repositoryRoot, p) : p)),
      ),
    ].filter((p) => p !== "" && !p.startsWith(".."));
    if (relativePaths.length === 0) {
      return { committed: false, reason: "nothing to commit" };
    }
    try {
      const changed = await changedUnder(repositoryRoot, relativePaths);
      if (changed.length === 0) {
        return { committed: false, reason: "nothing to commit" };
      }
      await git(repositoryRoot, ["add", "--", ...changed]);
      // --only: commit these paths and leave anything else in the index alone.
      await git(
        repositoryRoot,
        ["commit", "--only", "--no-verify", "-m", message, "--", ...changed],
        env,
      );
      const { stdout } = await git(repositoryRoot, [
        "rev-parse",
        "--short",
        "HEAD",
      ]);
      return { committed: true, commit: stdout.trim() };
    } catch (error) {
      return { committed: false, reason: firstLine(error) };
    }
  }

  const commitDomainOwned = (
    repositoryRoot: string,
    message: string,
    owner?: string,
  ): Promise<CommitOutcome> =>
    commitPaths(repositoryRoot, [...ownedPaths], message, owner);

  async function uncommitted(repositoryRoot: string): Promise<number | null> {
    if (!(await isRepository(repositoryRoot))) return null;
    try {
      return (await changedUnder(repositoryRoot, [...ownedPaths])).length;
    } catch {
      return null;
    }
  }

  async function hasRemote(repositoryRoot: string): Promise<boolean | null> {
    if (!(await isRepository(repositoryRoot))) return null;
    try {
      return (await git(repositoryRoot, ["remote"])).stdout.trim() !== "";
    } catch {
      return null;
    }
  }

  const isOwned = (path: string): boolean =>
    ownedPaths.some((root) => path === root || path.startsWith(`${root}/`));

  async function changes(
    repositoryRoot: string,
  ): Promise<{ owned: Change[]; other: Change[] } | null> {
    if (!(await isRepository(repositoryRoot))) return null;
    try {
      const { stdout } = await git(repositoryRoot, [
        "--no-optional-locks",
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
      ]);
      const all = parseStatus(stdout);
      return {
        owned: all.filter((change) => isOwned(change.path)),
        other: all.filter((change) => !isOwned(change.path)),
      };
    } catch {
      return null;
    }
  }

  async function listChanges(repositoryRoot: string, now: string) {
    const found = await changes(repositoryRoot);
    return {
      generatedAt: now,
      repository: found !== null,
      owned: found?.owned ?? [],
      other: found?.other ?? [],
    };
  }

  /**
   * The `commit_pending` action: `pnpm commit` for the owner's application.
   * The commit is its own record; a log line written for it would leave the
   * log uncommitted again at once.
   */
  async function commitPending(repositoryRoot: string, input: unknown) {
    const requestId =
      typeof (input as { requestId?: unknown } | null)?.requestId === "string"
        ? (input as { requestId: string }).requestId
        : "";
    const before = await changes(repositoryRoot);
    const outcome = await commitDomainOwned(
      repositoryRoot,
      `${domainId}: commit what the domain wrote\n\nCommitted by the owner from his application (constitution EV-14).`,
    );
    return {
      accepted: true,
      requestId,
      ...outcome,
      files: outcome.committed ? (before?.owned ?? []).map((c) => c.path) : [],
    };
  }

  return {
    commitPaths,
    commitDomainOwned,
    uncommitted,
    hasRemote,
    changes,
    listChanges,
    commitPending,
  };
}
