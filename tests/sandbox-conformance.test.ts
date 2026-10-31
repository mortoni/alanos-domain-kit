import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PRIVATE_FOLDERS,
  sandboxConformance,
} from "../src/testing/sandbox-conformance.js";

const template = new URL("../templates/domain/", import.meta.url);
const clauses = new URL(
  "../../AlanOS/constitution/clauses.json",
  import.meta.url,
);

// The template is held to the suite every domain made from it runs.
sandboxConformance(template);

describe("the private folders", () => {
  it.skipIf(!existsSync(clauses))(
    "are the list VIS-S4 writes, when AlanOS is checked out beside the kit",
    () => {
      const register = JSON.parse(readFileSync(clauses, "utf8")) as {
        clauses: { id: string; text: string }[];
      };
      const text = register.clauses.find((c) => c.id === "VIS-S4")?.text ?? "";
      const written = (text.match(/[a-z-]+\/(?=[,\s])/g) ?? []).map((d) =>
        d.slice(0, -1),
      );
      expect([...PRIVATE_FOLDERS].sort()).toEqual(written.sort());
    },
  );

  it("are all refused by the template, before any of them exists", () => {
    const settings = JSON.parse(
      readFileSync(new URL(".claude/settings.json", template), "utf8"),
    ) as {
      permissions: { deny: string[] };
      sandbox: { filesystem: { denyRead: string[] } };
    };
    for (const folder of PRIVATE_FOLDERS) {
      expect(settings.permissions.deny, folder).toContain(`Read(${folder}/**)`);
      expect(settings.sandbox.filesystem.denyRead, folder).toContain(
        `./${folder}`,
      );
    }
  });
});
