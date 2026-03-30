import { NextRequest, NextResponse } from "next/server";
import { callClaude } from "@/lib/anthropic";
import { createIssue } from "@/lib/linear";
import { TRIAGE_SYSTEM_PROMPT, TRIAGE_TOOL } from "@/lib/prompts";
import { log, logError } from "@/lib/logger";
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

  const structureSection =
    context.projectStructure?.selectedFiles && context.projectStructure.selectedFiles.length > 0
      ? context.projectStructure.selectedFiles
          .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
          .join("\n\n")
      : "No project structure available.";

  const commitsSection =
    context.projectStructure?.recentCommits && context.projectStructure.recentCommits.length > 0
      ? context.projectStructure.recentCommits
          .map((c) => `- ${c.sha.slice(0, 7)}: ${c.message} (${c.url})`)
          .join("\n")
      : "No recent commits available.";

  const dependenciesSection = context.projectStructure?.dependencies
    ? `\`\`\`json\n${context.projectStructure.dependencies}\n\`\`\``
    : "No package.json found.";

  const recentPRsSection =
    context.projectStructure?.recentPRs && context.projectStructure.recentPRs.length > 0
      ? context.projectStructure.recentPRs
          .map((pr) => `- #${pr.number}: ${pr.title} (${pr.url})${pr.mergedAt ? ` — merged ${pr.mergedAt}` : ""}`)
          .join("\n")
      : "No recent PRs available.";

  return `Classification: ${classification.type} (confidence: ${classification.confidence})
Summary: ${classification.extracted.summary}
${classification.extracted.affectedArea ? `Affected Area: ${classification.extracted.affectedArea}` : ""}
${classification.extracted.stepsToReproduce ? `Steps to Reproduce:\n${classification.extracted.stepsToReproduce.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : ""}
${classification.extracted.featureDescription ? `Feature Description: ${classification.extracted.featureDescription}` : ""}

## Related PRs
${prSection}

## Related Issues
${issueSection}

## Project Structure — Selected Files
${structureSection}

## Recent Commits
${commitsSection}

## Recent PRs
${recentPRsSection}

## Dependencies (package.json)
${dependenciesSection}`;
}

export async function POST(request: NextRequest) {
  try {
    const body: TriageInput = await request.json();
    const { classification, context } = body;

    log("triage", "input", { classificationType: classification.type });

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
      log("triage", "linear_card_created", { cardId: linearResult.id });
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

    log("triage", "output", {
      cardId: card.id || "(preview)",
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });

    return NextResponse.json({ card, usage });
  } catch (error) {
    logError("triage", error);
    const message = error instanceof Error ? error.message : "Triage failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
