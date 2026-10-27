#!/usr/bin/env tsx
/** The MCP server, local stdio entrypoint. stdout carries the protocol; diagnostics go to stderr. */
import { serveMcpStdio } from "@alanos/domain-kit";
import { createMcpServer } from "./server.js";

serveMcpStdio(() => createMcpServer({ repositoryRoot: process.cwd() }), {
  onerror: (error) => {
    console.error(`__REPO_NAME__ MCP server error: ${error.stack ?? error.message}`);
  },
});
console.error("__REPO_NAME__ MCP server ready (stdio)");
