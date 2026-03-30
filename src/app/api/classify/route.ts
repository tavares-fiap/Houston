import { NextRequest, NextResponse } from "next/server";
import { callClaude } from "@/lib/anthropic";
import { CLASSIFY_SYSTEM_PROMPT, CLASSIFY_TOOL } from "@/lib/prompts";
import { log, logError } from "@/lib/logger";
import type { ClassifyInput, ClassifyResult } from "@/types";

export async function classifyMessage(message: string) {
  return callClaude<ClassifyResult>({
    system: CLASSIFY_SYSTEM_PROMPT,
    message,
    tools: [CLASSIFY_TOOL],
  });
}

export async function POST(request: NextRequest) {
  try {
    const body: ClassifyInput = await request.json();

    if (!body.message || body.message.trim().length === 0) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    log("classify", "input", {
      messageLength: body.message.length,
      repo: body.repo ? `${body.repo.owner}/${body.repo.name}` : undefined,
    });

    const { result, usage } = await classifyMessage(body.message);

    log("classify", "output", {
      type: result.type,
      confidence: result.confidence,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });

    return NextResponse.json({ ...result, usage });
  } catch (error) {
    logError("classify", error);
    const message = error instanceof Error ? error.message : "Classification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
