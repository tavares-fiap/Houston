import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/anthropic", () => ({
  callClaude: vi.fn(),
}));

vi.mock("@/lib/linear", () => ({
  createIssue: vi.fn(),
}));

import { callClaude } from "@/lib/anthropic";
import { createIssue } from "@/lib/linear";
import { buildTriageMessage } from "@/app/api/triage/route";
import type { ClassifyResult, ContextResult } from "@/types";

const mockCallClaude = vi.mocked(callClaude);
const mockCreateIssue = vi.mocked(createIssue);

describe("buildTriageMessage", () => {
  const emptyContext: ContextResult = {
    github: { relevantPRs: [], relevantIssues: [], codeMatches: [] },
    docs: [],
  };

  it("includes classification info in the message", () => {
    const classification: ClassifyResult = {
      type: "bug",
      confidence: 0.9,
      extracted: { summary: "PDF export hangs", affectedArea: "Export module" },
    };

    const message = buildTriageMessage(classification, emptyContext);

    expect(message).toContain("bug");
    expect(message).toContain("PDF export hangs");
    expect(message).toContain("Export module");
  });

  it("includes context when available", () => {
    const classification: ClassifyResult = {
      type: "bug",
      confidence: 0.9,
      extracted: { summary: "Login broken" },
    };
    const context: ContextResult = {
      github: {
        relevantPRs: [{ title: "Fix auth flow", url: "https://github.com/pr/1", body: "Updated login" }],
        relevantIssues: [],
        codeMatches: [{ path: "src/auth.ts", snippet: "function login()" }],
      },
      docs: [{ path: "docs/auth.md", content: "Auth documentation", relevance: 2 }],
    };

    const message = buildTriageMessage(classification, context);

    expect(message).toContain("Fix auth flow");
    expect(message).toContain("src/auth.ts");
    expect(message).toContain("Auth documentation");
  });

  it("handles empty context gracefully", () => {
    const classification: ClassifyResult = {
      type: "feature",
      confidence: 0.85,
      extracted: { summary: "Add dark mode" },
    };

    const message = buildTriageMessage(classification, emptyContext);

    expect(message).toContain("Add dark mode");
    expect(message).toContain("No relevant PRs found");
  });
});
