import { describe, expect, it } from "vitest";
import {
  DEFAULT_INSIGHTS_THRESHOLD,
  INSIGHT_DIMENSIONS,
  InsightSchema,
  MAX_TEXT_COPY,
  UpdatesFileSchema,
  textOf,
} from "../src/index.js";

/** What 0.5.0 took in from Health, so a domain no longer keeps its own copy. */
describe("the text copy of a result", () => {
  it("repeats a normal result in full", () => {
    expect(JSON.parse(textOf({ a: 1 }))).toEqual({ a: 1 });
  });

  it("does not repeat a result that would push one message past a client's cap", () => {
    const text = textOf({ base64: "x".repeat(MAX_TEXT_COPY + 1) });
    expect(text.length).toBeLessThan(200);
    expect(text).toContain("structuredContent");
  });
});

describe("the improvement shapes Health served first", () => {
  const dimension = { score: 5, reason: "r" };
  const insight = {
    id: "ins-1",
    title: "t",
    status: "accepted",
    score: 6,
    dimensions: Object.fromEntries(
      INSIGHT_DIMENSIONS.map((d) => [d, dimension]),
    ),
    firstProposed: "2026-10-01",
    lastAssessed: "2026-10-30",
    report: "insights/ins-1.md",
    cite_as: "example:insight/ins-1",
  };

  it("reads an insight's subject, decision and commit, each optional", () => {
    expect(InsightSchema.parse(insight).subject).toBeUndefined();
    const decided = InsightSchema.parse({
      ...insight,
      subject: "s",
      decision: "D-1",
      commit: "abc1234",
    });
    expect([decided.subject, decided.decision, decided.commit]).toEqual([
      "s",
      "D-1",
      "abc1234",
    ]);
  });

  it("reads an update's advisory and changelog", () => {
    const file = UpdatesFileSchema.parse({
      domain: "example",
      generatedAt: "2026-10-30",
      items: [
        {
          id: "u",
          package: "p",
          installed: "1",
          latest: "2",
          severity: "security",
          status: "open",
          firstSeen: "a",
          lastSeen: "b",
          advisory: "GHSA-x",
          changelog: "https://x",
        },
      ],
    });
    expect(file.items[0]).toMatchObject({
      advisory: "GHSA-x",
      changelog: "https://x",
    });
  });

  it("keeps the federation's default bar", () => {
    expect(DEFAULT_INSIGHTS_THRESHOLD).toBe(7);
  });
});
