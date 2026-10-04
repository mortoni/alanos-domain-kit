/**
 * The improvement standard's file-backed reads (Alan OS constitution IMP-1):
 * `list_updates`, `list_insights` and `get_insight_report`, each a projection
 * over `insights/`; none calls a model and none writes. `list_pending` stays
 * in the domain, because what a domain is waiting on its owner for is domain
 * state; `gitPendingItems` below covers the two items every repository
 * shares.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  INSIGHTS_DIR_NAME,
  InsightsLedgerSchema,
  UpdatesFileSchema,
  reportPathWithin,
  selectInsights,
  type Insight,
  type InsightsLedger,
  type ListInsightsOptions,
  type PendingItem,
  type UpdatesFile,
} from "./standard.js";

export interface ImprovementReadsOptions {
  readonly domainId: string;
  /** The domain's own bar for `list_insights`. */
  readonly threshold: number;
}

/**
 * Absent is an answer, not an error: the run has not visited yet. Present
 * and unreadable is an error, and says which file, because a ledger that
 * silently reads as empty would tell the owner there is nothing to decide.
 */
async function readJson<T>(
  path: string,
  parse: (value: unknown) => T,
): Promise<T | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw cause;
  }
  return parse(JSON.parse(raw));
}

export const readInsightsLedger = (
  repositoryRoot: string,
): Promise<InsightsLedger | null> =>
  readJson(join(repositoryRoot, INSIGHTS_DIR_NAME, "ledger.json"), (value) =>
    InsightsLedgerSchema.parse(value),
  );

export const readUpdates = (
  repositoryRoot: string,
): Promise<UpdatesFile | null> =>
  readJson(join(repositoryRoot, INSIGHTS_DIR_NAME, "updates.json"), (value) =>
    UpdatesFileSchema.parse(value),
  );

/**
 * The two pending items every repository shares, derived from git state as
 * the domain's commit engine reports it. The domain appends these to its own
 * `list_pending` items.
 */
export function gitPendingItems(
  domainId: string,
  state: {
    readonly uncommitted: number | null;
    readonly hasRemote: boolean | null;
  },
): PendingItem[] {
  const items: PendingItem[] = [];
  if (state.uncommitted !== null && state.uncommitted > 0) {
    const n = state.uncommitted;
    items.push({
      id: `${domainId}:pending/fix/uncommitted`,
      kind: "fix",
      summary: `${n} ${n === 1 ? "file" : "files"} this domain wrote ${n === 1 ? "is" : "are"} not committed`,
      since: null,
      resolveVia: "pnpm commit",
    });
  }
  if (state.hasRemote === false) {
    items.push({
      id: `${domainId}:pending/decide/no-remote`,
      kind: "decide",
      summary:
        "This repository has no remote, so its only copy is this machine",
      since: null,
      resolveVia: "git remote add origin <url>, then push when you choose",
    });
  }
  return items;
}

export interface ListUpdatesResult {
  readonly domain: string;
  readonly generatedAt: string;
  readonly items: readonly UpdatesFile["items"][number][];
  readonly detail: string | null;
}

export interface ListInsightsResult {
  readonly domain: string;
  readonly generatedAt: string;
  readonly ledgerUpdatedAt?: string;
  readonly threshold: number;
  readonly total: number;
  readonly items: readonly Insight[];
  readonly detail: string | null;
}

export interface ImprovementReads {
  readonly listUpdates: (
    repositoryRoot: string,
    now: string,
  ) => Promise<ListUpdatesResult>;
  readonly listInsights: (
    repositoryRoot: string,
    now: string,
    options?: ListInsightsOptions,
  ) => Promise<ListInsightsResult>;
  readonly getInsightReport: (
    repositoryRoot: string,
    id: string,
    now: string,
  ) => Promise<InsightReportResult>;
}

export interface InsightReportResult {
  domain: string;
  generatedAt: string;
  id: string;
  found: boolean;
  title?: string;
  status?: string;
  score?: number;
  cite_as?: string;
  report?: string;
  body?: string;
  detail: string | null;
}

