import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { acceptMissingArguments } from "./accept-missing-arguments.js";
import type { McpToolDefinition } from "./tool.js";

const isRejection = (result: unknown): boolean =>
  typeof result === "object" &&
  result !== null &&
  "accepted" in result &&
  (result as { accepted: unknown }).accepted === false;

/**
 * Written as a one-member union rather than a string so a remote surface
 * cannot be requested by accident. Evidence content never leaves the machine
 * through any federated interface (constitution VIS-6, VIS-7), and the type
 * system is a cheaper guard than a review.
 */
export type McpSurface = "mcpLocal";

export interface CreateMcpServerOptions<TContext> {
  /** The server's published name, usually the repository name. */
  readonly name: string;
  readonly version: string;
  readonly tools: readonly McpToolDefinition<TContext>[];
  readonly surface?: McpSurface;
}

/**
 * The MCP interface over the same services the domain's CLI uses. This layer
 * owns wire concerns only: no reads, no filtering, no policy.
 */
export function createMcpServer<TContext>(
  context: TContext,
  options: CreateMcpServerOptions<TContext>,
): McpServer {
  const surface: McpSurface = options.surface ?? "mcpLocal";
  const server = new McpServer({
    name: options.name,
    version: options.version,
  });

  for (const tool of options.tools) {
    // Belt as well as braces: if the surface type is ever widened, this throws
    // at boot rather than quietly serving evidence content to a remote caller.
    if (tool.servesEvidenceContent && surface !== "mcpLocal") {
      throw new Error(
        `${tool.name} serves evidence content and may only be registered on a local surface (constitution VIS-6)`,
      );
    }

    const run = async (input: unknown): Promise<CallToolResult> => {
      try {
        const result = await tool.handler(context, input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result as Record<string, unknown>,
          /**
           * A structured rejection is a real answer, not a broken call, so it
           * keeps its shape. It is also flagged as an error, because a caller
           * that does not read the payload must still notice that nothing was
           * written.
           */
          ...(isRejection(result) ? { isError: true } : {}),
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: error instanceof Error ? error.message : String(error),
            },
          ],
          isError: true,
        };
      }
    };

    /**
     * A tool that takes nothing is registered with no input schema at all.
     *
     * Registering an EMPTY object schema makes the SDK validate the
     * arguments, and a client that calls a no-argument tool without an
     * `arguments` field then gets "expected object, received undefined".
     * `get_status` is the capability every caller reaches for first, and the
     * status standard says it takes no arguments, so failing there would make
     * the domain look down when it is fine.
     */
    if (Object.keys(tool.inputShape).length === 0) {
      server.registerTool(
        tool.name,
        { description: tool.description },
        async (): Promise<CallToolResult> => run({}),
      );
    } else {
      server.registerTool(
        tool.name,
        { description: tool.description, inputSchema: tool.inputShape },
        async (input: unknown): Promise<CallToolResult> => run(input),
      );
    }
  }

  return server;
}

/**
 * Connect the server to a transport.
 *
 * Always through this, never `server.connect` directly, so every surface gets
 * the same tolerance for a client that omits `arguments` on a call whose
 * inputs are all optional. See accept-missing-arguments.ts.
 */
export const connectMcpServer = async (
  server: McpServer,
  transport: Transport,
): Promise<void> => server.connect(acceptMissingArguments(transport));
