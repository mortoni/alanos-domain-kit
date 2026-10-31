import { describe, expect, it } from "vitest";
import { composeStatus, countNoun } from "../src/status.js";

describe("composeStatus", () => {
  const base = {
    domain: "example",
    contractVersion: "1.16",
    manifestVersion: 1,
    lastKnowledgeUpdate: "2026-09-20",
  };

  it("is ok with no problems and null detail", () => {
    expect(composeStatus({ ...base, problems: [] })).toEqual({
      ...base,
      status: "ok",
      detail: null,
    });
  });

  it("is degraded with problems joined in order", () => {
    const status = composeStatus({
      ...base,
      problems: ["2 entries are invalid", "1 file is not committed"],
    });
    expect(status.status).toBe("degraded");
    expect(status.detail).toBe(
      "2 entries are invalid; 1 file is not committed",
    );
  });

  // STA-S2: a domain answers ok or degraded; down is only ever derived by callers.
  it("is ok or degraded, never down (STA-S2)", () => {
    for (const problems of [[], ["the index is stale"]]) {
      expect(["ok", "degraded"]).toContain(
        composeStatus({ ...base, problems }).status,
      );
    }
  });
});

describe("countNoun", () => {
  it("counts in the standard's voice", () => {
    expect(countNoun(1, "entry is", "entries are")).toBe("1 entry is");
    expect(countNoun(3, "entry is", "entries are")).toBe("3 entries are");
  });
});
