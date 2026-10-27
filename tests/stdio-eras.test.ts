import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { describe, expect, it } from "vitest";

/**
 * A domain served through serveMcpStdio must answer both protocol eras over
 * a real stdio pipe: 2025-era clients (today's runtime, Claude Code) and
 * 2026-07-28 clients. Runs against the built dist, so `pnpm check` builds
 * before it tests.
 */
const server = fileURLToPath(
  new URL("./fixtures/stdio-server.mjs", import.meta.url),
);

const connect = async (pinModern: boolean): Promise<Client> => {
  const client = new Client(
    { name: "eras-test", version: "0.0.0" },
    pinModern
      ? { versionNegotiation: { mode: { pin: "2026-07-28" } } }
      : undefined,
  );
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: [server] }),
  );
  return client;
};

describe.each([
  ["a 2025-era client", false, "2025-11-25"],
  ["a 2026-07-28 client", true, "2026-07-28"],
])("serveMcpStdio, %s", (_label, pinModern, version) => {
  it("negotiates the era, lists, and calls without arguments", async () => {
    const client = await connect(pinModern);
    try {
      expect(client.getNegotiatedProtocolVersion()).toBe(version);
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name).sort()).toEqual([
        "get_status",
        "list_things",
      ]);
      const status = await client.callTool({ name: "get_status" });
      expect(status.structuredContent).toEqual({ status: "ok" });
      const things = await client.callTool({ name: "list_things" });
      expect(things.isError).toBeFalsy();
      expect(things.structuredContent).toEqual({ limit: null });
    } finally {
      await client.close();
    }
  });
});
