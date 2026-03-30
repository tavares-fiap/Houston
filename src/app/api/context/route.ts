import { NextRequest, NextResponse } from "next/server";
import { searchPRs, searchIssues, fetchRepoTree, fetchRecentCommits, fetchFilesBatch, getFileContent, fetchRecentPRs } from "@/lib/github";
import { callClaude } from "@/lib/anthropic";
import { RANK_SYSTEM_PROMPT, RANK_TOOL, SELECT_FILES_SYSTEM_PROMPT, SELECT_FILES_TOOL } from "@/lib/prompts";
import { log, logError } from "@/lib/logger";
import type {
  ContextInput,
  ContextResult,
  PRInfo,
  IssueInfo,
  TokenUsage,
  ProjectStructure,
} from "@/types";

const TOP_N_PRS = 3;
const TOP_N_ISSUES = 3;
// Broader heuristic pass before optional Haiku ranking
const HEURISTIC_LIMIT = 10;

// Exported for testing
export function curateItems<T extends { title: string; body: string }>(
  items: T[],
  keywords: string[],
  topN: number
): T[] {
  const lowerKeywords = keywords.map((k) => k.toLowerCase());

  return items
    .map((item) => {
      const text = `${item.title} ${item.body}`.toLowerCase();
      const score = lowerKeywords.reduce(
        (s, kw) => s + (text.includes(kw) ? 1 : 0),
        0
      );
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(({ item }) => item);
}

function extractKeywords(classification: ContextInput["classification"]): string[] {
  const words: string[] = [];
  const { extracted } = classification;

  if (extracted.summary) {
    words.push(
      ...extracted.summary
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );
  }
  if (extracted.affectedArea) words.push(extracted.affectedArea.toLowerCase());
  if (extracted.coreQuestion) {
    words.push(
      ...extracted.coreQuestion
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );
  }

  return [...new Set(words)];
}

// Calls Haiku to rank items by relevance. Sends only titles/summaries to minimize tokens.
// Model: claude-haiku-4-5-20251001 (fast, cost-efficient for ranking)
async function rankWithHaiku(
  summaries: string[],
  query: string
): Promise<{ rankedIndices: number[]; usage: TokenUsage }> {
  const message = `Query: ${query}\n\nItems:\n${summaries.map((s, i) => `${i}: ${s}`).join("\n")}`;
  const { result, usage } = await callClaude<{ rankedIndices: number[] }>({
    system: RANK_SYSTEM_PROMPT,
    message,
    tools: [RANK_TOOL],
    model: "claude-haiku-4-5-20251001",
  });
  return { rankedIndices: result.rankedIndices, usage };
}

function accumulateUsage(acc: TokenUsage | undefined, next: TokenUsage): TokenUsage {
  if (!acc) return next;
  return {
    inputTokens: acc.inputTokens + next.inputTokens,
    outputTokens: acc.outputTokens + next.outputTokens,
  };
}

// Blacklist approach: exclude only clear noise, let Haiku handle the rest.
// This avoids language bias — repos in Go, Python, Ruby, etc. are not filtered out.
const EXCLUDE_SEGMENTS = ["node_modules/", ".next/", "dist/", "build/", "coverage/", ".git/", "vendor/"];
const EXCLUDE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".svg", ".ico",
  ".mp4", ".mp3", ".wav",
  ".pdf", ".zip", ".tar", ".gz",
  ".lock", ".map",
]);
// Paths containing these segments are surfaced first (language-agnostic signal of importance)
const PRIORITY_SEGMENTS = ["src/", "app/", "lib/", "components/", "services/", "packages/", "docs/"];
const MAX_PATHS = 1000;

// Exported for testing
export function filterRepoPaths(paths: string[]): string[] {
  const filtered = paths.filter((p) => {
    const ext = p.slice(p.lastIndexOf("."));
    if (EXCLUDE_EXTENSIONS.has(ext)) return false;
    if (EXCLUDE_SEGMENTS.some((seg) => p.includes(seg))) return false;
    return true;
  });

  // Prioritize paths in important directories so Haiku sees the most relevant first
  const priority = filtered.filter((p) => PRIORITY_SEGMENTS.some((seg) => p.includes(seg)));
  const rest = filtered.filter((p) => !PRIORITY_SEGMENTS.some((seg) => p.includes(seg)));
  const ordered = [...priority, ...rest];

  return ordered.slice(0, MAX_PATHS);
}

