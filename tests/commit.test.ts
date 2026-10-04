import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  capturedOverdue,
  createDomainGit,
  dayBefore,
  localDay,
  parseStatus,
} from "../src/git/commit.js";

const OWNED = ["evidence", "knowledge", "audit", "insights"] as const;

const domainGit = createDomainGit({
  domainId: "example",
  ownedPaths: OWNED,
  defaultOwner: "The Owner",
});

const git = (root: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" });

async function scratchRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "kit-commit-"));
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.email", "owner@example.test");
  git(root, "config", "user.name", "The Owner");
  await writeFile(join(root, "README.md"), "seed\n", "utf8");
  git(root, "add", "README.md");
  git(root, "commit", "-m", "seed");
  return root;
}

describe("outside a repository", () => {
  it("reports instead of failing", async () => {
    const root = await mkdtemp(join(tmpdir(), "kit-norepo-"));
    // A fresh tmp dir can sit under someone's repository; ask git itself.
    let inRepo = true;
    try {
      git(root, "rev-parse", "--show-toplevel");
    } catch {
      inRepo = false;
    }
    if (inRepo) return;
    const outcome = await domainGit.commitPaths(root, ["evidence"], "x");
    expect(outcome.committed).toBe(false);
    expect(await domainGit.uncommitted(root)).toBeNull();
    expect(await domainGit.hasRemote(root)).toBeNull();
    const listed = await domainGit.listChanges(root, "2026-01-01T00:00:00Z");
    expect(listed.repository).toBe(false);
  });
});

describe("the EV-14 commit engine", () => {
  it("commits exactly the owned paths and leaves the rest alone", async () => {
    const root = await scratchRepo();
    await mkdir(join(root, "evidence"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "evidence", "item.md"), "content\n", "utf8");
    await writeFile(join(root, "src", "code.ts"), "// owner's half-done\n");

    expect(await domainGit.uncommitted(root)).toBe(1);
    const outcome = await domainGit.commitDomainOwned(
      root,
      "example: commit what the domain wrote",
    );
    expect(outcome.committed).toBe(true);

    const files = git(root, "show", "--name-only", "--format=", "HEAD")
      .trim()
      .split("\n");
    expect(files).toEqual(["evidence/item.md"]);
    expect(await domainGit.uncommitted(root)).toBe(0);

    const found = await domainGit.changes(root);
    expect(found?.owned).toEqual([]);
    expect(found?.other.map((c) => c.path)).toEqual(["src/code.ts"]);
  });

  it("makes nothing when nothing changed", async () => {
    const root = await scratchRepo();
    const outcome = await domainGit.commitDomainOwned(root, "x");
    expect(outcome).toEqual({ committed: false, reason: "nothing to commit" });
  });

  it("refuses a path outside the repository", async () => {
    const root = await scratchRepo();
    const outcome = await domainGit.commitPaths(root, ["../elsewhere"], "x");
    expect(outcome).toEqual({ committed: false, reason: "nothing to commit" });
  });

  it("names the environment variable when git has no email to sign with", async () => {
    const root = await scratchRepo();
    git(root, "config", "user.email", "");
    delete process.env["EXAMPLE_OWNER_EMAIL"];
    await mkdir(join(root, "knowledge"), { recursive: true });
    await writeFile(join(root, "knowledge", "entry.md"), "e\n", "utf8");
    const outcome = await domainGit.commitDomainOwned(root, "x");
    expect(outcome.committed).toBe(false);
    if (!outcome.committed) {
      expect(outcome.reason).toContain("EXAMPLE_OWNER_EMAIL");
    }
  });

  it("commit_pending answers the owner's application with what it committed", async () => {
    const root = await scratchRepo();
    await mkdir(join(root, "audit"), { recursive: true });
    await writeFile(join(root, "audit", "actions.jsonl"), "{}\n", "utf8");
    const result = await domainGit.commitPending(root, {
      requestId: "req-12345678",
    });
    expect(result["accepted"]).toBe(true);
    expect(result["committed"]).toBe(true);
    expect(result["files"]).toEqual(["audit/actions.jsonl"]);
    expect(git(root, "log", "-1", "--format=%s")).toContain(
      "example: commit what the domain wrote",
    );
  });
});

describe("parseStatus", () => {
  it("reads a rename's old path as the next field, not a change", () => {
    const out = "R  new/name.md\0old/name.md\0 M touched.md\0?? fresh.md\0";
    expect(parseStatus(out)).toEqual([
      { path: "new/name.md", status: "renamed" },
      { path: "touched.md", status: "modified" },
      { path: "fresh.md", status: "untracked" },
    ]);
  });
});

describe("the captured daily rhythm (EV-14's second branch)", () => {
  const capturedGit = createDomainGit({
    domainId: "example",
    ownedPaths: OWNED,
    defaultOwner: "The Owner",
    captured: {
      paths: ["evidence/sessions", "audit/actions.jsonl"],
      anchorPaths: ["evidence/sessions"],
      message: (count, day) =>
        `example: captured through ${day}\n\n${count} captured file(s) (constitution EV-14).`,
    },
  });

  it("is absent as an answer when the domain declares no captured content", async () => {
    const root = await scratchRepo();
    expect(await domainGit.capturedState(root, new Date())).toBeNull();
    const outcome = await domainGit.commitCaptured(root, new Date());
    expect(outcome.committed).toBe(false);
  });

  it("commits once per day, excludes captured from uncommitted, then waits", async () => {
    const root = await scratchRepo();
    const now = new Date();
    await mkdir(join(root, "evidence", "sessions"), { recursive: true });
    await mkdir(join(root, "audit"), { recursive: true });
    await writeFile(
      join(root, "evidence", "sessions", "s1.md"),
      "captured\n",
      "utf8",
    );
    await writeFile(join(root, "audit", "actions.jsonl"), "{}\n", "utf8");

    // Captured content never counts as plainly uncommitted.
    expect(await capturedGit.uncommitted(root)).toBe(0);

    const before = await capturedGit.capturedState(root, now);
    expect(before).toMatchObject({ waiting: 2, due: true });

    const first = await capturedGit.commitCapturedIfDue(root, now);
    expect(first.committed).toBe(true);

    await writeFile(
      join(root, "evidence", "sessions", "s2.md"),
      "captured later\n",
      "utf8",
    );
    const second = await capturedGit.commitCapturedIfDue(root, now);
    expect(second).toEqual({ committed: "later" });

    const state = await capturedGit.capturedState(root, now);
    expect(state?.due).toBe(false);
    expect(state?.waiting).toBe(1);
  });

  it("knows when the rhythm is overdue", () => {
    const now = new Date(2026, 9, 4);
    expect(
      capturedOverdue(
        { waiting: 1, lastCommittedDay: "2026-10-01", due: true },
        now,
      ),
    ).toBe(true);
    expect(
      capturedOverdue(
        { waiting: 1, lastCommittedDay: "2026-10-03", due: true },
        now,
      ),
    ).toBe(false);
    expect(
      capturedOverdue({ waiting: 0, lastCommittedDay: null, due: false }, now),
    ).toBe(false);
  });

  it("localDay and dayBefore speak the owner's calendar", () => {
    expect(localDay(new Date(2026, 0, 1))).toBe("2026-01-01");
    expect(dayBefore("2026-01-01")).toBe("2025-12-31");
    expect(dayBefore("2026-03-01")).toBe("2026-02-28");
  });
});
