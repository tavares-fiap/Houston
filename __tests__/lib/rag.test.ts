import { describe, it, expect, vi } from "vitest";
import { searchDocs } from "@/lib/rag";
import * as github from "@/lib/github";

vi.mock("@/lib/github");

const mockListDocs = vi.mocked(github.listDocs);
const mockGetFileContent = vi.mocked(github.getFileContent);

describe("searchDocs", () => {
  it("returns all docs from docs/ directory (pure retrieval, no filtering)", async () => {
    mockListDocs.mockResolvedValueOnce(["docs/guide.md"]);
    mockGetFileContent.mockResolvedValueOnce("# User Guide\nHow to export reports.");

    const result = await searchDocs("acme", "app");

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("docs/guide.md");
    expect(result[0].content).toBe("# User Guide\nHow to export reports.");
  });

  it("falls back to README.md when docs/ is empty", async () => {
    mockListDocs.mockResolvedValueOnce([]);
    mockGetFileContent.mockResolvedValueOnce("# My App\nA cool application.");

    const result = await searchDocs("acme", "app");

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("README.md");
    expect(mockGetFileContent).toHaveBeenCalledWith("acme", "app", "README.md");
  });

  it("returns empty array when no docs and no README", async () => {
    mockListDocs.mockResolvedValueOnce([]);
    mockGetFileContent.mockRejectedValueOnce(new Error("Not found"));

    const result = await searchDocs("acme", "app");

    expect(result).toHaveLength(0);
  });
});
