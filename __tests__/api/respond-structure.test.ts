import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/anthropic", () => ({ callClaude: vi.fn() }));
vi.mock("@/lib/logger", () => ({ log: vi.fn(), logError: vi.fn() }));

// We test buildRespondMessage indirectly via the POST handler with a mocked callClaude,
// but buildRespondMessage is not exported. Instead we test through POST by inspecting
// the message passed to callClaude.
import { callClaude } from "@/lib/anthropic";
import { POST } from "@/app/api/respond/route";
import { NextRequest } from "next/server";
import type { RespondInput } from "@/types";

const mockCallClaude = vi.mocked(callClaude);

function makeRequest(body: RespondInput): NextRequest {
  return new NextRequest("http://localhost/api/respond", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const baseInput: RespondInput = {
  classification: {
    type: "bug",
    confidence: 0.9,
    extracted: { summary: "Login broken", affectedArea: "auth" },
  },
  context: {
    github: { relevantPRs: [], relevantIssues: [] },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCallClaude.mockResolvedValue({
    result: { clientResponse: "We're on it!", devSummary: "Check auth module." },
    usage: { inputTokens: 50, outputTokens: 25 },
  });
});

describe("POST /api/respond — projectStructure in message", () => {
  it("includes selected files section when projectStructure has files", async () => {
    const input: RespondInput = {
      ...baseInput,
      context: {
        ...baseInput.context,
        projectStructure: {
          selectedFiles: [{ path: "src/auth.ts", content: "export function login() {}" }],
          recentCommits: [],
          dependencies: null,
          recentPRs: [],
        },
      },
    };

    await POST(makeRequest(input));

    const calledMessage = mockCallClaude.mock.calls[0][0].message as string;
    expect(calledMessage).toContain("## Project Structure — Selected Files");
    expect(calledMessage).toContain("### src/auth.ts");
    expect(calledMessage).toContain("export function login() {}");
  });

  it("includes recent commits section when projectStructure has commits", async () => {
    const input: RespondInput = {
      ...baseInput,
      context: {
        ...baseInput.context,
        projectStructure: {
          selectedFiles: [],
          recentCommits: [
            { sha: "abc1234567", message: "Fix login", url: "https://github.com/c/abc" },
          ],
          dependencies: null,
          recentPRs: [],
        },
      },
    };

    await POST(makeRequest(input));

    const calledMessage = mockCallClaude.mock.calls[0][0].message as string;
    expect(calledMessage).toContain("## Recent Commits");
    expect(calledMessage).toContain("abc1234"); // 7-char sha
    expect(calledMessage).toContain("Fix login");
  });

  it("includes dependencies section when package.json is present", async () => {
    const input: RespondInput = {
      ...baseInput,
      context: {
        ...baseInput.context,
        projectStructure: {
          selectedFiles: [],
          recentCommits: [],
          dependencies: '{"name":"app"}',
          recentPRs: [],
        },
      },
    };

    await POST(makeRequest(input));

    const calledMessage = mockCallClaude.mock.calls[0][0].message as string;
    expect(calledMessage).toContain("## Dependencies (package.json)");
    expect(calledMessage).toContain('"name":"app"');
  });

  it("omits all three sections when projectStructure is absent", async () => {
    await POST(makeRequest(baseInput));

    const calledMessage = mockCallClaude.mock.calls[0][0].message as string;
    expect(calledMessage).not.toContain("## Project Structure — Selected Files");
    expect(calledMessage).not.toContain("## Recent Commits");
    expect(calledMessage).not.toContain("## Dependencies (package.json)");
  });

  it("omits sections when selectedFiles and recentCommits are empty and dependencies is null", async () => {
    const input: RespondInput = {
      ...baseInput,
      context: {
        ...baseInput.context,
        projectStructure: { selectedFiles: [], recentCommits: [], dependencies: null, recentPRs: [] },
      },
    };

    await POST(makeRequest(input));

    const calledMessage = mockCallClaude.mock.calls[0][0].message as string;
    expect(calledMessage).not.toContain("## Project Structure — Selected Files");
    expect(calledMessage).not.toContain("## Recent Commits");
    expect(calledMessage).not.toContain("## Dependencies (package.json)");
  });
});
