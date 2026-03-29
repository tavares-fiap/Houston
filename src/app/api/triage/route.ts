import { NextRequest, NextResponse } from "next/server";
import { callClaude } from "@/lib/anthropic";
import { createIssue } from "@/lib/linear";
import { TRIAGE_SYSTEM_PROMPT, TRIAGE_TOOL } from "@/lib/prompts";
import type { TriageInput, TriageResult, ClassifyResult, ContextResult } from "@/types";

// Exported for testing
export function buildTriageMessage(
  classification: ClassifyResult,
  context: ContextResult
): string {
  const prSection =
    context.github.relevantPRs.length > 0
      ? context.github.relevantPRs
          .map((pr) => `- [${pr.title}](${pr.url}): ${pr.body.slice(0, 200)}`)
          .join("\n")
      : "No relevant PRs found.";

  const issueSection =
    context.github.relevantIssues.length > 0
      ? context.github.relevantIssues
          .map((i) => `- [${i.title}](${i.url}): ${i.body.slice(0, 200)}`)
          .join("\n")
      : "No relevant issues found.";

  const codeSection =
    context.github.codeMatches.length > 0
      ? context.github.codeMatches
          .map((c) => `- ${c.path}: ${c.snippet}`)
          .join("\n")
      : "No code matches found.";

  const docSection =
    context.docs.length > 0
      ? context.docs
          .map((d) => `- ${d.path}: ${d.content.slice(0, 300)}`)
          .join("\n")
      : "No documentation found.";

  return `Classification: ${classification.type} (confidence: ${classification.confidence})
Summary: ${classification.extracted.summary}
${classification.extracted.affectedArea ? `Affected Area: ${classification.extracted.affectedArea}` : ""}
${classification.extracted.stepsToReproduce ? `Steps to Reproduce:\n${classification.extracted.stepsToReproduce.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : ""}
${classification.extracted.featureDescription ? `Feature Description: ${classification.extracted.featureDescription}` : ""}

## Related PRs
${prSection}

## Related Issues
${issueSection}

## Code Matches
${codeSection}

## Documentation
${docSection}`;
}

export async function POST(request: NextRequest) {
  try {
    const body: TriageInput = await request.json();
    const { classification, context } = body;

    // Generate card content via Claude
    const message = buildTriageMessage(classification, context);
    const { result: cardContent, usage } = await callClaude<{
      title: string;
      description: string;
      labels: string[];
    }>({
      system: TRIAGE_SYSTEM_PROMPT,
      message,
      tools: [TRIAGE_TOOL],
    });

    // Create card on Linear
    let card: TriageResult["card"];
    try {
      const linearResult = await createIssue({
        teamId: process.env.LINEAR_TEAM_ID!,
        title: cardContent.title,
        description: cardContent.description,
        labels: cardContent.labels,
      });
      card = {
        id: linearResult.id,
        url: linearResult.url,
        title: linearResult.title,
        description: linearResult.description,
        labels: cardContent.labels,
      };
    } catch {
      // Graceful degradation: show card preview even if Linear is unavailable
      card = {
        id: "",
        url: "",
        title: cardContent.title,
        description: cardContent.description,
        labels: cardContent.labels,
      };
    }

    return NextResponse.json({ card, usage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Triage failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
