/**
 * A domain-shaped stdio server for tests/stdio-eras.test.ts, served exactly
 * as a domain entrypoint serves itself. Runs from the built dist.
 */
import { createMcpServer, serveMcpStdio } from "../../dist/index.js";
import { z } from "zod";

const TOOLS = [
  {
    name: "get_status",
    kind: "read",
    description: "Takes no arguments.",
    inputShape: {},
    servesEvidenceContent: false,
    handler: () => ({ status: "ok" }),
  },
  {
    name: "list_things",
    kind: "read",
    description: "Every input optional.",
    inputShape: { limit: z.number().int().positive().optional() },
    servesEvidenceContent: false,
    handler: (_context, input) => ({ limit: input.limit ?? null }),
  },
];

serveMcpStdio(() =>
  createMcpServer(
    {},
    { name: "eras-under-test", version: "0.0.0", tools: TOOLS },
  ),
);
