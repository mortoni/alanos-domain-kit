import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ManifestProblem,
  emitManifest,
  type ManifestToolLike,
} from "../src/manifest/emit.js";

const TOOLS: readonly ManifestToolLike[] = [
  { name: "get_status", kind: "read", description: "The status read." },
  {
    name: "get_secret",
    kind: "read",
    description: "A read withheld from routing models.",
    withheldFromModels: true,
  },
  { name: "record_thing", kind: "action", description: "The one action." },
];

const BODY = {
  manifestVersion: 1,
  domain: "example",
  contractVersion: "1.16",
  description: "An example domain.",
};

const IMPROVEMENT = {
  brief: "docs/00-brief.md",
  threshold: 7,
  watch: ["a topic to watch"],
};

async function scratch(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "kit-man-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "00-brief.md"), "# Brief\n", "utf8");
  return root;
}

describe("emitManifest", () => {
  it("derives capabilities from the registry and writes the manifest", async () => {
    const root = await scratch();
    const result = await emitManifest({
      repositoryRoot: root,
      body: BODY,
      tools: TOOLS,
      improvement: IMPROVEMENT,
      checkOnly: false,
    });
    expect(result).toMatchObject({ reads: 2, actions: 1, stale: false });

    const manifest = JSON.parse(
      await readFile(join(root, "domain-manifest.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(manifest["domain"]).toBe("example");
    const capabilities = manifest["capabilities"] as {
      read: { name: string; withheldFromModels?: boolean }[];
      action: { name: string }[];
    };
    expect(capabilities.read.map((r) => r.name)).toEqual([
      "get_status",
      "get_secret",
    ]);
    expect(capabilities.read[1]?.withheldFromModels).toBe(true);
    expect(capabilities.action.map((a) => a.name)).toEqual(["record_thing"]);
    expect(manifest["interfaces"]).toEqual({
      mcpLocal: { status: "current", transport: "stdio", auth: "none" },
    });
    expect(manifest["improvement"]).toEqual({
      brief: "docs/00-brief.md",
      threshold: 7,
      watch: ["a topic to watch"],
    });
  });

  it("check mode says stale until the committed manifest is current", async () => {
    const root = await scratch();
    const options = {
      repositoryRoot: root,
      body: BODY,
      tools: TOOLS,
      improvement: IMPROVEMENT,
    };
    expect((await emitManifest({ ...options, checkOnly: true })).stale).toBe(
      true,
    );
    await emitManifest({ ...options, checkOnly: false });
    expect((await emitManifest({ ...options, checkOnly: true })).stale).toBe(
      false,
    );
    await writeFile(join(root, "domain-manifest.json"), "{}\n", "utf8");
    expect((await emitManifest({ ...options, checkOnly: true })).stale).toBe(
      true,
    );
  });

  it("refuses a tool with no description", async () => {
    const root = await scratch();
    await expect(
      emitManifest({
        repositoryRoot: root,
        body: BODY,
        tools: [{ name: "mute", kind: "read", description: "  " }],
        improvement: IMPROVEMENT,
        checkOnly: true,
      }),
    ).rejects.toThrow(ManifestProblem);
  });

  it("refuses a brief the manifest names but the repository lacks", async () => {
    const root = await mkdtemp(join(tmpdir(), "kit-man-"));
    await expect(
      emitManifest({
        repositoryRoot: root,
        body: BODY,
        tools: TOOLS,
        improvement: IMPROVEMENT,
        checkOnly: true,
      }),
    ).rejects.toThrow(ManifestProblem);
  });
});
