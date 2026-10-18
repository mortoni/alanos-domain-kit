import { z } from "zod";
import type { McpToolDefinition as KitToolDefinition } from "@alanos/domain-kit";
import { AUDIT_LOG } from "../application/audit-log.js";
import { domainStatus } from "../application/domain-status.js";
import {
  commitPaths,
  commitPending,
  listChanges,
} from "../application/git-commit.js";
import {
  getInsightReport,
  listInsights,
  listUpdates,
  pendingItems,
  readPendingGit,
} from "../application/improvement-reads.js";
import { transitionInsight } from "../application/transition-insight.js";
import { DOMAIN_ID } from "../domain/contract.js";
import {
  INSIGHTS_DIR_NAME,
  INSIGHT_STATUSES,
  OWNER_TRANSITIONS,
} from "../domain/improvement.js";
import type { McpContext } from "./context.js";

/** One MCP tool as this domain declares it; the shape is the kit's (constitution CAP-2, CAP-8). */
export type McpToolDefinition = KitToolDefinition<McpContext>;

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

const requestId = z
  .string()
  .min(8)
  .describe(
    "A unique id for this call. Retry with the same id and you get the same answer.",
  );

export const MCP_TOOLS: readonly McpToolDefinition[] = [
  {
    name: "get_status",
    kind: "read",
    description:
      "Report whether this domain is ok or degraded, with detail. Standard capability defined by the domain status standard, so callers can surface federation health before a question costs anything.",
    inputShape: {},
    servesEvidenceContent: false,
    handler: () => domainStatus(),
  },
  {
    name: "list_pending",
    kind: "read",
    description:
      "What this domain needs its owner for: files it wrote and did not commit, and a repository with no remote. Derived from state on every call; each item says how to clear it. Standard Alan OS improvement read.",
    inputShape: {},
    servesEvidenceContent: false,
    handler: async (context) => ({
      domain: DOMAIN_ID,
      generatedAt: new Date().toISOString(),
      items: pendingItems(await readPendingGit(context.repositoryRoot)),
    }),
  },
  {
    name: "list_updates",
    kind: "read",
    description:
      "What has moved underneath this domain: outdated packages, security advisories and engine constraints, as the federation's nightly dependency audit last recorded them for this repository. Deterministic, no model and no rubric. Standard Alan OS improvement read.",
    inputShape: {},
    servesEvidenceContent: false,
    handler: (context) =>
      listUpdates(context.repositoryRoot, new Date().toISOString()),
  },
  {
    name: "list_insights",
    kind: "read",
    description:
      "Proposals for improving this domain, from the improvement run: each scored with reasons, with sources, a report and a lifecycle the owner controls. With no arguments, open proposals and accepted insights at or above the threshold, highest score first. Standard Alan OS improvement read.",
    inputShape: {
      status: z
        .enum([...INSIGHT_STATUSES, "all"])
        .optional()
        .describe(
          "One lifecycle status, or all. Default: proposal and accepted.",
        ),
      minScore: z
        .number()
        .min(0)
        .max(10)
        .optional()
        .describe("Lower bound on the score."),
      since: date.describe("Only insights assessed on or after this date."),
    },
    servesEvidenceContent: false,
    handler: (context, input) => {
      const options = z
        .object({
          status: z.enum([...INSIGHT_STATUSES, "all"]).optional(),
          minScore: z.number().min(0).max(10).optional(),
          since: date,
        })
        .strict()
        .parse(input ?? {});
      return listInsights(
        context.repositoryRoot,
        new Date().toISOString(),
        options,
      );
    },
  },
  {
    name: "get_insight_report",
    kind: "read",
    description:
      "The full report behind one insight: what it is, why it matters to this domain, what would change, and the plan an executor can follow. Takes the insight id. Standard Alan OS improvement read.",
    inputShape: {
      id: z
        .string()
        .min(1)
        .describe("Insight id, as returned by list_insights."),
    },
    servesEvidenceContent: false,
    handler: (context, input) => {
      const { id } = z
        .object({ id: z.string().min(1) })
        .strict()
        .parse(input);
      return getInsightReport(
        context.repositoryRoot,
        id,
        new Date().toISOString(),
      );
    },
  },
  {
    name: "list_changes",
    kind: "read",
    withheldFromModels: true,
    description:
      "What has changed in this domain's repository and is not committed, for the owner's application: `owned` is what this domain writes and commit_pending would commit, `other` is everything else, which nothing here ever commits. Paths and a status only, never content. Withheld from models (constitution CAP-8, EV-14).",
    inputShape: {},
    servesEvidenceContent: false,
    handler: (context) =>
      listChanges(context.repositoryRoot, new Date().toISOString()),
  },
  {
    name: "transition_insight",
    kind: "action",
    description:
      "Record the owner's decision on one insight: accepted, rejected, or implemented. Accepting requires the decision entry it cites back to, rejecting requires a reason, and implemented requires the commit. Every call carries a request id, and a repeated id returns the original answer. The decision is committed as it is recorded (constitution IMP-3, EV-14).",
    inputShape: {
      requestId,
      id: z
        .string()
        .min(1)
        .describe("Insight id, as returned by list_insights."),
      to: z.enum(OWNER_TRANSITIONS).describe("The status to move to."),
      decision: z.string().optional().describe("Required to accept."),
      reason: z.string().optional().describe("Required to reject."),
      commit: z.string().optional().describe("Required for implemented."),
      by: z.string().optional().describe("Who decided. Defaults to the owner."),
    },
    servesEvidenceContent: false,
    handler: async (context, input) => {
      const result = await transitionInsight(context.repositoryRoot, input);
      if (!result.accepted || result.replayed) return result;
      const commit = await commitPaths(
        context.repositoryRoot,
        [`${INSIGHTS_DIR_NAME}/ledger.json`, AUDIT_LOG],
        `${DOMAIN_ID}: insight ${result.id} ${result.status}\n\nThe owner's decision, recorded by transition_insight (constitution EV-14).`,
      );
      return { ...result, commit };
    },
  },
  {
    name: "commit_pending",
    kind: "action",
    withheldFromModels: true,
    description:
      "The owner committing, from his application, everything this domain wrote and has not committed: the `owned` half of list_changes, and nothing else. Never code, never his own files, never a push. Withheld from models (constitution CAP-8, EV-14).",
    inputShape: { requestId },
    servesEvidenceContent: false,
    handler: (context, input) => commitPending(context.repositoryRoot, input),
  },
];
