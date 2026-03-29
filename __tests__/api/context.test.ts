import { describe, it, expect } from "vitest";
import { curateItems, curateDocs } from "@/app/api/context/route";

describe("curateItems", () => {
  it("returns top N items ranked by keyword match", () => {
    const items = [
      { title: "Fix auth login bug", url: "u1", body: "Login page broken" },
      { title: "Update README", url: "u2", body: "Docs update" },
      { title: "Login session timeout", url: "u3", body: "Auth session expires too fast" },
    ];

    const result = curateItems(items, ["login", "auth"], 2);

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Fix auth login bug");
    expect(result[1].title).toBe("Login session timeout");
  });

  it("returns empty array when no keyword matches", () => {
    const items = [
      { title: "Update README", url: "u1", body: "Docs update" },
    ];

    const result = curateItems(items, ["payment", "billing"], 3);

    expect(result).toHaveLength(0);
  });

  it("returns all items if fewer than topN match", () => {
    const items = [
      { title: "Fix login", url: "u1", body: "Broken" },
    ];

    const result = curateItems(items, ["login"], 5);

    expect(result).toHaveLength(1);
  });
});

describe("curateDocs", () => {
  it("returns top N docs ranked by keyword relevance", () => {
    const docs = [
      { path: "docs/api.md", content: "API reference for payments" },
      { path: "docs/auth.md", content: "Authentication and login flow" },
      { path: "docs/deploy.md", content: "Deployment guide" },
    ];

    const result = curateDocs(docs, ["login", "auth"], 2);

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("docs/auth.md");
    expect(result[0].relevance).toBeGreaterThan(0);
  });

  it("returns empty array when no docs match", () => {
    const docs = [
      { path: "docs/deploy.md", content: "Deployment guide" },
    ];

    const result = curateDocs(docs, ["login"], 3);

    expect(result).toHaveLength(0);
  });
});