/** The file-backed improvement reads, bound to one domain's id and threshold. */
export function createImprovementReads(
  options: ImprovementReadsOptions,
): ImprovementReads {
  const { domainId, threshold } = options;

  async function listUpdates(
    repositoryRoot: string,
    now: string,
  ): Promise<ListUpdatesResult> {
    const updates = await readUpdates(repositoryRoot);
    if (updates === null) {
      return {
        domain: domainId,
        generatedAt: now,
        items: [],
        detail:
          "No dependency audit result on file for this repository; the runtime's nightly audit (pnpm audit:deps) writes it.",
      };
    }
    return {
      domain: domainId,
      generatedAt: updates.generatedAt,
      items: updates.items.filter((item) => item.status !== "gone"),
      detail: null,
    };
  }

  async function listInsights(
    repositoryRoot: string,
    now: string,
    options: ListInsightsOptions = {},
  ): Promise<ListInsightsResult> {
    const ledger = await readInsightsLedger(repositoryRoot);
    if (ledger === null) {
      return {
        domain: domainId,
        generatedAt: now,
        threshold,
        total: 0,
        items: [],
        detail: `No insights ledger on file; the weekly improvement run (pnpm improve run ${domainId} in the runtime) has not visited this repository yet.`,
      };
    }
    return {
      domain: domainId,
      generatedAt: now,
      ledgerUpdatedAt: ledger.updatedAt,
      threshold,
      total: ledger.items.length,
      items: selectInsights(ledger, threshold, options),
      detail: null,
    };
  }

  /**
   * The body of one insight's report.
   *
   * The ledger is for tools and the report is for the owner: what it is, why
   * it matters here, what would change, and the plan an executor follows.
   *
   * Two guards. The id must be an insight in this domain's own ledger, so
   * the ledger is the index rather than the filesystem. And the path must be
   * one the ledger names, inside `insights/`, ending in `.md`, because a
   * caller handing in a path is how a read of one report becomes a read of
   * any file, and a domain repository holds the owner's evidence.
   */
  async function getInsightReport(
    repositoryRoot: string,
    id: string,
    now: string,
  ): Promise<InsightReportResult> {
    const ledger = await readInsightsLedger(repositoryRoot);
    const wanted = id.trim();
    const insight: Insight | undefined = ledger?.items.find(
      (item) => item.id === wanted || item.id.endsWith(`/${wanted}`),
    );

    if (insight === undefined) {
      return {
        domain: domainId,
        generatedAt: now,
        id: wanted,
        found: false,
        detail:
          ledger === null
            ? "No insights ledger on file; the weekly improvement run has not visited this repository yet."
            : `No insight ${wanted} in this domain's ledger. list_insights with status "all" shows every id.`,
      };
    }

    const relative = reportPathWithin(insight);
    if (relative === null) {
      return {
        domain: domainId,
        generatedAt: now,
        id: insight.id,
        found: true,
        title: insight.title,
        status: insight.status,
        score: insight.score,
        cite_as: insight.cite_as,
        detail: `The ledger names a report this domain will not open (${insight.report}). A report lives under insights/ and ends in .md.`,
      };
    }

    let body: string;
    try {
      body = await readFile(join(repositoryRoot, relative), "utf8");
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          domain: domainId,
          generatedAt: now,
          id: insight.id,
          found: true,
          title: insight.title,
          status: insight.status,
          score: insight.score,
          cite_as: insight.cite_as,
          report: relative,
          detail:
            "The ledger names a report that is not on disk. The run that proposed this insight did not finish writing it.",
        };
      }
      throw cause;
    }

    return {
      domain: domainId,
      generatedAt: now,
      id: insight.id,
      found: true,
      title: insight.title,
      status: insight.status,
      score: insight.score,
      cite_as: insight.cite_as,
      report: relative,
      body,
      detail: null,
    };
  }

  return { listUpdates, listInsights, getInsightReport };
}
