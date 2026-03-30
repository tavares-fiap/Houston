import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/anthropic", () => ({ callClaude: vi.fn() }));
vi.mock("@/lib/linear", () => ({ createIssue: vi.fn() }));

import { buildTriageMessage } from "@/app/api/triage/route";
import type { ClassifyResult, ContextResult } from "@/types";

const baseClassification: ClassifyResult = {
  type: "bug",
  confidence: 0.9,
  extracted: { summary: "Login broken" },
};

const emptyContext: ContextResult = {
  github: { relevantPRs: [], relevantIssues: [] },
};

describe("buildTriageMessage — projectStructure sections", () => {
  it("shows fallback text for all three sections when projectStructure is absent", () => {
    const message = buildTriageMessage(baseClassification, emptyContext);

    expect(message).toContain("No project structure available.");
    expect(message).toContain("No recent commits available.");
    expect(message).toContain("No package.json found.");
  });

  it("shows fallback text when projectStructure is present but selectedFiles is empty", () => {
    const context: ContextResult = {
      ...emptyContext,
      projectStructure: { selectedFiles: [], recentCommits: [], dependencies: null, recentPRs: [] },
    };

    const message = buildTriageMessage(baseClassification, context);

    expect(message).toContain("No project structure available.");
    expect(message).toContain("No recent commits available.");
    expect(message).toContain("No package.json found.");
  });

  it("renders selected file paths and fenced code blocks", () => {
    const context: ContextResult = {
      ...emptyContext,
      projectStructure: {
        selectedFiles: [{ path: "src/auth.ts", content: "export function login() {}" }],
        recentCommits: [],
        dependencies: null,
        recentPRs: [],
      },
    };

    const message = buildTriageMessage(baseClassification, context);

    expect(message).toContain("### src/auth.ts");
    expect(message).toContain("export function login() {}");
    expect(message).not.toContain("No project structure available.");
  });

  it("renders recent commits with truncated sha and url", () => {
    const context: ContextResult = {
      ...emptyContext,
      projectStructure: {
        selectedFiles: [],
        recentCommits: [
          { sha: "abc1234567", message: "Fix auth bug", url: "https://github.com/c/abc1234567" },
        ],
        dependencies: null,
      },
    };

    const message = buildTriageMessage(baseClassification, context);

    expect(message).toContain("abc1234"); // first 7 chars
    expect(message).toContain("Fix auth bug");
    expect(message).toContain("https://github.com/c/abc1234567");
    expect(message).not.toContain("No recent commits available.");
  });

  it("renders package.json content in a fenced json block", () => {
    const context: ContextResult = {
      ...emptyContext,
      projectStructure: {
        selectedFiles: [],
        recentCommits: [],
        dependencies: '{"name":"app","version":"1.0.0"}',
        recentPRs: [],
      },
    };

    const message = buildTriageMessage(baseClassification, context);

    expect(message).toContain("```json");
    expect(message).toContain('"name":"app"');
    expect(message).not.toContain("No package.json found.");
  });

  it("includes all three new sections in the output string", () => {
    const message = buildTriageMessage(baseClassification, emptyContext);

    expect(message).toContain("## Project Structure — Selected Files");
    expect(message).toContain("## Recent Commits");
    expect(message).toContain("## Dependencies (package.json)");
  });
});
