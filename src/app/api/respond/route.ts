import { NextRequest, NextResponse } from "next/server";
import { callClaude } from "@/lib/anthropic";
import { RESPOND_SYSTEM_PROMPT, RESPOND_TOOL } from "@/lib/prompts";
import type { RespondInput, RespondResult } from "@/types";

function buildRespondMessage(input: RespondInput): string {
  const { classification, context, triage } = input;

  let message = `## Client Request
Type: ${classification.type}
Summary: ${classification.extracted.summary}`;

  if (classification.extracted.affectedArea) {
    message += `\nAffected Area: ${classification.extracted.affectedArea}`;
  }

  if (context.github.relevantPRs.length > 0) {
    message += `\n\n## Related PRs\n`;
    message += context.github.relevantPRs
      .map((pr) => `- [${pr.title}](${pr.url})`)
      .join("\n");
  }

  if (context.github.relevantIssues.length > 0) {
    message += `\n\n## Related Issues\n`;
    message += context.github.relevantIssues
      .map((i) => `- [${i.title}](${i.url})`)
      .join("\n");
  }

  if (context.github.codeMatches.length > 0) {
    message += `\n\n## Code Matches\n`;
    message += context.github.codeMatches
      .map((c) => `- ${c.path}: ${c.snippet}`)
      .join("\n");
  }

  if (context.docs.length > 0) {
    message += `\n\n## Documentation\n`;
    message += context.docs.map((d) => `- ${d.path}`).join("\n");
  }

  if (triage) {
    message += `\n\n## Created Card\n`;
    message += `- Title: ${triage.card.title}\n`;
    if (triage.card.url) message += `- URL: ${triage.card.url}\n`;
    message += `- Labels: ${triage.card.labels.join(", ")}`;
  }

  return message;
}

export async function POST(request: NextRequest) {
  try {
    const body: RespondInput = await request.json();

    const message = buildRespondMessage(body);
    const { result, usage } = await callClaude<RespondResult>({
      system: RESPOND_SYSTEM_PROMPT,
      message,
      tools: [RESPOND_TOOL],
    });

    return NextResponse.json({ ...result, usage });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Response generation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
