/**
 * The Alan OS domain improvement standard, as this domain serves it. The
 * shapes and pure functions are @alanos/domain-kit's; what is this domain's
 * own is its threshold, its brief and what it watches.
 */
export {
  INSIGHTS_DIR_NAME,
  INSIGHT_STATUSES,
  OWNER_TRANSITIONS,
} from "@alanos/domain-kit";
export type { ListInsightsOptions, PendingItem } from "@alanos/domain-kit";

export const INSIGHTS_THRESHOLD = 7;
export const IMPROVEMENT_BRIEF_PATH = "docs/00-brief.md";
export const IMPROVEMENT_WATCH: readonly string[] = [
  "Model Context Protocol specification",
];
