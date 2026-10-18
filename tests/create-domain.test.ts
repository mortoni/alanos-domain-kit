import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CreateDomainRefused,
  createDomain,
  type DomainCharterInput,
} from "../src/create/create-domain.js";

const charter: DomainCharterInput = {
  charterVersion: 1,
  kind: "domain",
  id: "garden",
  repository: "github.com/example/garden-domain",
  purpose: "The owner's garden: what is planted, when, and how it grew.",
  owns: ["what is planted and where", "when it was watered"],
  doesNotOwn: [{ what: "what the seeds cost", owner: "money" }],
  stage: "incubating",
  stageSince: "2026-10-18",
  attention: [],
  provides: [],
  consumes: [],
  ownerLoad: "few",
  cost: [],
  improvement: { cadence: "monthly" },
  domain: {
    timeline: { day: false, periods: [] },
    apps: [],
    consolePage: false,
    onRetirement: "read-only",
  },
};

const make = async (
  overrides: Partial<Parameters<typeof createDomain>[0]> = {},
) => {
  const target = join(
    await mkdtemp(join(tmpdir(), "create-")),
    "garden-domain",
  );
  const created = await createDomain({
    charter,
    target,
    packageName: "garden-domain",
    kitDependency: "github:example/domain-kit#v0.3.0",
    floor: "1.30",
    owner: "The Owner",
    today: "2026-10-18",
    ...overrides,
  });
  return { target, created };
};

describe("a new domain from its approved charter", () => {
  it("writes the template with the charter's words in it, and the charter whole", async () => {
    const { target, created } = await make();
    for (const file of [
      "charter.json",
      "package.json",
      "src/mcp/tools.ts",
      "src/domain/contract.ts",
      "scripts/emit-manifest.ts",
      "docs/00-brief.md",
      ".claude/settings.json",
      "tests/executor-sandbox.test.ts",
      "evidence/.gitkeep",
    ])
      expect(created.files, file).toContain(file);
    expect(
      JSON.parse(await readFile(join(target, "charter.json"), "utf8")),
    ).toEqual(charter);
    const pkg = JSON.parse(
      await readFile(join(target, "package.json"), "utf8"),
    );
    expect(pkg.name).toBe("garden-domain");
    expect(pkg.dependencies["@alanos/domain-kit"]).toBe(
      "github:example/domain-kit#v0.3.0",
    );
    expect(
      await readFile(join(target, "src/domain/contract.ts"), "utf8"),
    ).toContain('DOMAIN_ID = "garden"');
    expect(
      await readFile(join(target, "src/domain/contract.ts"), "utf8"),
    ).toContain('"1.30"');
    const brief = await readFile(join(target, "docs/00-brief.md"), "utf8");
    expect(brief).toContain(charter.purpose);
    expect(brief).toContain("- when it was watered");
    expect(brief).toContain("- what the seeds cost (money)");
    expect(
      await readFile(join(target, "scripts/emit-manifest.ts"), "utf8"),
    ).toContain(JSON.stringify(charter.purpose));
  });

  it("leaves no placeholder anywhere", async () => {
    const { target, created } = await make();
    for (const file of created.files) {
      const text = await readFile(join(target, file), "utf8");
      expect(text, file).not.toMatch(/__[A-Z][A-Z_]*__/);
    }
  });

  it("refuses a target that exists, and writes nothing", async () => {
    const { target } = await make();
    await expect(make({ target })).rejects.toBeInstanceOf(CreateDomainRefused);
  });

  it("refuses anything but an incubating domain", async () => {
    await expect(
      make({ charter: { ...charter, kind: "application" } }),
    ).rejects.toThrow(/kind application/);
    await expect(
      make({ charter: { ...charter, stage: "proposed" } }),
    ).rejects.toThrow(/proposed/);
    await expect(
      make({ charter: { ...charter, id: "Garden" } }),
    ).rejects.toThrow(/not a domain id/);
    const target = join(await mkdtemp(join(tmpdir(), "create-")), "never");
    await expect(
      make({ target, charter: { ...charter, stage: "member" } }),
    ).rejects.toThrow();
    expect(existsSync(target)).toBe(false);
  });
});
