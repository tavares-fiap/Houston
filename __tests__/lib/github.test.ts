import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted before variable declarations, so mocks must be created
// inside the factory and exposed on the mock module for later retrieval.
vi.mock("octokit", () => {
  const request = vi.fn();
  const getContent = vi.fn();
  return {
    Octokit: class MockOctokit {
      request = request;
      rest = {
        repos: { getContent },
        search: { issuesAndPullRequests: vi.fn(), code: vi.fn() },
      };
    },
    // Expose so tests can import and call .mockResolvedValueOnce etc.
    __mockRequest: request,
    __mockGetContent: getContent,
  };
});

import * as octokitMock from "octokit";
import { fetchRepoTree, fetchRecentCommits, fetchFilesBatch } from "@/lib/github";

// Cast to access the exposed helpers
const mockRequest = (octokitMock as unknown as { __mockRequest: ReturnType<typeof vi.fn> }).__mockRequest;
const mockGetContent = (octokitMock as unknown as { __mockGetContent: ReturnType<typeof vi.fn> }).__mockGetContent;

beforeEach(() => {
  mockRequest.mockReset();
  mockGetContent.mockReset();
});

describe("fetchRepoTree", () => {
  it("returns only blob paths from the tree", async () => {
    mockRequest.mockResolvedValueOnce({
      data: {
        tree: [
          { type: "blob", path: "src/index.ts" },
          { type: "tree", path: "src" },
          { type: "blob", path: "README.md" },
        ],
      },
    });

    const paths = await fetchRepoTree("owner", "repo");

    expect(paths).toEqual(["src/index.ts", "README.md"]);
  });

  it("returns an empty array when the tree has no blobs", async () => {
    mockRequest.mockResolvedValueOnce({
      data: { tree: [{ type: "tree", path: "src" }] },
    });

    const paths = await fetchRepoTree("owner", "repo");

    expect(paths).toHaveLength(0);
  });

  it("calls the correct GitHub API endpoint with recursive flag", async () => {
    mockRequest.mockResolvedValueOnce({ data: { tree: [] } });

    await fetchRepoTree("myorg", "myrepo");

    expect(mockRequest).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/git/trees/HEAD",
      expect.objectContaining({ owner: "myorg", repo: "myrepo", recursive: "1" })
    );
  });
});

describe("fetchRecentCommits", () => {
  it("returns commits mapped to RecentCommit shape", async () => {
    mockRequest.mockResolvedValueOnce({
      data: [
        {
          sha: "abc1234567890",
          commit: { message: "Fix login bug\n\nLong description here" },
          html_url: "https://github.com/owner/repo/commit/abc1234567890",
        },
        {
          sha: "def9876543210",
          commit: { message: "Add dark mode" },
          html_url: "https://github.com/owner/repo/commit/def9876543210",
        },
      ],
    });

    const commits = await fetchRecentCommits("owner", "repo", 2);

    expect(commits).toHaveLength(2);
    expect(commits[0]).toEqual({
      sha: "abc1234567890",
      message: "Fix login bug", // only first line, body stripped
      url: "https://github.com/owner/repo/commit/abc1234567890",
    });
    expect(commits[1].message).toBe("Add dark mode");
  });

  it("truncates multi-line commit messages to the first line only", async () => {
    mockRequest.mockResolvedValueOnce({
      data: [
        {
          sha: "aaa000",
          commit: { message: "First line\nSecond line\nThird line" },
          html_url: "https://github.com/x/y/commit/aaa000",
        },
      ],
    });

    const commits = await fetchRecentCommits("x", "y", 1);

    expect(commits[0].message).toBe("First line");
  });

  it("passes count as per_page to the API", async () => {
    mockRequest.mockResolvedValueOnce({ data: [] });

    await fetchRecentCommits("owner", "repo", 7);

    expect(mockRequest).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/commits",
      expect.objectContaining({ per_page: 7 })
    );
  });
});

describe("fetchFilesBatch", () => {
  it("returns file content truncated to maxLines lines", async () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n");
    mockGetContent.mockResolvedValueOnce({
      data: { content: Buffer.from(lines).toString("base64"), type: "file" },
    });

    const files = await fetchFilesBatch("owner", "repo", ["src/foo.ts"], 80);

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/foo.ts");
    const resultLines = files[0].content.split("\n");
    expect(resultLines).toHaveLength(80);
    expect(resultLines[0]).toBe("line 1");
    expect(resultLines[79]).toBe("line 80");
  });

  it("silently skips files that fail to fetch", async () => {
    mockGetContent
      .mockRejectedValueOnce(new Error("Not found"))
      .mockResolvedValueOnce({
        data: { content: Buffer.from("ok content").toString("base64"), type: "file" },
      });

    const files = await fetchFilesBatch("owner", "repo", ["missing.ts", "found.ts"], 80);

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("found.ts");
    expect(files[0].content).toBe("ok content");
  });

  it("returns all files when all succeed", async () => {
    mockGetContent
      .mockResolvedValueOnce({
        data: { content: Buffer.from("file a").toString("base64"), type: "file" },
      })
      .mockResolvedValueOnce({
        data: { content: Buffer.from("file b").toString("base64"), type: "file" },
      });

    const files = await fetchFilesBatch("owner", "repo", ["a.ts", "b.ts"], 80);

    expect(files).toHaveLength(2);
  });

  it("returns empty array when all files fail", async () => {
    mockGetContent.mockRejectedValue(new Error("Network error"));

    const files = await fetchFilesBatch("owner", "repo", ["a.ts", "b.ts"], 80);

    expect(files).toHaveLength(0);
  });
});
