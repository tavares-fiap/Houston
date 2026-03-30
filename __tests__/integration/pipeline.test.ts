import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/anthropic", () => ({
  callClaude: vi.fn(),
}));

vi.mock("@/lib/github", () => ({
  searchPRs: vi.fn(),
  searchIssues: vi.fn(),
}));

vi.mock("@/lib/linear", () => ({
  createIssue: vi.fn(),
}));

import { callClaude } from "@/lib/anthropic";
import { createIssue } from "@/lib/linear";
import { classifyMessage } from "@/app/api/classify/route";
import { curateItems } from "@/app/api/context/route";
import { buildTriageMessage } from "@/app/api/triage/route";
import type { ClassifyResult, ContextResult } from "@/types";

const mockCallClaude = vi.mocked(callClaude);
const mockCreateIssue = vi.mocked(createIssue);

describe("Pipeline routing", () => {
  it("question type should skip triage step", async () => {
    const classification: ClassifyResult = {
      type: "question",
      confidence: 0.88,
      extracted: { summary: "What is the refund policy?" },
    };
    mockCallClaude.mockResolvedValueOnce({
      result: classification,
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const { result } = await classifyMessage("What is the refund policy?");

    expect(result.type).toBe("question");
    expect(mockCreateIssue).not.toHaveBeenCalled();
  });

  it("bug type should go through all steps", async () => {
    const classification: ClassifyResult = {
      type: "bug",
      confidence: 0.95,
      extracted: { summary: "Save button broken", affectedArea: "Profile page" },
    };
    mockCallClaude.mockResolvedValueOnce({
      result: classification,
      usage: { inputTokens: 120, outputTokens: 60 },
    });

    const { result } = await classifyMessage("Save button is broken on profile");

    expect(result.type).toBe("bug");
  });
});

describe("Resilience to empty context", () => {
  it("curation returns empty array when no results match", () => {
    const emptyPRs = curateItems([], ["login"], 3);
    expect(emptyPRs).toEqual([]);
  });

  it("triage message handles empty context without breaking", () => {
    const classification: ClassifyResult = {
      type: "bug",
      confidence: 0.8,
      extracted: { summary: "Something is broken" },
    };
    const emptyContext: ContextResult = {
      github: { relevantPRs: [], relevantIssues: [] },
    };

    const message = buildTriageMessage(classification, emptyContext);

    expect(message).toContain("Something is broken");
    expect(message).toContain("No relevant PRs found");
    expect(message).toContain("No relevant issues found");
  });

  it("curation handles items with zero keyword matches", () => {
    const items = [
      { title: "Unrelated PR", url: "u1", body: "Nothing relevant here" },
      { title: "Another unrelated", url: "u2", body: "Also nothing" },
    ];

    const result = curateItems(items, ["payment", "billing"], 3);

    expect(result).toHaveLength(0);
  });
});
