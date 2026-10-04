/**
 * The Alan OS domain improvement standard (v1): shapes and pure functions
 * over records the runtime's improvement run and dependency audit leave in
 * `insights/`. The ledger is judged elsewhere: the weekly run proposes and
 * reconciles, the owner accepts or rejects, code keeps the books. A domain
 * reads it back and applies its own threshold; the threshold, the brief path
 * and the watch list are the domain's own and never live here.
 */
import { z } from "zod";

export const INSIGHT_STATUSES = [
  "proposal",
  "accepted",
  "implemented",
  "rejected",
  "superseded",
  "dormant",
] as const;

export type InsightStatus = (typeof INSIGHT_STATUSES)[number];

const DimensionScoreSchema = z.object({
  score: z.number().min(0).max(10),
  reason: z.string(),
});

/**
 * One insight as the improvement run writes it. Parsed loosely on purpose:
 * the ledger is the runtime's file, and a field a domain does not read must
 * not make a valid ledger unreadable.
 */
export const InsightSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    status: z.enum(INSIGHT_STATUSES),
    score: z.number().min(0).max(10),
    dimensions: z.object({
      impact: DimensionScoreSchema,
      relevance: DimensionScoreSchema,
      ease: DimensionScoreSchema,
      maturity: DimensionScoreSchema,
      fit: DimensionScoreSchema,
    }),
    sources: z
      .array(z.object({ title: z.string(), url: z.string() }))
      .default([]),
    citesFederation: z.array(z.string()).default([]),
    firstProposed: z.string(),
    lastAssessed: z.string(),
    runs: z.number().int().nonnegative().default(1),
    missedRuns: z.number().int().nonnegative().default(0),
    report: z.string(),
    cite_as: z.string().min(1),
  })
  .passthrough();

export type Insight = z.infer<typeof InsightSchema>;

export const InsightsLedgerSchema = z
  .object({
    schemaVersion: z.literal("insights-ledger-v1"),
    domain: z.string().min(1),
    updatedAt: z.string(),
    items: z.array(InsightSchema),
  })
  .passthrough();

export type InsightsLedger = z.infer<typeof InsightsLedgerSchema>;

/** The `list_updates` result the runtime's dependency audit leaves here. */
export const UpdatesFileSchema = z
  .object({
    domain: z.string().min(1),
    generatedAt: z.string(),
    items: z.array(
      z
        .object({
          id: z.string().min(1),
          package: z.string().min(1),
          installed: z.string(),
          latest: z.string(),
          severity: z.enum(["security", "engine", "major", "minor", "patch"]),
          status: z.enum(["open", "accepted", "gone"]),
          firstSeen: z.string(),
          lastSeen: z.string(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export type UpdatesFile = z.infer<typeof UpdatesFileSchema>;

/** What the owner is being asked for. The standard's four kinds. */
export type PendingKind = "approve" | "decide" | "provide" | "fix";

export interface PendingItem {
  readonly id: string;
  readonly kind: PendingKind;
  readonly summary: string;
  readonly since: string | null;
  readonly cite_as?: string;
  readonly resolveVia: string;
}

export interface ListInsightsOptions {
  /** One status, or `all`. Default: `proposal` and `accepted`. */
  readonly status?: InsightStatus | "all" | undefined;
  /** Lower bound on the computed score. Default: the domain's threshold. */
  readonly minScore?: number | undefined;
  /** Only insights assessed on or after this date (YYYY-MM-DD). */
  readonly since?: string | undefined;
}

/**
 * Which transitions the lifecycle allows (domain improvement standard v1).
 *
 * Stated here rather than checked in the handler because it is the rule, and
 * a rule written where only one caller can see it is half a rule. The
 * runtime's `pnpm improve accept` enforces the same table over the same
 * ledger; this is the domain enforcing it for every other caller.
 */
export const ALLOWED_TRANSITIONS: Readonly<
  Record<InsightStatus, readonly InsightStatus[]>
> = {
  proposal: ["accepted", "rejected", "superseded", "dormant"],
  dormant: ["proposal", "accepted", "rejected", "superseded"],
  accepted: ["implemented", "rejected"],
  implemented: [],
  rejected: ["proposal"],
  superseded: ["proposal"],
};

/** What an owner may ask for over MCP. `superseded` and `dormant` are the run's to set, not his. */
export const OWNER_TRANSITIONS = [
  "accepted",
  "rejected",
  "implemented",
] as const;
export type OwnerTransition = (typeof OWNER_TRANSITIONS)[number];

export interface TransitionEvidence {
  /** Required to accept: the decision entry this insight will cite back to. */
  readonly decision?: string | undefined;
  /** Required to reject. */
  readonly reason?: string | undefined;
  /** Required to mark implemented. */
  readonly commit?: string | undefined;
}

/**
 * Why a transition cannot happen, or null.
 *
 * Accepting is a decision: the standard says a decision entry exists before
 * an accepted insight is implemented, and an accept with nothing written
 * down is the one that quietly becomes "why is this here" in six months.
 * Rejecting needs a reason for the same reason, and `implemented` needs the
 * commit that makes the claim checkable.
 */
export function refuseTransition(
  from: InsightStatus,
  to: OwnerTransition,
  evidence: TransitionEvidence,
): string | null {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    return `it is ${from}, and ${from} cannot become ${to}`;
  }
  if (to === "accepted" && (evidence.decision ?? "").trim() === "") {
    return "accepting is a decision: name the decision entry this insight cites back to";
  }
  if (to === "rejected" && (evidence.reason ?? "").trim() === "") {
    return "rejecting needs a reason, which stays in the history";
  }
  if (to === "implemented" && (evidence.commit ?? "").trim() === "") {
    return "implemented needs the commit that did it";
  }
  return null;
}

/** Kept here so the guard below and the reader agree on one spelling. */
export const INSIGHTS_DIR_NAME = "insights";

/**
 * The report path an insight names, resolved against `insights/`, or null.
 *
 * Only a path the ledger itself names is resolvable, and only inside
 * `insights/`. A caller handing in a path is how a read of one file becomes
 * a read of any file, and a domain repository holds the owner's evidence.
 */
export function reportPathWithin(insight: Insight): string | null {
  const declared = insight.report.trim();
  if (declared === "") return null;
  const normalised = declared.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalised.includes("..") || normalised.startsWith("/")) return null;
  if (!normalised.startsWith(`${INSIGHTS_DIR_NAME}/`)) return null;
  if (!normalised.endsWith(".md")) return null;
  return normalised;
}

/**
 * The standard's default view: open proposals and accepted insights at or
 * above the threshold, highest score first. Every option widens; the ledger
 * is always reachable in full.
 */
export function selectInsights(
  ledger: InsightsLedger,
  threshold: number,
  options: ListInsightsOptions = {},
): Insight[] {
  const min = options.minScore ?? threshold;
  const statuses: readonly InsightStatus[] =
    options.status === undefined
      ? ["proposal", "accepted"]
      : options.status === "all"
        ? INSIGHT_STATUSES
        : [options.status];
  return ledger.items
    .filter(
      (item) =>
        statuses.includes(item.status) &&
        item.score >= min &&
        (options.since === undefined ||
          item.lastAssessed.slice(0, 10) >= options.since),
    )
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
