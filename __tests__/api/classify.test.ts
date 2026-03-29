import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/anthropic", () => ({
  callClaude: vi.fn(),
}));

import { callClaude } from "@/lib/anthropic";
import type { ClassifyResult } from "@/types";

const mockCallClaude = vi.mocked(callClaude);

// We test the classify logic by importing the handler helper
// (extracted from the route for testability)
import { classifyMessage } from "@/app/api/classify/route";

describe("classifyMessage", () => {
  it("returns classification result from Claude", async () => {
    const expected: ClassifyResult = {
      type: "bug",
      confidence: 0.94,
      extracted: {
        summary: "PDF export hangs on loading screen",
        affectedArea: "Report export (PDF)",
      },
    };
    mockCallClaude.mockResolvedValueOnce({
      result: expected,
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const { result } = await classifyMessage("The PDF export is broken");

    expect(result.type).toBe("bug");
    expect(result.confidence).toBe(0.94);
    expect(result.extracted.summary).toBe("PDF export hangs on loading screen");
  });

  it("always returns exactly one type", async () => {
    const expected: ClassifyResult = {
      type: "feature",
      confidence: 0.72,
      extracted: { summary: "User wants dark mode" },
    };
    mockCallClaude.mockResolvedValueOnce({
      result: expected,
      usage: { inputTokens: 80, outputTokens: 40 },
    });

    const { result } = await classifyMessage("It would be nice to have dark mode");

    expect(["bug", "question", "feature", "ambiguous"]).toContain(result.type);
  });
});
