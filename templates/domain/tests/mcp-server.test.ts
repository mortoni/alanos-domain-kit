import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeAll, describe, expect, it } from "vitest";
import { DOMAIN_CONTRACT_VERSION } from "../src/domain/contract.js";
import { connectMcpServer, createMcpServer } from "../src/mcp/server.js";
import { MCP_TOOLS } from "../src/mcp/tools.js";

/** Over the real MCP wire, not around it (constitution FED-5). */
let client: Client;

beforeAll(async () => {
  const root = await mkdtemp(join(tmpdir(), "domain-"));
  const server = createMcpServer({ repositoryRoot: root });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([
    connectMcpServer(server, serverTransport),
    client.connect(clientTransport),
  ]);
});

describe("the running server", () => {
  it("offers every tool, each described", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      MCP_TOOLS.map((t) => t.name).sort(),
    );
    expect(tools.every((t) => (t.description ?? "").length > 40)).toBe(true);
  });

  it("answers the standard reads with no arguments at all (constitution CAP-6)", async () => {
    for (const name of [
      "get_status",
      "list_pending",
      "list_updates",
      "list_insights",
    ]) {
      const result = await client.callTool({ name });
      expect(result.isError, name).toBeFalsy();
    }
    const status = await client.callTool({ name: "get_status" });
    expect(
      (status.structuredContent as { contractVersion: string }).contractVersion,
    ).toBe(DOMAIN_CONTRACT_VERSION);
  });
});
