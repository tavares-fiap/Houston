import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@linear/sdk");

import { LinearClient } from "@linear/sdk";
import { POST } from "@/app/api/linear/teams/route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/linear/teams", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/linear/teams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when apiKey is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("apiKey");
  });

  it("returns 400 when apiKey is empty string", async () => {
    const res = await POST(makeRequest({ apiKey: "" }));
    expect(res.status).toBe(400);
  });

  it("returns teams on valid apiKey", async () => {
    const mockTeams = vi.fn().mockResolvedValue({
      nodes: [
        { id: "team-1", name: "Engineering" },
        { id: "team-2", name: "Design" },
      ],
    });

    // Create proper mock constructor
    vi.mocked(LinearClient).mockImplementation(function () {
      return { teams: mockTeams };
    } as never);

    const res = await POST(makeRequest({ apiKey: "lin_api_test" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.teams).toHaveLength(2);
    expect(data.teams[0]).toEqual({ id: "team-1", name: "Engineering" });
  });

  it("returns 400 when LinearClient throws", async () => {
    const mockTeams = vi.fn().mockRejectedValue(new Error("Unauthorized"));

    vi.mocked(LinearClient).mockImplementation(
      () =>
        ({
          teams: mockTeams,
        }) as never
    );

    const res = await POST(makeRequest({ apiKey: "invalid_key" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid API key or Linear unreachable");
  });
});
