/**
 * The improvement reads (constitution IMP-1). Each is a projection over
 * something the domain already holds; none calls a model and none writes.
 */
import { createImprovementReads } from "@alanos/domain-kit";
import { DOMAIN_ID } from "../domain/contract.js";
import {
  INSIGHTS_THRESHOLD,
  type ListInsightsOptions,
  type PendingItem,
} from "../domain/improvement.js";
import { hasRemote, uncommitted } from "./git-commit.js";

const reads = createImprovementReads({
  domainId: DOMAIN_ID,
  threshold: INSIGHTS_THRESHOLD,
});

export interface PendingState {
  readonly uncommitted: number | null;
  readonly hasRemote: boolean | null;
}

/** Derived, never stored. An item exists exactly as long as the state behind it. */
export function pendingItems(state: PendingState): PendingItem[] {
  const items: PendingItem[] = [];
  if (state.uncommitted !== null && state.uncommitted > 0) {
    const n = state.uncommitted;
    items.push({
      id: `${DOMAIN_ID}:pending/fix/uncommitted`,
      kind: "fix",
      summary: `${n} ${n === 1 ? "file" : "files"} this domain wrote ${n === 1 ? "is" : "are"} not committed`,
      since: null,
      resolveVia: "pnpm commit",
    });
  }
  if (state.hasRemote === false) {
    items.push({
      id: `${DOMAIN_ID}:pending/decide/no-remote`,
      kind: "decide",
      summary:
        "This repository has no remote, so its only copy is this machine",
      since: null,
      resolveVia: "publish it, then push when you choose",
    });
  }
  return items;
}

export async function readPendingGit(root: string): Promise<PendingState> {
  return {
    uncommitted: await uncommitted(root),
    hasRemote: await hasRemote(root),
  };
}

export const listUpdates = (root: string, now: string) =>
  reads.listUpdates(root, now);

export const listInsights = (
  root: string,
  now: string,
  options: ListInsightsOptions = {},
) => reads.listInsights(root, now, options);

export const getInsightReport = (root: string, id: string, now: string) =>
  reads.getInsightReport(root, id, now);
