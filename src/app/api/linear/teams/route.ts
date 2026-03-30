import { NextRequest, NextResponse } from "next/server";
import { LinearClient } from "@linear/sdk";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { apiKey } = body as { apiKey?: string };

  if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
    return NextResponse.json({ error: "apiKey required" }, { status: 400 });
  }

  try {
    const client = new LinearClient({ apiKey: apiKey.trim() });
    const teams = await client.teams();
    return NextResponse.json({
      teams: teams.nodes.map((t) => ({ id: t.id, name: t.name })),
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid API key or Linear unreachable" },
      { status: 400 }
    );
  }
}
