import { NextResponse } from "next/server";
import { log } from "@/lib/logger";

type Status = "ok" | "missing";

interface HealthResponse {
  anthropic: Status;
  github: Status;
  linear: Status;
}

// Simple config validation — does not call external APIs (MVP)
export async function GET() {
  const health: HealthResponse = {
    anthropic: process.env.ANTHROPIC_API_KEY ? "ok" : "missing",
    github: process.env.GITHUB_TOKEN ? "ok" : "missing",
    linear:
      process.env.LINEAR_API_KEY && process.env.LINEAR_TEAM_ID
        ? "ok"
        : "missing",
  };

  log("health", "output", { anthropic: health.anthropic, github: health.github, linear: health.linear });

  return NextResponse.json(health);
}
