#!/usr/bin/env tsx
/** The MCP server, local stdio entrypoint. stdout carries the protocol; diagnostics go to stderr. */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { connectMcpServer, createMcpServer } from "./server.js";

async function main(): Promise<void> {
  const server = createMcpServer({ repositoryRoot: process.cwd() });
  await connectMcpServer(server, new StdioServerTransport());
  console.error("__REPO_NAME__ MCP server ready (stdio)");
}

main().catch((error: unknown) => {
  console.error(
    `__REPO_NAME__ MCP server crashed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
  process.exit(1);
});
