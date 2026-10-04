/**
 * `transition_insight`: the owner deciding, over MCP.
 *
 * An ordinary tool, a request id on every call, validate then accept or
 * reject with a structured error, and every outcome logged append-only by
 * the domain (orchestrator contract 5). Without it, anything outside the
 * repository could only change the ledger by writing the domain's files,
 * which is the one thing an application layer must never do (FED-11).
 *
 * What it will not do: set `superseded` or `dormant`. Those are the weekly
 * run's conclusions about whether an idea still applies, not the owner's
 * decision about whether he wants it, and an owner-facing action that could
 * write them would let a caller fake the run's judgement.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  appendAuditRecord,
  findByRequestId,
  readAuditLog,
} from "../audit/log.js";
import {
  INSIGHTS_DIR_NAME,
  OWNER_TRANSITIONS,
  refuseTransition,
  type Insight,
  type InsightsLedger,
} from "./standard.js";
import { readInsightsLedger } from "./reads.js";

export const TRANSITION_ACTION = "transition_insight";

export const TransitionInsightInputSchema = z
  .object({
    requestId: z.string().min(8),
    id: z.string().min(1),
    to: z.enum(OWNER_TRANSITIONS),
    decision: z.string().optional(),
    reason: z.string().optional(),
    commit: z.string().optional(),
    /** Who decided. The owner by default; an executor names itself. */
    by: z.string().min(1).default("owner"),
  })
  .strict();

export interface TransitionAccepted {
  readonly accepted: true;
  readonly requestId: string;
  readonly id: string;
  readonly status: string;
  readonly cite_as: string;
  readonly replayed: boolean;
}

export interface TransitionRejected {
  readonly accepted: false;
  readonly requestId: string;
  readonly code: "NO_LEDGER" | "UNKNOWN_INSIGHT" | "AMBIGUOUS" | "NOT_ALLOWED";
  readonly message: string;
  readonly replayed: boolean;
}

export type TransitionResult = TransitionAccepted | TransitionRejected;

function ledgerPath(repositoryRoot: string): string {
  return join(repositoryRoot, INSIGHTS_DIR_NAME, "ledger.json");
}

export async function transitionInsight(
  repositoryRoot: string,
  input: unknown,
  now = new Date().toISOString(),
): Promise<TransitionResult> {
  const parsed = TransitionInsightInputSchema.parse(input);
  const { requestId, id, to, by } = parsed;

  // A repeat is answered from the log, not by deciding again. The caller may
  // retry as often as it likes; the history sees one transition.
  const log = await readAuditLog(repositoryRoot);
  const previous = findByRequestId(log, TRANSITION_ACTION, requestId);
  if (previous !== undefined) {
    return {
      ...(previous.result as unknown as TransitionResult),
      replayed: true,
    };
  }

  const record = async (result: TransitionResult): Promise<void> => {
    const { replayed: _ignored, ...stored } = result;
    await appendAuditRecord(repositoryRoot, {
      at: now,
      action: TRANSITION_ACTION,
      requestId,
      outcome: result.accepted ? "accepted" : "rejected",
      result: stored as unknown as Record<string, unknown>,
    });
  };

  const reject = async (
    code: TransitionRejected["code"],
    message: string,
  ): Promise<TransitionRejected> => {
    const result: TransitionRejected = {
      accepted: false,
      requestId,
      code,
      message,
      replayed: false,
    };
    await record(result);
    return result;
  };

  const ledger: InsightsLedger | null =
    await readInsightsLedger(repositoryRoot);
  if (ledger === null) {
    return reject(
      "NO_LEDGER",
      "No insights ledger on file; the weekly improvement run has not visited this repository yet.",
    );
  }

  const matches = ledger.items.filter(
    (item) => item.id === id.trim() || item.id.endsWith(`/${id.trim()}`),
  );
  if (matches.length > 1) {
    return reject(
      "AMBIGUOUS",
      `"${id}" matches ${matches.length} insights. Use the full id.`,
    );
  }
  const insight: Insight | undefined = matches[0];
  if (insight === undefined) {
    return reject(
      "UNKNOWN_INSIGHT",
      `No insight ${id} in this domain's ledger. list_insights with status "all" shows every id.`,
    );
  }

  const refusal = refuseTransition(insight.status, to, parsed);
  if (refusal !== null) {
    return reject(
      "NOT_ALLOWED",
      `${insight.id} cannot become ${to}: ${refusal}`,
    );
  }

  // The record is append-only in spirit: status moves, history grows,
  // nothing that was true before is erased. `history` is a passthrough
  // field: the runtime writes it, the domain does not type it, and neither
  // should erase it.
  const existing = (insight as unknown as { history?: unknown }).history;
  const history: unknown[] = Array.isArray(existing) ? [...existing] : [];
  history.push({
    at: now,
    by,
    event: to,
    reason: parsed.reason ?? parsed.decision ?? parsed.commit,
  });
  const updated: Insight = {
    ...insight,
    status: to,
    ...(parsed.decision !== undefined
      ? { decision: parsed.decision.trim() }
      : {}),
    ...(parsed.commit !== undefined ? { commit: parsed.commit.trim() } : {}),
    history,
  } as Insight;

  const next: InsightsLedger = {
    ...ledger,
    updatedAt: now,
    items: ledger.items.map((item) =>
      item.id === insight.id ? updated : item,
    ),
  };
  await writeFile(
    ledgerPath(repositoryRoot),
    `${JSON.stringify(next, null, 2)}\n`,
    "utf8",
  );

  const result: TransitionAccepted = {
    accepted: true,
    requestId,
    id: insight.id,
    status: to,
    cite_as: insight.cite_as,
    replayed: false,
  };
  await record(result);
  return result;
}
