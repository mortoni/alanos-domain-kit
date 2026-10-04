import type { z } from "zod";

/**
 * One MCP tool as a domain declares it. The manifest is emitted from this
 * registry, never written beside it, so the published contract cannot
 * disagree with the server.
 */
export interface McpToolDefinition<TContext> {
  readonly name: string;
  /** A read or an action (constitution CAP-2). */
  readonly kind: "read" | "action";
  readonly description: string;
  readonly inputShape: z.ZodRawShape;
  /** True when the tool can return evidence content. Local surfaces only. */
  readonly servesEvidenceContent: boolean;
  /** Constitution CAP-8: never offered to a routing model. */
  readonly withheldFromModels?: true;
  readonly handler: (
    context: TContext,
    input: unknown,
  ) => unknown | Promise<unknown>;
}
