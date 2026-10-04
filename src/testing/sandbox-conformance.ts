import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The executor sandbox conformance suite (constitution VIS-S5).
 *
 * The private folders are refused twice: by `permissions.deny`, which only
 * binds the agent's own file tools, and by `sandbox`, which the operating
 * system enforces for every shell command. The sandbox is the boundary.
 * These tests fail if a folder is refused by one and not the other, or if
 * `pnpm check` would need to open one. The deny lists are the domain's own,
 * in its `.claude/settings.json`; this suite only holds them to the
 * standard. Call it from one test file:
 *
 *     sandboxConformance(new URL("..", import.meta.url));
 */
interface Settings {
  permissions?: { deny?: string[] };
  sandbox?: {
    enabled?: boolean;
    failIfUnavailable?: boolean;
    allowUnsandboxedCommands?: boolean;
    excludedCommands?: string[];
    filesystem?: { denyRead?: string[]; allowRead?: string[] };
    credentials?: { files?: { path: string; mode: string }[] };
  };
}

export function sandboxConformance(repositoryRoot: string | URL): void {
  const base =
    repositoryRoot instanceof URL
      ? repositoryRoot
      : pathToFileURL(
          repositoryRoot.endsWith("/") ? repositoryRoot : `${repositoryRoot}/`,
        );
  const read = (path: string) => readFileSync(new URL(path, base), "utf8");
  const exists = (path: string) => existsSync(new URL(path, base));

  const settings = JSON.parse(read(".claude/settings.json")) as Settings;
  const readRules = (settings.permissions?.deny ?? []).flatMap((rule) => {
    const match = /^Read\((.+)\)$/.exec(rule);
    return match?.[1] ? [match[1]] : [];
  });

  /** Folders the tool rules refuse, as `evidence`, from `Read(evidence/**)`. */
  const deniedFolders = readRules.flatMap((path) => {
    const match = /^([^/*]+)\/\*\*$/.exec(path);
    return match?.[1] ? [match[1]] : [];
  });
  const deniedFiles = readRules.filter((path) => !path.includes("/"));

  const scripts = (
    JSON.parse(read("package.json")) as { scripts: Record<string, string> }
  ).scripts;
  const checkSteps = scripts["check"]!.split("&&").map((step) => step.trim());

  describe("the sandbox is the boundary", () => {
    it("is on, fails closed, and no command may ask to run outside it", () => {
      expect(settings.sandbox?.enabled).toBe(true);
      expect(settings.sandbox?.failIfUnavailable).toBe(true);
      expect(settings.sandbox?.allowUnsandboxedCommands).toBe(false);
      expect(settings.sandbox?.excludedCommands ?? []).toEqual([]);
    });

    it("refuses .env to both mechanisms", () => {
      expect(deniedFiles).toContain(".env");
      expect(deniedFiles).toContain(".env.*");
    });

    it("refuses at the operating system every folder the tool rules refuse", () => {
      const denyRead = settings.sandbox?.filesystem?.denyRead ?? [];
      for (const folder of deniedFolders) {
        expect(denyRead, folder).toContain(`./${folder}`);
      }
      expect(denyRead.length).toBe(deniedFolders.length);
    });

    it("refuses at the operating system every file the tool rules refuse", () => {
      const credentials = settings.sandbox?.credentials?.files ?? [];
      for (const file of deniedFiles) {
        expect(credentials, file).toContainEqual({
          path: `./${file}`,
          mode: "deny",
        });
      }
    });

    it("re-opens nothing it refuses", () => {
      expect(settings.sandbox?.filesystem?.allowRead ?? []).toEqual([]);
    });
  });

  describe("pnpm check runs inside the sandbox", () => {
    it("formats without listing a private folder", () => {
      if (!scripts["format:check"]) return;
      for (const folder of deniedFolders) {
        expect(scripts["format:check"], folder).toContain(`'!${folder}/**'`);
      }
    });

    it("lints markdown without listing a private folder", () => {
      if (!scripts["lint:markdown"]) return;
      for (const folder of deniedFolders) {
        expect(scripts["lint:markdown"], folder).toContain(`'#${folder}'`);
      }
    });

    it("never runs the tsx command, which opens a local pipe the sandbox refuses", () => {
      for (const step of checkSteps) {
        const name = /^pnpm ([\w:-]+)/.exec(step)?.[1];
        const script = name ? scripts[name] : step;
        expect(script, step).not.toMatch(/^tsx\s/);
      }
    });

    it("looks for tests in tests/ only, without reading .env, and leaves the real-data ones out", () => {
      const config = read("vitest.config.ts");
      expect(config).toContain('include: ["tests/**/*.test.ts"]');
      expect(config).toMatch(/exclude:[^\n]*DATA_TESTS/);
      expect(config).toContain("envDir: false");
      if (exists("vitest.data.config.ts")) {
        expect(scripts["check:data"]).toContain("test:data");
      }
    });
  });
}
