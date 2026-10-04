import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readAuditLog } from "../src/audit/log.js";
import {
  createImprovementReads,
  gitPendingItems,
} from "../src/improvement/reads.js";
import {
  refuseTransition,
  reportPathWithin,
  selectInsights,
  type Insight,
  type InsightsLedger,
} from "../src/improvement/standard.js";
import { transitionInsight } from "../src/improvement/transition.js";

const dimension = { score: 7, reason: "stated" };

const makeInsight = (over: Partial<Insight> & { id: string }): Insight => ({
  title: "An idea",
  status: "proposal",
  score: 8,
  dimensions: {
    impact: dimension,
    relevance: dimension,
    ease: dimension,
    maturity: dimension,
    fit: dimension,
  },
  sources: [],
  citesFederation: [],
  firstProposed: "2026-09-01",
  lastAssessed: "2026-09-20",
  runs: 1,
  missedRuns: 0,
  report: `insights/${over.id}.md`,
  cite_as: `example:${over.id}`,
  ...over,
});

const makeLedger = (items: Insight[]): InsightsLedger => ({
  schemaVersion: "insights-ledger-v1",
  domain: "example",
  updatedAt: "2026-09-20T00:00:00Z",
  items,
});

describe("refuseTransition", () => {
  it("holds the lifecycle table", () => {
    expect(refuseTransition("implemented", "accepted", {})).toContain(
      "cannot become",
    );
    expect(refuseTransition("proposal", "implemented", {})).toContain(
      "cannot become",
    );
  });

  it("asks for the evidence each transition needs", () => {
    expect(refuseTransition("proposal", "accepted", {})).toContain("decision");
    expect(refuseTransition("proposal", "rejected", {})).toContain("reason");
    expect(refuseTransition("accepted", "implemented", {})).toContain("commit");
    expect(
      refuseTransition("proposal", "accepted", { decision: "dec-1" }),
    ).toBeNull();
  });
});

describe("selectInsights", () => {
  const ledger = makeLedger([
    makeInsight({ id: "a", score: 9 }),
    makeInsight({ id: "b", score: 6 }),
    makeInsight({ id: "c", status: "rejected", score: 9 }),
    makeInsight({
      id: "d",
      status: "accepted",
      score: 7,
      lastAssessed: "2026-08-01",
    }),
  ]);

  it("defaults to open proposals and accepted at or above the threshold", () => {
    expect(selectInsights(ledger, 7).map((i) => i.id)).toEqual(["a", "d"]);
  });

  it("widens by option, never by default", () => {
    expect(
      selectInsights(ledger, 7, { status: "all", minScore: 0 }).map(
        (i) => i.id,
      ),
    ).toEqual(["a", "c", "d", "b"]);
    expect(
      selectInsights(ledger, 7, { since: "2026-09-01" }).map((i) => i.id),
    ).toEqual(["a"]);
  });
});

describe("reportPathWithin", () => {
  it("resolves only a markdown path the ledger names inside insights/", () => {
    expect(reportPathWithin(makeInsight({ id: "x" }))).toBe("insights/x.md");
    expect(
      reportPathWithin(makeInsight({ id: "x", report: "./insights/x.md" })),
    ).toBe("insights/x.md");
    for (const report of [
      "",
      "insights/../secrets.md",
      "/etc/anything.md",
      "elsewhere/x.md",
      "insights/x.txt",
    ]) {
      expect(
        reportPathWithin(makeInsight({ id: "x", report })),
        report,
      ).toBeNull();
    }
  });
});

describe("gitPendingItems", () => {
  it("derives the two items every repository shares", () => {
    expect(
      gitPendingItems("example", { uncommitted: 0, hasRemote: true }),
    ).toEqual([]);
    const items = gitPendingItems("example", {
      uncommitted: 2,
      hasRemote: false,
    });
    expect(items.map((i) => i.id)).toEqual([
      "example:pending/fix/uncommitted",
      "example:pending/decide/no-remote",
    ]);
  });
});

