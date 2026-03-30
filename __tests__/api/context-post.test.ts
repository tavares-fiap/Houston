import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/github", () => ({
  searchPRs: vi.fn().mockResolvedValue([]),
  searchIssues: vi.fn().mockResolvedValue([]),
  searchCode: vi.fn().mockResolvedValue([]),
  fetchRepoTree: vi.fn().mockResolvedValue([]),
  fetchRecentCommits: vi.fn().mockResolvedValue([]),
  fetchFilesBatch: vi.fn().mockResolvedValue([]),
  getFileContent: vi.fn().mockResolvedValue("{}"),
  listDocs: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/rag", () => ({
  searchDocs: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/anthropic", () => ({
  callClaude: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  log: vi.fn(),
  logError: vi.fn(),
}));

import * as github from "@/lib/github";
import { callClaude } from "@/lib/anthropic";
import { POST } from "@/app/api/context/route";
import { NextRequest } from "next/server";
import type { ContextInput } from "@/types";

const mockFetchRepoTree = vi.mocked(github.fetchRepoTree);
const mockFetchRecentCommits = vi.mocked(github.fetchRecentCommits);
const mockFetchFilesBatch = vi.mocked(github.fetchFilesBatch);
const mockGetFileContent = vi.mocked(github.getFileContent);
const mockCallClaude = vi.mocked(callClaude);

function makeRequest(body: ContextInput): NextRequest {
  return new NextRequest("http://localhost/api/context", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const baseInput: ContextInput = {
  classification: {
    type: "bug",
    confidence: 0.9,
    extracted: { summary: "login broken on mobile", affectedArea: "auth" },
  },
  repo: { owner: "acme", name: "app" },
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no Haiku ranking needed (callClaude only called for file selection)
  mockCallClaude.mockResolvedValue({
    result: { selectedPaths: [] },
    usage: { inputTokens: 10, outputTokens: 5 },
  });
});

describe("POST /api/context — projectStructure", () => {
  it("returns projectStructure with selectedFiles and recentCommits when tree is available", async () => {
    mockFetchRepoTree.mockResolvedValueOnce(["src/auth.ts", "src/index.ts"]);
    mockFetchRecentCommits.mockResolvedValueOnce([
      { sha: "abc123", message: "Fix auth", url: "https://github.com/c/abc123" },
    ]);
    mockFetchFilesBatch.mockResolvedValueOnce([
      { path: "src/auth.ts", content: "export function login() {}" },
    ]);
    mockGetFileContent.mockResolvedValueOnce('{"name":"app"}');
    mockCallClaude.mockResolvedValueOnce({
      result: { selectedPaths: ["src/auth.ts"] },
      usage: { inputTokens: 20, outputTokens: 10 },
    });

    const res = await POST(makeRequest(baseInput));
    const body = await res.json();

    expect(body.projectStructure).toBeDefined();
    expect(body.projectStructure.selectedFiles).toHaveLength(1);
    expect(body.projectStructure.selectedFiles[0].path).toBe("src/auth.ts");
    expect(body.projectStructure.recentCommits).toHaveLength(1);
    expect(body.projectStructure.recentCommits[0].sha).toBe("abc123");
    expect(body.projectStructure.dependencies).toBe('{"name":"app"}');
  });

  it("omits projectStructure when fetchRepoTree fails", async () => {
    mockFetchRepoTree.mockRejectedValueOnce(new Error("API rate limit"));

    const res = await POST(makeRequest(baseInput));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.projectStructure).toBeUndefined();
  });

  it("sets projectStructure to undefined when file selection throws", async () => {
    mockFetchRepoTree.mockResolvedValueOnce(["src/auth.ts"]);
    mockCallClaude.mockRejectedValueOnce(new Error("Claude unavailable"));

    const res = await POST(makeRequest(baseInput));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.projectStructure).toBeUndefined();
  });

  it("sets dependencies to null when package.json is absent", async () => {
    mockFetchRepoTree.mockResolvedValueOnce(["src/index.ts"]);
    mockFetchRecentCommits.mockResolvedValueOnce([]);
    mockFetchFilesBatch.mockResolvedValueOnce([]);
    mockGetFileContent.mockRejectedValueOnce(new Error("Not found"));
    mockCallClaude.mockResolvedValueOnce({
      result: { selectedPaths: [] },
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const res = await POST(makeRequest(baseInput));
    const body = await res.json();

    expect(body.projectStructure).toBeDefined();
    expect(body.projectStructure.dependencies).toBeNull();
  });

  it("still returns github and docs fields alongside projectStructure", async () => {
    mockFetchRepoTree.mockResolvedValueOnce([]);
    mockFetchRecentCommits.mockResolvedValueOnce([]);
    mockFetchFilesBatch.mockResolvedValueOnce([]);
    mockGetFileContent.mockResolvedValueOnce("{}");

    const res = await POST(makeRequest(baseInput));
    const body = await res.json();

    expect(body.github).toBeDefined();
    expect(body.docs).toBeDefined();
  });
});