export async function POST(request: NextRequest) {
  try {
    const body: ContextInput = await request.json();
    const { classification, repo } = body;
    const keywords = extractKeywords(classification);
    const query = keywords.slice(0, 5).join(" ");

    log("context", "input", {
      classificationType: classification.type,
      repo: `${repo.owner}/${repo.name}`,
      keywordCount: keywords.length,
    });

    // Graceful degradation: continue pipeline even if external service fails
    const [rawPRs, rawIssues, rawTree] = await Promise.all([
      searchPRs(repo.owner, repo.name, query).catch(() => []),
      searchIssues(repo.owner, repo.name, query).catch(() => []),
      fetchRepoTree(repo.owner, repo.name).catch(() => null),
    ]);

    // Step 1: Heuristic curation (keyword-based). Uses HEURISTIC_LIMIT to retain
    // enough candidates for optional Haiku ranking in the next step.
    const heuristicPRs = curateItems(
      rawPRs.map((pr) => ({ title: pr.title, url: pr.url, body: pr.body })),
      keywords,
      HEURISTIC_LIMIT
    );
    const heuristicIssues = curateItems(
      rawIssues.map((i) => ({ title: i.title, url: i.url, body: i.body })),
      keywords,
      HEURISTIC_LIMIT
    );

    // Step 2: Optional Haiku ranking — only called when a category exceeds TOP_N.
    // Sends titles/summaries only (not full content) to keep token cost minimal.
    // If heuristic already returns ≤3 results, skip Claude entirely.
    let rankingUsage: TokenUsage | undefined;
    let relevantPRs: PRInfo[];
    let relevantIssues: IssueInfo[];

    if (heuristicPRs.length > TOP_N_PRS) {
      const { rankedIndices, usage } = await rankWithHaiku(
        heuristicPRs.map((pr) => pr.title),
        query
      );
      relevantPRs = rankedIndices.slice(0, TOP_N_PRS).map((i) => heuristicPRs[i]).filter(Boolean);
      rankingUsage = accumulateUsage(rankingUsage, usage);
    } else {
      relevantPRs = heuristicPRs;
    }

    if (heuristicIssues.length > TOP_N_ISSUES) {
      const { rankedIndices, usage } = await rankWithHaiku(
        heuristicIssues.map((i) => i.title),
        query
      );
      relevantIssues = rankedIndices.slice(0, TOP_N_ISSUES).map((i) => heuristicIssues[i]).filter(Boolean);
      rankingUsage = accumulateUsage(rankingUsage, usage);
    } else {
      relevantIssues = heuristicIssues;
    }

    // --- Project Structure (structural context independent of keyword matching) ---
    let projectStructure: ProjectStructure | undefined;
    if (rawTree !== null) {
      try {
        const filteredPaths = filterRepoPaths(rawTree);
        log("context", "tree_filter", { totalPaths: rawTree.length, filteredPaths: filteredPaths.length });

        // Build classification summary for Haiku
        const { extracted } = classification;
        const selectionMessage = [
          `Problem type: ${classification.type}`,
          `Summary: ${extracted.summary}`,
          extracted.affectedArea ? `Affected area: ${extracted.affectedArea}` : null,
          extracted.coreQuestion ? `Core question: ${extracted.coreQuestion}` : null,
          extracted.featureDescription ? `Feature: ${extracted.featureDescription}` : null,
          `\nRepository files:\n${filteredPaths.join("\n")}`,
        ]
          .filter(Boolean)
          .join("\n");

        const { result: selectionResult, usage: selectionUsage } = await callClaude<{
          selectedPaths: string[];
        }>({
          system: SELECT_FILES_SYSTEM_PROMPT,
          message: selectionMessage,
          tools: [SELECT_FILES_TOOL],
          model: "claude-haiku-4-5-20251001",
        });
        rankingUsage = accumulateUsage(rankingUsage, selectionUsage);
        log("context", "file_selection", { selectedPathsCount: selectionResult.selectedPaths.length });

        // Fetch selected files, recent commits, package.json, and recent PRs in parallel
        const [selectedFiles, recentCommits, packageJsonContent, recentPRs] = await Promise.all([
          fetchFilesBatch(repo.owner, repo.name, selectionResult.selectedPaths, 200),
          fetchRecentCommits(repo.owner, repo.name, 10),
          getFileContent(repo.owner, repo.name, "package.json").catch(() => null),
          fetchRecentPRs(repo.owner, repo.name, 10).catch(() => []),
        ]);

        log("context", "files_fetched", { selectedFilesFetched: selectedFiles.length });

        projectStructure = {
          selectedFiles,
          recentCommits,
          dependencies: packageJsonContent,
          recentPRs,
        };
      } catch {
        // Graceful degradation: projectStructure stays undefined if any step fails
        projectStructure = undefined;
      }
    }

    const result: ContextResult = {
      github: { relevantPRs, relevantIssues },
      projectStructure,
    };

    log("context", "github_results", {
      prs: relevantPRs.length,
      issues: relevantIssues.length,
      selectedFiles: projectStructure?.selectedFiles.length ?? 0,
      recentCommits: projectStructure?.recentCommits.length ?? 0,
      recentPRs: projectStructure?.recentPRs.length ?? 0,
    });

    // Include usage only if Haiku was called for ranking (undefined otherwise)
    return NextResponse.json({ ...result, ...(rankingUsage && { usage: rankingUsage }) });
  } catch (error) {
    logError("context", error);
    const message = error instanceof Error ? error.message : "Context retrieval failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
