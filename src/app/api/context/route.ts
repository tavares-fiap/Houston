import { NextRequest, NextResponse } from "next/server";
import { searchPRs, searchIssues, searchCode } from "@/lib/github";
import { searchDocs } from "@/lib/rag";
import { callClaude } from "@/lib/anthropic";
import { RANK_SYSTEM_PROMPT, RANK_TOOL } from "@/lib/prompts";
import type {
  ContextInput,
  ContextResult,
  PRInfo,
  IssueInfo,
  CodeMatch,
  DocMatch,
  TokenUsage,
} from "@/types";
import type { RawDoc } from "@/lib/github";

const TOP_N_PRS = 3;
const TOP_N_ISSUES = 3;
const TOP_N_CODE = 5;
const TOP_N_DOCS = 3;
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

export function curateDocs(
  docs: RawDoc[],
  keywords: string[],
  topN: number
): DocMatch[] {
  const lowerKeywords = keywords.map((k) => k.toLowerCase());

  return docs
    .map((doc) => {
      const text = `${doc.path} ${doc.content}`.toLowerCase();
      const score = lowerKeywords.reduce(
        (s, kw) => s + (text.includes(kw) ? 1 : 0),
        0
      );
      return { path: doc.path, content: doc.content, relevance: score };
    })
    .filter((d) => d.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, topN);
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

export async function POST(request: NextRequest) {
  try {
    const body: ContextInput = await request.json();
    const { classification, repo } = body;
    const keywords = extractKeywords(classification);
    const query = keywords.slice(0, 5).join(" ");

    // Graceful degradation: continue pipeline even if external service fails
    const [rawPRs, rawIssues, rawCode, rawDocs] = await Promise.all([
      searchPRs(repo.owner, repo.name, query).catch(() => []),
      searchIssues(repo.owner, repo.name, query).catch(() => []),
      searchCode(repo.owner, repo.name, query).catch(() => []),
      searchDocs(repo.owner, repo.name).catch(() => []),
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
    const heuristicDocs = curateDocs(rawDocs, keywords, HEURISTIC_LIMIT);

    // Step 2: Optional Haiku ranking — only called when a category exceeds TOP_N.
    // Sends titles/summaries only (not full content) to keep token cost minimal.
    // If heuristic already returns ≤3 results, skip Claude entirely.
    let rankingUsage: TokenUsage | undefined;
    let relevantPRs: PRInfo[];
    let relevantIssues: IssueInfo[];
    let docs: DocMatch[];

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

    if (heuristicDocs.length > TOP_N_DOCS) {
      const { rankedIndices, usage } = await rankWithHaiku(
        heuristicDocs.map((d) => d.path),
        query
      );
      docs = rankedIndices.slice(0, TOP_N_DOCS).map((i) => heuristicDocs[i]).filter(Boolean);
      rankingUsage = accumulateUsage(rankingUsage, usage);
    } else {
      docs = heuristicDocs;
    }

    // searchCode already fetches real snippets and limits to MAX_CODE_FILES
    const codeMatches: CodeMatch[] = rawCode.slice(0, TOP_N_CODE);

    const result: ContextResult = {
      github: { relevantPRs, relevantIssues, codeMatches },
      docs,
    };

    // Include usage only if Haiku was called for ranking (undefined otherwise)
    return NextResponse.json({ ...result, ...(rankingUsage && { usage: rankingUsage }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Context retrieval failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
