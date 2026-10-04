import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { connectMcpServer, createMcpServer } from "../src/mcp/server.js";
import type { McpToolDefinition } from "../src/mcp/tool.js";

interface Ctx {
  readonly greeting: string;
}

const TOOLS: readonly McpToolDefinition<Ctx>[] = [
  {
    name: "get_status",
    kind: "read",
    description:
      "The status standard's first read: declared to take no arguments, so it must be callable with none.",
    inputShape: {},
    servesEvidenceContent: false,
    handler: (context) => ({ status: "ok", greeting: context.greeting }),
  },
  {
    name: "list_things",
    kind: "read",
    description:
      "A read whose inputs are all optional, which the wire must accept without an arguments field at all.",
    inputShape: { limit: z.number().int().positive().optional() },
    servesEvidenceContent: false,
    handler: (_context, input) => ({
      items: [],
      limit: (input as { limit?: number }).limit ?? null,
    }),
  },
  {
    name: "record_thing",
    kind: "action",
    description:
      "An action that validates and rejects with a structured error the caller can read.",
    inputShape: { requestId: z.string().min(8), value: z.string() },
    servesEvidenceContent: false,
    handler: (_context, input) => {
      const { requestId, value } = input as {
        requestId: string;
        value: string;
      };
      return value.trim() === ""
        ? {
            accepted: false,
            requestId,
            code: "EMPTY_VALUE",
            message: "value is empty",
          }
        : { accepted: true, requestId };
    },
  },
];

/** Over the real MCP wire, not around it (constitution FED-5). */
let client: Client;

beforeAll(async () => {
  const server = createMcpServer(
    { greeting: "hello" },
    { name: "kit-under-test", version: "0.0.0", tools: TOOLS },
  );
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([
    connectMcpServer(server, serverTransport),
    client.connect(clientTransport),
  ]);
});

const call = async (name: string, args?: Record<string, unknown>) => {
  const result = await client.callTool(
    args === undefined ? { name } : { name, arguments: args },
  );
  return { result, body: result.structuredContent as Record<string, unknown> };
};

describe("the server bootstrap", () => {
  it("offers every tool, each described", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      TOOLS.map((t) => t.name).sort(),
    );
    expect(tools.every((t) => (t.description ?? "").length > 40)).toBe(true);
  });

  it("answers a no-argument tool with no arguments at all", async () => {
    const { result, body } = await call("get_status");
    expect(result.isError).toBeFalsy();
    expect(body["status"]).toBe("ok");
    expect(body["greeting"]).toBe("hello");
  });

  it("answers an all-optional tool with no arguments field (the wire fix)", async () => {
    const { result, body } = await call("list_things");
    expect(result.isError).toBeFalsy();
    expect(body["limit"]).toBeNull();
    const given = await call("list_things", { limit: 3 });
    expect(given.body["limit"]).toBe(3);
  });

  it("flags a structured rejection as an error without losing its shape", async () => {
    const { result, body } = await call("record_thing", {
      requestId: "req-12345678",
      value: "",
    });
    expect(result.isError).toBe(true);
    expect(body["code"]).toBe("EMPTY_VALUE");
    expect(body["requestId"]).toBe("req-12345678");
  });

  it("accepts a valid action and keeps the handler's shape", async () => {
    const { result, body } = await call("record_thing", {
      requestId: "req-87654321",
      value: "kept",
    });
    expect(result.isError).toBeFalsy();
    expect(body["accepted"]).toBe(true);
  });

  it("turns a thrown error into an error result, not a dead call", async () => {
    const throwing: McpToolDefinition<Record<string, never>> = {
      name: "explode",
      kind: "read",
      description: "A tool whose handler throws, for the error path.",
      inputShape: {},
      servesEvidenceContent: false,
      handler: () => {
        throw new Error("boom");
      },
    };
    const server = createMcpServer(
      {},
      { name: "throwing", version: "0.0.0", tools: [throwing] },
    );
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const local = new Client({ name: "test", version: "0.0.0" });
    await Promise.all([
      connectMcpServer(server, serverTransport),
      local.connect(clientTransport),
    ]);
    const result = await local.callTool({ name: "explode" });
    expect(result.isError).toBe(true);
  });
});