describe("the file-backed reads", () => {
  const reads = createImprovementReads({ domainId: "example", threshold: 7 });

  it("treats absent as an answer", async () => {
    const root = await mkdtemp(join(tmpdir(), "kit-imp-"));
    const insights = await reads.listInsights(root, "now");
    expect(insights["total"]).toBe(0);
    expect(String(insights["detail"])).toContain("has not visited");
    const updates = await reads.listUpdates(root, "now");
    expect(updates["items"]).toEqual([]);
  });

  it("serves the ledger, the live updates and one report's body", async () => {
    const root = await mkdtemp(join(tmpdir(), "kit-imp-"));
    await mkdir(join(root, "insights"), { recursive: true });
    await writeFile(
      join(root, "insights", "ledger.json"),
      JSON.stringify(makeLedger([makeInsight({ id: "a" })])),
      "utf8",
    );
    await writeFile(
      join(root, "insights", "updates.json"),
      JSON.stringify({
        domain: "example",
        generatedAt: "2026-09-20T00:00:00Z",
        items: [
          {
            id: "u1",
            package: "left-pad",
            installed: "1.0.0",
            latest: "2.0.0",
            severity: "major",
            status: "open",
            firstSeen: "2026-09-01",
            lastSeen: "2026-09-20",
          },
          {
            id: "u2",
            package: "gone-pkg",
            installed: "1.0.0",
            latest: "1.0.0",
            severity: "patch",
            status: "gone",
            firstSeen: "2026-09-01",
            lastSeen: "2026-09-20",
          },
        ],
      }),
      "utf8",
    );
    await writeFile(join(root, "insights", "a.md"), "# The case\n", "utf8");

    const insights = await reads.listInsights(root, "now");
    expect(insights["total"]).toBe(1);
    const updates = await reads.listUpdates(root, "now");
    expect((updates["items"] as unknown[]).length).toBe(1);

    const report = await reads.getInsightReport(root, "a", "now");
    expect(report.found).toBe(true);
    expect(report.body).toBe("# The case\n");

    const missing = await reads.getInsightReport(root, "nope", "now");
    expect(missing.found).toBe(false);
  });
});

describe("transitionInsight", () => {
  const seed = async (): Promise<string> => {
    const root = await mkdtemp(join(tmpdir(), "kit-tr-"));
    await mkdir(join(root, "insights"), { recursive: true });
    await writeFile(
      join(root, "insights", "ledger.json"),
      JSON.stringify(makeLedger([makeInsight({ id: "a" })])),
      "utf8",
    );
    return root;
  };

  it("refuses an accept with no decision entry", async () => {
    const root = await seed();
    const result = await transitionInsight(root, {
      requestId: "req-12345678",
      id: "a",
      to: "accepted",
    });
    expect(result.accepted).toBe(false);
    if (!result.accepted) expect(result.code).toBe("NOT_ALLOWED");
  });

  it("accepts with a decision, writes the ledger, logs, and replays", async () => {
    const root = await seed();
    const input = {
      requestId: "req-12345678",
      id: "a",
      to: "accepted",
      decision: "decisions/2026-09-21-keep.md",
    };
    const result = await transitionInsight(root, input, "2026-09-21T00:00:00Z");
    expect(result.accepted).toBe(true);
    expect(result.replayed).toBe(false);

    const ledger = JSON.parse(
      await readFile(join(root, "insights", "ledger.json"), "utf8"),
    ) as InsightsLedger;
    expect(ledger.items[0]?.status).toBe("accepted");
    expect(ledger.updatedAt).toBe("2026-09-21T00:00:00Z");

    const log = await readAuditLog(root);
    expect(log.length).toBe(1);
    expect(log[0]?.outcome).toBe("accepted");

    const replay = await transitionInsight(root, input);
    expect(replay.replayed).toBe(true);
    expect(await readAuditLog(root)).toHaveLength(1);
  });

  it("rejects an unknown insight by name", async () => {
    const root = await seed();
    const result = await transitionInsight(root, {
      requestId: "req-00000000",
      id: "ghost",
      to: "rejected",
      reason: "no",
    });
    expect(result.accepted).toBe(false);
    if (!result.accepted) expect(result.code).toBe("UNKNOWN_INSIGHT");
  });
});
