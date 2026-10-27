import type { McpServer } from "@modelcontextprotocol/server";
import {
  connectMcpServer,
  createMcpServer as kitCreateMcpServer,
  type McpSurface,
} from "@alanos/domain-kit";
import { SERVER_VERSION } from "../domain/contract.js";
import type { McpContext } from "./context.js";
import { MCP_TOOLS, type McpToolDefinition } from "./tools.js";

export const MCP_SERVER_NAME = "__REPO_NAME__";

export type { McpSurface };
export { connectMcpServer };

export interface CreateMcpServerOptions {
  readonly tools?: readonly McpToolDefinition[];
  readonly surface?: McpSurface;
}

/** The MCP interface. The wire is @alanos/domain-kit's; the name, version and tools are this domain's. */
export function createMcpServer(
  context: McpContext,
  options: CreateMcpServerOptions = {},
): McpServer {
  return kitCreateMcpServer(context, {
    name: MCP_SERVER_NAME,
    version: SERVER_VERSION,
    tools: options.tools ?? MCP_TOOLS,
    ...(options.surface !== undefined ? { surface: options.surface } : {}),
  });
}
