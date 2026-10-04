/**
 * The domain status standard's response shape, exactly (constitution STA-1 to
 * STA-3). `down` is never returned: that is what a caller concludes from a
 * surface that does not answer. Detail says what is impaired, never where.
 */
export interface DomainStatus {
  readonly domain: string;
  readonly status: "ok" | "degraded";
  readonly contractVersion: string;
  readonly manifestVersion: number;
  readonly lastKnowledgeUpdate: string | null;
  readonly detail: string | null;
}

/** `${n} recording is` / `${n} recordings are`: the standard's counting voice. */
export const countNoun = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

/**
 * Compose the standard response from the domain's own problem list. The
 * domain decides what is a problem; this only keeps the shape in one place.
 */
export function composeStatus(args: {
  readonly domain: string;
  readonly contractVersion: string;
  readonly manifestVersion: number;
  readonly lastKnowledgeUpdate: string | null;
  readonly problems: readonly string[];
}): DomainStatus {
  return {
    domain: args.domain,
    status: args.problems.length === 0 ? "ok" : "degraded",
    contractVersion: args.contractVersion,
    manifestVersion: args.manifestVersion,
    lastKnowledgeUpdate: args.lastKnowledgeUpdate,
    detail: args.problems.length === 0 ? null : args.problems.join("; "),
  };
}
