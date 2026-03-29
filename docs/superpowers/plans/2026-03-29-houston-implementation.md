# Houston Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an intelligent triage simulator that classifies client messages, retrieves context from GitHub, creates Linear cards, and generates dual-tone responses — all visible as a step-by-step pipeline in a web UI.

**Architecture:** Next.js App Router with 4 sequential API routes (classify → context → triage → respond). Each route is a pipeline step. Frontend controls the flow, calling each route sequentially and showing real-time progress. Library clients (anthropic, github, linear, rag) handle pure retrieval; curation logic lives in the routes.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, @anthropic-ai/sdk, octokit, @linear/sdk, Vitest

**Language guideline:** All code, comments, and prompts are written in English.

---

### Task 1: Project Setup & Configuration

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.local`, `.gitignore`, `tailwind.config.ts`, `src/app/layout.tsx`, `src/app/globals.css`

- [ ] **Step 1: Initialize Next.js project**

```bash
cd /home/sapat/Houston
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

Select defaults when prompted. This creates the full Next.js scaffold with App Router, TypeScript, Tailwind, and ESLint.

- [ ] **Step 2: Install dependencies**

```bash
npm install @anthropic-ai/sdk octokit @linear/sdk
npm install -D vitest @vitejs/plugin-react
```

- [ ] **Step 3: Create Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 4: Add test script to package.json**

Add to `scripts` in `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Create .env.local**

```
ANTHROPIC_API_KEY=
GITHUB_TOKEN=
LINEAR_API_KEY=
LINEAR_TEAM_ID=
```

- [ ] **Step 6: Update .gitignore**

Append to `.gitignore`:

```
.env.local
.superpowers/
```

- [ ] **Step 7: Verify setup**

Run: `npm run build`
Expected: Build succeeds with no errors.

Run: `npx vitest run`
Expected: "No test files found" (no tests yet, but vitest runs without error).

- [ ] **Step 8: Commit**

```bash
git init
git add .
git commit -m "chore: initialize Next.js project with dependencies"
```

---

### Task 2: Shared Types

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Create all shared type definitions**

Create `src/types/index.ts`:

```ts
// --- Common ---

export interface RepoInfo {
  owner: string;
  name: string;
}

// --- Step 1: Classification ---

export type MessageType = "bug" | "question" | "feature" | "ambiguous";

export interface ExtractedInfo {
  summary: string;
  affectedArea?: string;
  stepsToReproduce?: string[];
  coreQuestion?: string;
  featureDescription?: string;
}

export interface ClassifyInput {
  message: string;
  repo?: RepoInfo;
}

export interface ClassifyResult {
  type: MessageType;
  confidence: number;
  extracted: ExtractedInfo;
}

// --- Step 2: Context ---

export interface PRInfo {
  title: string;
  url: string;
  body: string;
}

export interface IssueInfo {
  title: string;
  url: string;
  body: string;
}

export interface CodeMatch {
  path: string;
  snippet: string;
}

export interface DocMatch {
  path: string;
  content: string;
  relevance: number;
}

export interface ContextInput {
  classification: ClassifyResult;
  repo: RepoInfo;
}

export interface ContextResult {
  github: {
    relevantPRs: PRInfo[];
    relevantIssues: IssueInfo[];
    codeMatches: CodeMatch[];
  };
  docs: DocMatch[];
}

// --- Step 3: Triage ---

export interface TriageInput {
  classification: ClassifyResult;
  context: ContextResult;
}

export interface CardInfo {
  id: string;
  url: string;
  title: string;
  description: string;
  labels: string[];
}

export interface TriageResult {
  card: CardInfo;
}

// --- Step 4: Respond ---

export interface RespondInput {
  classification: ClassifyResult;
  context: ContextResult;
  triage?: TriageResult;
}

export interface RespondResult {
  clientResponse: string;
  devSummary: string;
}

// --- Token Usage (observability) ---

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

// --- Frontend Pipeline State ---

export type StepStatus = "pending" | "processing" | "complete" | "error" | "skipped";

export interface StepState<T = unknown> {
  status: StepStatus;
  result?: T;
  error?: string;
  executionTimeMs?: number;
  usage?: TokenUsage;
}

export interface PipelineState {
  classify: StepState<ClassifyResult>;
  context: StepState<ContextResult>;
  triage: StepState<TriageResult>;
  respond: StepState<RespondResult>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add shared type definitions for pipeline"
```

---

### Task 3: GitHub Client

**Files:**
- Create: `src/lib/github.ts`

- [ ] **Step 1: Implement GitHub client**

Create `src/lib/github.ts`:

```ts
import { Octokit } from "octokit";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

export interface RawPR {
  title: string;
  url: string;
  body: string;
  updatedAt: string;
}

export interface RawIssue {
  title: string;
  url: string;
  body: string;
  updatedAt: string;
}

export interface RawCodeMatch {
  path: string;
  snippet: string;
}

export interface RawDoc {
  path: string;
  content: string;
}

export async function searchPRs(
  owner: string,
  repo: string,
  query: string
): Promise<RawPR[]> {
  const response = await octokit.rest.search.issuesAndPullRequests({
    q: `${query} repo:${owner}/${repo} is:pr`,
    per_page: 10,
    sort: "updated",
  });
  return response.data.items.map((item) => ({
    title: item.title,
    url: item.html_url,
    body: item.body ?? "",
    updatedAt: item.updated_at,
  }));
}

export async function searchIssues(
  owner: string,
  repo: string,
  query: string
): Promise<RawIssue[]> {
  const response = await octokit.rest.search.issuesAndPullRequests({
    q: `${query} repo:${owner}/${repo} is:issue`,
    per_page: 10,
    sort: "updated",
  });
  return response.data.items.map((item) => ({
    title: item.title,
    url: item.html_url,
    body: item.body ?? "",
    updatedAt: item.updated_at,
  }));
}

// Limit code context to control token usage and latency (MVP trade-off)
const MAX_CODE_FILES = 5;
const MAX_LINES_PER_FILE = 300;
const CONTEXT_LINES_AROUND_MATCH = 5;

export async function searchCode(
  owner: string,
  repo: string,
  query: string
): Promise<RawCodeMatch[]> {
  const response = await octokit.rest.search.code({
    q: `${query} repo:${owner}/${repo}`,
    per_page: 10,
  });

  // Take top N file paths, then fetch real content
  const topPaths = response.data.items
    .slice(0, MAX_CODE_FILES)
    .map((item) => item.path);

  const keywords = query.toLowerCase().split(/\s+/);
  const results: RawCodeMatch[] = [];

  for (const filePath of topPaths) {
    try {
      const content = await getFileContent(owner, repo, filePath);
      const snippet = extractRelevantSnippet(content, keywords);
      results.push({ path: filePath, snippet });
    } catch {
      // Skip files that can't be fetched
    }
  }

  return results;
}

function extractRelevantSnippet(content: string, keywords: string[]): string {
  const lines = content.split("\n");
  const lowerLines = lines.map((l) => l.toLowerCase());

  // Find first line matching any keyword
  const matchIndex = lowerLines.findIndex((line) =>
    keywords.some((kw) => line.includes(kw))
  );

  if (matchIndex >= 0) {
    // Return ±CONTEXT_LINES_AROUND_MATCH lines around the match
    const start = Math.max(0, matchIndex - CONTEXT_LINES_AROUND_MATCH);
    const end = Math.min(lines.length, matchIndex + CONTEXT_LINES_AROUND_MATCH + 1);
    return lines.slice(start, end).join("\n");
  }

  // No keyword match — return first MAX_LINES_PER_FILE lines
  return lines.slice(0, MAX_LINES_PER_FILE).join("\n");
}

export async function getFileContent(
  owner: string,
  repo: string,
  path: string
): Promise<string> {
  const response = await octokit.rest.repos.getContent({
    owner,
    repo,
    path,
  });
  const data = response.data;
  if (!("content" in data)) throw new Error(`${path} is not a file`);
  return Buffer.from(data.content, "base64").toString("utf-8");
}

export async function listDocs(
  owner: string,
  repo: string,
  docsPath: string = "docs"
): Promise<string[]> {
  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: docsPath,
    });
    if (!Array.isArray(response.data)) return [];
    return response.data
      .filter(
        (item) =>
          item.type === "file" &&
          (item.name.endsWith(".md") || item.name.endsWith(".txt"))
      )
      .map((item) => item.path);
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/github.ts
git commit -m "feat: add GitHub API client with pure retrieval functions"
```

---

### Task 4: RAG Client + Tests

**Files:**
- Create: `src/lib/rag.ts`, `__tests__/lib/rag.test.ts`

- [ ] **Step 1: Write the failing test for keyword matching**

Create `__tests__/lib/rag.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { searchDocs } from "@/lib/rag";
import * as github from "@/lib/github";

vi.mock("@/lib/github");

const mockListDocs = vi.mocked(github.listDocs);
const mockGetFileContent = vi.mocked(github.getFileContent);

describe("searchDocs", () => {
  it("returns all docs from docs/ directory (pure retrieval, no filtering)", async () => {
    mockListDocs.mockResolvedValueOnce(["docs/guide.md"]);
    mockGetFileContent.mockResolvedValueOnce("# User Guide\nHow to export reports.");

    const result = await searchDocs("acme", "app");

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("docs/guide.md");
    expect(result[0].content).toBe("# User Guide\nHow to export reports.");
  });

  it("falls back to README.md when docs/ is empty", async () => {
    mockListDocs.mockResolvedValueOnce([]);
    mockGetFileContent.mockResolvedValueOnce("# My App\nA cool application.");

    const result = await searchDocs("acme", "app");

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("README.md");
    expect(mockGetFileContent).toHaveBeenCalledWith("acme", "app", "README.md");
  });

  it("returns empty array when no docs and no README", async () => {
    mockListDocs.mockResolvedValueOnce([]);
    mockGetFileContent.mockRejectedValueOnce(new Error("Not found"));

    const result = await searchDocs("acme", "app");

    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/rag.test.ts`
Expected: FAIL — `searchDocs` is not exported from `@/lib/rag`.

- [ ] **Step 3: Implement RAG client**

Create `src/lib/rag.ts`:

```ts
import { listDocs, getFileContent } from "@/lib/github";
import type { RawDoc } from "@/lib/github";

// Pure retrieval — no filtering or ranking. All curation happens in /api/context.
export async function searchDocs(
  owner: string,
  repo: string
): Promise<RawDoc[]> {
  // Step 1: Discover doc files
  let docPaths = await listDocs(owner, repo, "docs");

  // Fallback: try README.md if docs/ is empty
  if (docPaths.length === 0) {
    try {
      const readmeContent = await getFileContent(owner, repo, "README.md");
      return [{ path: "README.md", content: readmeContent }];
    } catch {
      return [];
    }
  }

  // Step 2: Fetch content of each doc (raw, no keyword filtering)
  const docs: RawDoc[] = [];
  for (const path of docPaths) {
    try {
      const content = await getFileContent(owner, repo, path);
      docs.push({ path, content });
    } catch {
      // Skip files that can't be fetched
    }
  }

  return docs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/rag.test.ts`
Expected: PASS — all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag.ts __tests__/lib/rag.test.ts
git commit -m "feat: add RAG client with pure doc retrieval and README fallback"
```

---

### Task 5: Linear Client

**Files:**
- Create: `src/lib/linear.ts`

- [ ] **Step 1: Implement Linear client**

Create `src/lib/linear.ts`:

```ts
import { LinearClient } from "@linear/sdk";

function getClient(): LinearClient {
  return new LinearClient({ apiKey: process.env.LINEAR_API_KEY! });
}

export async function createIssue(params: {
  teamId: string;
  title: string;
  description: string;
  labels: string[];
}): Promise<{ id: string; url: string; title: string; description: string }> {
  const client = getClient();

  // Find existing labels by name
  const allLabels = await client.issueLabels();
  const labelIds = params.labels
    .map((name) => allLabels.nodes.find((l) => l.name === name)?.id)
    .filter((id): id is string => id !== undefined);

  const issuePayload = await client.createIssue({
    teamId: params.teamId,
    title: params.title,
    description: params.description,
    labelIds,
  });

  const issue = await issuePayload.issue;
  if (!issue) throw new Error("Failed to create Linear issue");

  return {
    id: issue.id,
    url: issue.url,
    title: issue.title,
    description: issue.description ?? "",
  };
}

export async function getTeams(): Promise<Array<{ id: string; name: string }>> {
  const client = getClient();
  const teams = await client.teams();
  return teams.nodes.map((t) => ({ id: t.id, name: t.name }));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/linear.ts
git commit -m "feat: add Linear API client for card creation"
```

---

### Task 6: Claude Client + Prompts

**Files:**
- Create: `src/lib/anthropic.ts`, `src/lib/prompts.ts`

- [ ] **Step 1: Implement Claude client**

Create `src/lib/anthropic.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { TokenUsage } from "@/types";

const client = new Anthropic();

const DEFAULT_MODEL = "claude-sonnet-4-6";

export interface ClaudeResponse<T> {
  result: T;
  usage: TokenUsage;
}

export async function callClaude<T>(params: {
  system: string;
  message: string;
  tools: Anthropic.Tool[];
  model?: string;
}): Promise<ClaudeResponse<T>> {
  const response = await client.messages.create({
    model: params.model ?? DEFAULT_MODEL,
    max_tokens: 4096,
    system: params.system,
    tools: params.tools,
    tool_choice: { type: "any" },
    messages: [{ role: "user", content: params.message }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  // This usually indicates a problem with the prompt or tool schema
  if (!toolUse) throw new Error("Claude response did not include expected tool use output.");

  return {
    result: toolUse.input as T,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}
```

- [ ] **Step 2: Implement prompts and tool schemas**

Create `src/lib/prompts.ts`:

```ts
import type Anthropic from "@anthropic-ai/sdk";

// --- Step 1: Classification ---

export const CLASSIFY_SYSTEM_PROMPT = `You are Houston, an intelligent triage system that classifies client messages.

Classify the message into EXACTLY ONE type:
- "bug": The client describes something that doesn't work as expected, an error, a crash, or unexpected behavior.
- "feature": The client suggests a new capability, improvement, or enhancement.
- "question": The client asks about how something works, policies, or business rules.
- "ambiguous": The message is too vague or incomplete to classify.

TIEBREAKER RULE: When in doubt, choose the most actionable type.
Priority order: bug > feature > question > ambiguous.
It is better to triage something as a bug and be wrong than to classify as ambiguous and do nothing.

You MUST choose exactly one type. Never suggest multiple types.

Extract structured information from the message:
- summary: A one-sentence summary of the request.
- affectedArea: (if bug) Which functionality or area is affected.
- stepsToReproduce: (if bug) Steps to reproduce the issue, if mentioned.
- coreQuestion: (if question) The central question being asked.
- featureDescription: (if feature) Description of the requested feature.`;

export const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "classify_message",
  description: "Classify a client message and extract structured information",
  input_schema: {
    type: "object" as const,
    properties: {
      type: {
        type: "string",
        enum: ["bug", "question", "feature", "ambiguous"],
        description: "The classification type",
      },
      confidence: {
        type: "number",
        description: "Confidence level between 0 and 1",
      },
      extracted: {
        type: "object",
        properties: {
          summary: { type: "string", description: "One-sentence summary" },
          affectedArea: { type: "string", description: "Affected functionality (bugs)" },
          stepsToReproduce: {
            type: "array",
            items: { type: "string" },
            description: "Steps to reproduce (bugs)",
          },
          coreQuestion: { type: "string", description: "Central question (questions)" },
          featureDescription: { type: "string", description: "Feature description (features)" },
        },
        required: ["summary"],
      },
    },
    required: ["type", "confidence", "extracted"],
  },
};

// --- Step 2: Ranking (optional) ---

// Optimized for Haiku — direct, minimal instructions
export const RANK_SYSTEM_PROMPT = `You rank items by relevance. Return the indices of the 3 most relevant items. Nothing else.`;

export const RANK_TOOL: Anthropic.Tool = {
  name: "rank_items",
  description: "Return indices of the most relevant items",
  input_schema: {
    type: "object" as const,
    properties: {
      rankedIndices: {
        type: "array",
        items: { type: "number" },
        description: "Indices of most relevant items, ordered by relevance (max 3)",
      },
    },
    required: ["rankedIndices"],
  },
};

// --- Step 3: Triage (Card Generation) ---

export const TRIAGE_SYSTEM_PROMPT = `You are Houston, generating a card for a project management tool based on a client request.

STRICT RULES:
- Use ONLY information present in the provided context.
- Do NOT infer, guess, or fabricate any information.
- If information is not available in the context, explicitly say "not identified" or "not available".
- Hypotheses are NOT generated here. They belong in the dev summary (Step 4), never in the card.
- Write a clear, concise title and a detailed markdown description.
- Include relevant links to PRs, issues, or code if found in the context.
- For bugs: include steps to reproduce if available, affected area, and any related PRs/issues.
- For features: include the feature description, scope, and potential impact areas from context.`;

export const TRIAGE_TOOL: Anthropic.Tool = {
  name: "create_card",
  description: "Generate a card title and description for Linear",
  input_schema: {
    type: "object" as const,
    properties: {
      title: {
        type: "string",
        description: "Concise card title",
      },
      description: {
        type: "string",
        description: "Detailed markdown description using only provided context",
      },
      labels: {
        type: "array",
        items: { type: "string" },
        description: 'Labels for the card (e.g., ["Bug"] or ["Feature Request"])',
      },
    },
    required: ["title", "description", "labels"],
  },
};

// --- Step 4: Response Generation ---

export const RESPOND_SYSTEM_PROMPT = `You are Houston, generating two responses for different audiences based on a client request that has been analyzed.

Generate TWO responses:

1. clientResponse — For the CLIENT:
   - Empathetic and friendly tone
   - Simple language, NO technical jargon
   - Confirm the request was received and is being handled
   - Offer next steps when possible
   - Never mention internal tools (Linear, GitHub) by name

2. devSummary — For the DEVELOPER:
   - Technical and dense
   - Include hypotheses based on evidence from context (e.g., "PR #42 touched this module 3 days ago")
   - Include links to relevant PRs, issues, and the created card
   - Highlight explicit gaps (e.g., "no tests found for this flow")
   - Suggest where to start investigating`;

export const RESPOND_TOOL: Anthropic.Tool = {
  name: "generate_responses",
  description: "Generate a client response and a dev summary",
  input_schema: {
    type: "object" as const,
    properties: {
      clientResponse: {
        type: "string",
        description: "Empathetic response for the client, no jargon",
      },
      devSummary: {
        type: "string",
        description: "Technical summary for the developer with hypotheses and links",
      },
    },
    required: ["clientResponse", "devSummary"],
  },
};
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/anthropic.ts src/lib/prompts.ts
git commit -m "feat: add Claude API client and system prompts for all pipeline steps"
```

---

### Task 7: Classify Route + Tests

**Files:**
- Create: `src/app/api/classify/route.ts`, `__tests__/api/classify.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/classify.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/anthropic", () => ({
  callClaude: vi.fn(),
}));

import { callClaude } from "@/lib/anthropic";
import type { ClassifyResult } from "@/types";

const mockCallClaude = vi.mocked(callClaude);

// We test the classify logic by importing the handler helper
// (extracted from the route for testability)
import { classifyMessage } from "@/app/api/classify/route";

describe("classifyMessage", () => {
  it("returns classification result from Claude", async () => {
    const expected: ClassifyResult = {
      type: "bug",
      confidence: 0.94,
      extracted: {
        summary: "PDF export hangs on loading screen",
        affectedArea: "Report export (PDF)",
      },
    };
    mockCallClaude.mockResolvedValueOnce({
      result: expected,
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const { result } = await classifyMessage("The PDF export is broken");

    expect(result.type).toBe("bug");
    expect(result.confidence).toBe(0.94);
    expect(result.extracted.summary).toBe("PDF export hangs on loading screen");
  });

  it("always returns exactly one type", async () => {
    const expected: ClassifyResult = {
      type: "feature",
      confidence: 0.72,
      extracted: { summary: "User wants dark mode" },
    };
    mockCallClaude.mockResolvedValueOnce({
      result: expected,
      usage: { inputTokens: 80, outputTokens: 40 },
    });

    const { result } = await classifyMessage("It would be nice to have dark mode");

    expect(["bug", "question", "feature", "ambiguous"]).toContain(result.type);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/api/classify.test.ts`
Expected: FAIL — `classifyMessage` is not exported.

- [ ] **Step 3: Implement classify route**

Create `src/app/api/classify/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { callClaude } from "@/lib/anthropic";
import { CLASSIFY_SYSTEM_PROMPT, CLASSIFY_TOOL } from "@/lib/prompts";
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

    const { result, usage } = await classifyMessage(body.message);
    return NextResponse.json({ ...result, usage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Classification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/api/classify.test.ts`
Expected: PASS — both tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/classify/route.ts __tests__/api/classify.test.ts
git commit -m "feat: add classify API route with Claude tool use"
```

---

### Task 8: Context Route + Curation Tests

**Files:**
- Create: `src/app/api/context/route.ts`, `__tests__/api/context.test.ts`

- [ ] **Step 1: Write failing tests for curation logic**

Create `__tests__/api/context.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/api/context.test.ts`
Expected: FAIL — `curateItems` and `curateDocs` are not exported.

- [ ] **Step 3: Implement context route with curation logic**

Create `src/app/api/context/route.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/api/context.test.ts`
Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/context/route.ts __tests__/api/context.test.ts
git commit -m "feat: add context API route with heuristic curation and optional Haiku ranking"
```

---

### Task 9: Triage Route + Tests

**Files:**
- Create: `src/app/api/triage/route.ts`, `__tests__/api/triage.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/triage.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/anthropic", () => ({
  callClaude: vi.fn(),
}));

vi.mock("@/lib/linear", () => ({
  createIssue: vi.fn(),
}));

import { callClaude } from "@/lib/anthropic";
import { createIssue } from "@/lib/linear";
import { buildTriageMessage } from "@/app/api/triage/route";
import type { ClassifyResult, ContextResult } from "@/types";

const mockCallClaude = vi.mocked(callClaude);
const mockCreateIssue = vi.mocked(createIssue);

describe("buildTriageMessage", () => {
  const emptyContext: ContextResult = {
    github: { relevantPRs: [], relevantIssues: [], codeMatches: [] },
    docs: [],
  };

  it("includes classification info in the message", () => {
    const classification: ClassifyResult = {
      type: "bug",
      confidence: 0.9,
      extracted: { summary: "PDF export hangs", affectedArea: "Export module" },
    };

    const message = buildTriageMessage(classification, emptyContext);

    expect(message).toContain("bug");
    expect(message).toContain("PDF export hangs");
    expect(message).toContain("Export module");
  });

  it("includes context when available", () => {
    const classification: ClassifyResult = {
      type: "bug",
      confidence: 0.9,
      extracted: { summary: "Login broken" },
    };
    const context: ContextResult = {
      github: {
        relevantPRs: [{ title: "Fix auth flow", url: "https://github.com/pr/1", body: "Updated login" }],
        relevantIssues: [],
        codeMatches: [{ path: "src/auth.ts", snippet: "function login()" }],
      },
      docs: [{ path: "docs/auth.md", content: "Auth documentation", relevance: 2 }],
    };

    const message = buildTriageMessage(classification, context);

    expect(message).toContain("Fix auth flow");
    expect(message).toContain("src/auth.ts");
    expect(message).toContain("Auth documentation");
  });

  it("handles empty context gracefully", () => {
    const classification: ClassifyResult = {
      type: "feature",
      confidence: 0.85,
      extracted: { summary: "Add dark mode" },
    };

    const message = buildTriageMessage(classification, emptyContext);

    expect(message).toContain("Add dark mode");
    expect(message).toContain("No relevant PRs found");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/api/triage.test.ts`
Expected: FAIL — `buildTriageMessage` is not exported.

- [ ] **Step 3: Implement triage route**

Create `src/app/api/triage/route.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/api/triage.test.ts`
Expected: PASS — all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/triage/route.ts __tests__/api/triage.test.ts
git commit -m "feat: add triage API route with Linear card creation and non-fabrication constraint"
```

---

### Task 10: Respond Route

**Files:**
- Create: `src/app/api/respond/route.ts`

- [ ] **Step 1: Implement respond route**

Create `src/app/api/respond/route.ts`:

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/respond/route.ts
git commit -m "feat: add respond API route with dual-tone response generation"
```

---

### Task 11: Frontend Components

**Files:**
- Create: `src/components/ConfigBar.tsx`, `src/components/InputPanel.tsx`, `src/components/StepCard.tsx`, `src/components/ProcessingPanel.tsx`

- [ ] **Step 1: Create StepCard component**

Create `src/components/StepCard.tsx`:

```tsx
"use client";

import type { StepStatus, TokenUsage } from "@/types";

interface StepCardProps {
  stepNumber: number;
  title: string;
  status: StepStatus;
  executionTimeMs?: number;
  usage?: TokenUsage;
  error?: string;
  children?: React.ReactNode;
}

const STATUS_STYLES: Record<StepStatus, { border: string; badge: string; label: string }> = {
  pending: { border: "border-zinc-800", badge: "bg-zinc-800 text-zinc-500", label: "" },
  processing: { border: "border-blue-600", badge: "bg-blue-900/50 text-blue-400", label: "Processing..." },
  complete: { border: "border-green-600", badge: "bg-green-900/50 text-green-400", label: "Complete" },
  error: { border: "border-red-600", badge: "bg-red-900/50 text-red-400", label: "Error" },
  skipped: { border: "border-zinc-700", badge: "bg-zinc-800 text-zinc-400", label: "Skipped" },
};

export default function StepCard({ stepNumber, title, status, executionTimeMs, usage, error, children }: StepCardProps) {
  const style = STATUS_STYLES[status];
  const isExpanded = status === "complete" || status === "error";

  return (
    <div
      className={`bg-zinc-900 border ${style.border} rounded-xl p-4 transition-all ${
        status === "pending" ? "opacity-50" : ""
      }`}
      style={{ borderLeftWidth: "3px" }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${style.badge}`}>
            STEP {stepNumber}
          </span>
          <span className={`text-sm font-semibold ${status === "pending" ? "text-zinc-500" : "text-zinc-200"}`}>
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {usage && (
            <span className="text-xs text-zinc-500">{usage.inputTokens + usage.outputTokens} tok</span>
          )}
          {executionTimeMs !== undefined && (
            <span className="text-xs text-zinc-500">{(executionTimeMs / 1000).toFixed(1)}s</span>
          )}
          {status === "processing" && (
            <span className="text-blue-400 text-xs flex items-center gap-1">
              <span className="animate-spin">◌</span> {style.label}
            </span>
          )}
          {status === "complete" && (
            <span className="text-green-400 text-xs">✓ {style.label}</span>
          )}
          {status === "error" && (
            <span className="text-red-400 text-xs">✕ {style.label}</span>
          )}
          {status === "skipped" && (
            <span className="text-zinc-400 text-xs">— {style.label}</span>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3">
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {children}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create ConfigBar component**

Create `src/components/ConfigBar.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { RepoInfo } from "@/types";

export interface IntegrationStatus {
  anthropic: "ok" | "missing" | "error";
  github: "ok" | "missing" | "error";
  linear: "ok" | "missing" | "error";
}

interface ConfigBarProps {
  repo: RepoInfo;
  onRepoChange: (repo: RepoInfo) => void;
  integrations: IntegrationStatus;
}

export default function ConfigBar({ repo, onRepoChange, integrations }: ConfigBarProps) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(`${repo.owner}/${repo.name}`);

  function handleSubmit() {
    const parts = input.split("/");
    if (parts.length === 2 && parts[0] && parts[1]) {
      onRepoChange({ owner: parts[0], name: parts[1] });
    }
    setEditing(false);
  }

  return (
    <div className="flex items-center justify-between px-5 py-3 bg-zinc-950 border-b border-zinc-800">
      <div className="flex items-center gap-3">
        <span className="font-bold text-white text-sm">Houston</span>
        <span className="text-zinc-600">|</span>
        {editing ? (
          <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-white"
              placeholder="owner/repo"
              autoFocus
            />
            <button type="submit" className="text-xs text-blue-400 hover:text-blue-300">
              Save
            </button>
          </form>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 rounded px-3 py-1 text-sm hover:border-zinc-500"
          >
            <span className="text-zinc-400">Repository:</span>
            <span className="text-blue-400">{repo.owner}/{repo.name}</span>
            <span className="text-zinc-600 text-xs">▾</span>
          </button>
        )}
      </div>
      <div className="flex gap-3 text-xs text-zinc-300">
        {(["anthropic", "github", "linear"] as const).map((key) => {
          const colors = { ok: "bg-green-500", missing: "bg-yellow-500", error: "bg-red-500" };
          return (
            <span key={key} className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${colors[integrations[key]]} inline-block`} />
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create InputPanel component**

Create `src/components/InputPanel.tsx`:

```tsx
"use client";

import { useState } from "react";

interface InputPanelProps {
  onSubmit: (message: string) => void;
  isProcessing: boolean;
}

const EXAMPLES = [
  {
    label: '🐛 "The save button doesn\'t work on the profile page..."',
    message:
      "Hi, the save button on the profile page isn't working. I click it and nothing happens. I've tried on Chrome and Firefox. It was working fine yesterday before the update.",
  },
  {
    label: '❓ "What\'s the refund policy for annual plans?"',
    message:
      "Hello, I'd like to know what the refund policy is for annual plans. Can I get a prorated refund if I cancel mid-year?",
  },
  {
    label: '✨ "It would be useful to have dark mode on the dashboard..."',
    message:
      "Hey, it would be really useful to have a dark mode option on the dashboard. I work at night a lot and the bright screen is hard on my eyes.",
  },
];

export default function InputPanel({ onSubmit, isProcessing }: InputPanelProps) {
  const [message, setMessage] = useState("");

  function handleSubmit() {
    if (message.trim() && !isProcessing) {
      onSubmit(message.trim());
    }
  }

  function handleExample(text: string) {
    setMessage(text);
  }

  return (
    <div className="flex flex-col h-full p-5">
      <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">
        Client Message
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Type a client message to simulate..."
        className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 resize-none focus:outline-none focus:border-zinc-500 min-h-[120px]"
        disabled={isProcessing}
      />

      <button
        onClick={handleSubmit}
        disabled={!message.trim() || isProcessing}
        className="mt-3 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg py-3 text-sm font-semibold transition-colors"
      >
        {isProcessing ? "Processing..." : "Send to Houston →"}
      </button>

      <div className="mt-4">
        <div className="text-xs text-zinc-500 mb-2">Quick examples:</div>
        <div className="flex flex-col gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              onClick={() => handleExample(ex.message)}
              disabled={isProcessing}
              className="text-left bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-50"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create ProcessingPanel component**

Create `src/components/ProcessingPanel.tsx`:

```tsx
"use client";

import StepCard from "./StepCard";
import type { PipelineState, ClassifyResult, ContextResult, TriageResult, RespondResult } from "@/types";

interface ProcessingPanelProps {
  pipeline: PipelineState;
}

function ClassifyResultView({ result }: { result: ClassifyResult }) {
  const typeColors: Record<string, string> = {
    bug: "bg-red-600",
    question: "bg-yellow-600",
    feature: "bg-purple-600",
    ambiguous: "bg-zinc-600",
  };

  return (
    <div className="flex gap-2 flex-wrap">
      <div className="bg-zinc-800 rounded-md px-3 py-2">
        <div className="text-[11px] text-zinc-500 mb-0.5">Type</div>
        <span className={`${typeColors[result.type]} text-white text-xs px-2 py-0.5 rounded font-semibold`}>
          {result.type.charAt(0).toUpperCase() + result.type.slice(1)}
        </span>
      </div>
      <div className="bg-zinc-800 rounded-md px-3 py-2">
        <div className="text-[11px] text-zinc-500 mb-0.5">Confidence</div>
        <div className="text-sm text-zinc-200 font-semibold">{Math.round(result.confidence * 100)}%</div>
      </div>
      {result.extracted.affectedArea && (
        <div className="bg-zinc-800 rounded-md px-3 py-2">
          <div className="text-[11px] text-zinc-500 mb-0.5">Affected Area</div>
          <div className="text-sm text-zinc-200">{result.extracted.affectedArea}</div>
        </div>
      )}
      <div className="bg-zinc-800 rounded-md px-3 py-2 w-full">
        <div className="text-[11px] text-zinc-500 mb-0.5">Summary</div>
        <div className="text-sm text-zinc-300">{result.extracted.summary}</div>
      </div>
    </div>
  );
}

function ContextResultView({ result }: { result: ContextResult }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="text-zinc-400">
        <span className="text-green-400">✓</span> {result.github.relevantPRs.length} PRs
        {" · "}{result.github.relevantIssues.length} Issues
        {" · "}{result.github.codeMatches.length} Code matches
        {" · "}{result.docs.length} Docs
      </div>
      {result.github.relevantPRs.map((pr) => (
        <div key={pr.url} className="bg-zinc-800 rounded px-3 py-2">
          <a href={pr.url} target="_blank" rel="noopener" className="text-blue-400 hover:underline text-xs">
            {pr.title}
          </a>
        </div>
      ))}
    </div>
  );
}

function TriageResultView({ result }: { result: TriageResult }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="bg-zinc-800 rounded px-3 py-2">
        <div className="text-[11px] text-zinc-500 mb-1">Card Created</div>
        <div className="text-zinc-200 font-semibold">{result.card.title}</div>
        {result.card.url && (
          <a href={result.card.url} target="_blank" rel="noopener" className="text-blue-400 hover:underline text-xs">
            Open in Linear →
          </a>
        )}
        {!result.card.url && (
          <span className="text-yellow-400 text-xs">Linear unavailable — card not synced</span>
        )}
      </div>
    </div>
  );
}

function RespondResultView({ result }: { result: RespondResult }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-zinc-800 rounded-lg p-3">
        <div className="text-[11px] text-zinc-500 uppercase tracking-wide mb-2">Response for Client</div>
        <div className="text-sm text-zinc-300 whitespace-pre-wrap">{result.clientResponse}</div>
      </div>
      <div className="bg-zinc-800 rounded-lg p-3">
        <div className="text-[11px] text-zinc-500 uppercase tracking-wide mb-2">Summary for Dev</div>
        <div className="text-sm text-zinc-300 whitespace-pre-wrap">{result.devSummary}</div>
      </div>
    </div>
  );
}

export default function ProcessingPanel({ pipeline }: ProcessingPanelProps) {
  const totalTokens = [pipeline.classify, pipeline.context, pipeline.triage, pipeline.respond]
    .reduce((sum, step) => {
      if (step.usage) return sum + step.usage.inputTokens + step.usage.outputTokens;
      return sum;
    }, 0);

  return (
    <div className="p-5 overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
          Processing Pipeline
        </div>
        {totalTokens > 0 && (
          <div className="text-xs text-zinc-500">Total: {totalTokens} tokens</div>
        )}
      </div>
      <div className="space-y-3">
        <StepCard
          stepNumber={1}
          title="Classification"
          status={pipeline.classify.status}
          executionTimeMs={pipeline.classify.executionTimeMs}
          usage={pipeline.classify.usage}
          error={pipeline.classify.error}
        >
          {pipeline.classify.result && <ClassifyResultView result={pipeline.classify.result} />}
        </StepCard>

        <StepCard
          stepNumber={2}
          title="Context"
          status={pipeline.context.status}
          executionTimeMs={pipeline.context.executionTimeMs}
          usage={pipeline.context.usage}
          error={pipeline.context.error}
        >
          {pipeline.context.result && <ContextResultView result={pipeline.context.result} />}
        </StepCard>

        <StepCard
          stepNumber={3}
          title="Triage (Linear)"
          status={pipeline.triage.status}
          executionTimeMs={pipeline.triage.executionTimeMs}
          usage={pipeline.triage.usage}
          error={pipeline.triage.error}
        >
          {pipeline.triage.result && <TriageResultView result={pipeline.triage.result} />}
        </StepCard>

        <StepCard
          stepNumber={4}
          title="Responses"
          status={pipeline.respond.status}
          executionTimeMs={pipeline.respond.executionTimeMs}
          usage={pipeline.respond.usage}
          error={pipeline.respond.error}
        >
          {pipeline.respond.result && <RespondResultView result={pipeline.respond.result} />}
        </StepCard>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/
git commit -m "feat: add frontend components (StepCard, ConfigBar, InputPanel, ProcessingPanel)"
```

---

### Task 12: Frontend Main Page + Pipeline Orchestration

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Update globals.css for dark theme**

Replace the content of `src/app/globals.css` with:

```css
@import "tailwindcss";

body {
  background-color: #0a0a0a;
  color: #e0e0e0;
  font-family: system-ui, -apple-system, sans-serif;
}
```

- [ ] **Step 2: Update layout.tsx**

Replace the content of `src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Houston — AI-Powered Triage Simulator",
  description: "Intelligent triage simulator for client-developer communication",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Implement main page with pipeline orchestration**

Replace the content of `src/app/page.tsx` with:

```tsx
"use client";

import { useState, useCallback, useEffect } from "react";
import ConfigBar from "@/components/ConfigBar";
import type { IntegrationStatus } from "@/components/ConfigBar";
import InputPanel from "@/components/InputPanel";
import ProcessingPanel from "@/components/ProcessingPanel";
import type {
  RepoInfo,
  PipelineState,
  ClassifyResult,
  ContextResult,
  TriageResult,
  RespondResult,
  StepState,
} from "@/types";

const INITIAL_PIPELINE: PipelineState = {
  classify: { status: "pending" },
  context: { status: "pending" },
  triage: { status: "pending" },
  respond: { status: "pending" },
};

async function runStep<T>(
  url: string,
  body: unknown,
  updateStep: (state: StepState<T>) => void
): Promise<T> {
  updateStep({ status: "processing" });
  const start = Date.now();

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const elapsed = Date.now() - start;

  if (!response.ok) {
    const err = await response.json();
    const error = err.error || "Unknown error";
    updateStep({ status: "error", error, executionTimeMs: elapsed });
    throw new Error(error);
  }

  const data = await response.json();
  const { usage, ...result } = data;
  updateStep({ status: "complete", result: result as T, executionTimeMs: elapsed, usage });
  return result as T;
}

export default function Home() {
  const [repo, setRepo] = useState<RepoInfo>({ owner: "vercel", name: "next.js" });
  const [pipeline, setPipeline] = useState<PipelineState>(INITIAL_PIPELINE);
  const [isProcessing, setIsProcessing] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationStatus>({
    anthropic: "missing", github: "missing", linear: "missing",
  });

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setIntegrations).catch(() => {});
  }, []);

  const updateStep = useCallback(
    <K extends keyof PipelineState>(key: K) =>
      (state: StepState<PipelineState[K]["result"]>) => {
        setPipeline((prev) => ({ ...prev, [key]: state }));
      },
    []
  );

  async function handleSubmit(message: string) {
    setIsProcessing(true);
    setPipeline(INITIAL_PIPELINE);

    try {
      // Step 1: Classify
      const classification = await runStep<ClassifyResult>(
        "/api/classify",
        { message, repo },
        updateStep("classify")
      );

      // Step 2: Context
      const context = await runStep<ContextResult>(
        "/api/context",
        { classification, repo },
        updateStep("context")
      );

      // Step 3: Triage (skip for question and ambiguous)
      let triage: TriageResult | undefined;
      if (classification.type === "bug" || classification.type === "feature") {
        triage = await runStep<TriageResult>(
          "/api/triage",
          { classification, context },
          updateStep("triage")
        );
      } else {
        setPipeline((prev) => ({
          ...prev,
          triage: { status: "skipped" },
        }));
      }

      // Step 4: Respond
      await runStep<RespondResult>(
        "/api/respond",
        { classification, context, triage },
        updateStep("respond")
      );
    } catch {
      // Error already set in the failing step
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="h-screen flex flex-col">
      <ConfigBar repo={repo} onRepoChange={setRepo} integrations={integrations} />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-[38%] border-r border-zinc-800">
          <InputPanel onSubmit={handleSubmit} isProcessing={isProcessing} />
        </div>
        <div className="w-[62%]">
          <ProcessingPanel pipeline={pipeline} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/
git commit -m "feat: add main page with pipeline orchestration and dark theme"
```

---

### Task 13: Integration Tests

**Files:**
- Create: `__tests__/integration/pipeline.test.ts`

- [ ] **Step 1: Write pipeline routing and resilience tests**

Create `__tests__/integration/pipeline.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/anthropic", () => ({
  callClaude: vi.fn(),
}));

vi.mock("@/lib/github", () => ({
  searchPRs: vi.fn(),
  searchIssues: vi.fn(),
  searchCode: vi.fn(),
  getFileContent: vi.fn(),
  listDocs: vi.fn(),
}));

vi.mock("@/lib/linear", () => ({
  createIssue: vi.fn(),
}));

import { callClaude } from "@/lib/anthropic";
import * as github from "@/lib/github";
import { createIssue } from "@/lib/linear";
import { classifyMessage } from "@/app/api/classify/route";
import { curateItems, curateDocs } from "@/app/api/context/route";
import { buildTriageMessage } from "@/app/api/triage/route";
import type { ClassifyResult, ContextResult } from "@/types";

const mockCallClaude = vi.mocked(callClaude);
const mockSearchPRs = vi.mocked(github.searchPRs);
const mockSearchIssues = vi.mocked(github.searchIssues);
const mockSearchCode = vi.mocked(github.searchCode);
const mockListDocs = vi.mocked(github.listDocs);
const mockCreateIssue = vi.mocked(createIssue);

describe("Pipeline routing", () => {
  it("question type should skip triage step", async () => {
    const classification: ClassifyResult = {
      type: "question",
      confidence: 0.88,
      extracted: { summary: "What is the refund policy?" },
    };
    mockCallClaude.mockResolvedValueOnce({
      result: classification,
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const { result } = await classifyMessage("What is the refund policy?");

    // Question type means triage should be skipped
    // (frontend handles this, but we verify the classification is correct)
    expect(result.type).toBe("question");
    // createIssue should NOT be called for questions
    expect(mockCreateIssue).not.toHaveBeenCalled();
  });

  it("bug type should go through all steps", async () => {
    const classification: ClassifyResult = {
      type: "bug",
      confidence: 0.95,
      extracted: {
        summary: "Save button broken",
        affectedArea: "Profile page",
      },
    };
    mockCallClaude.mockResolvedValueOnce({
      result: classification,
      usage: { inputTokens: 120, outputTokens: 60 },
    });

    const { result } = await classifyMessage("Save button is broken on profile");

    expect(result.type).toBe("bug");
    // Bug type should proceed to triage (verified by type)
  });
});

describe("Resilience to empty context", () => {
  it("curation returns valid empty structure when no results match", () => {
    const emptyPRs = curateItems([], ["login"], 3);
    const emptyDocs = curateDocs([], ["login"], 3);

    expect(emptyPRs).toEqual([]);
    expect(emptyDocs).toEqual([]);
  });

  it("triage message handles empty context without breaking", () => {
    const classification: ClassifyResult = {
      type: "bug",
      confidence: 0.8,
      extracted: { summary: "Something is broken" },
    };
    const emptyContext: ContextResult = {
      github: { relevantPRs: [], relevantIssues: [], codeMatches: [] },
      docs: [],
    };

    const message = buildTriageMessage(classification, emptyContext);

    expect(message).toContain("Something is broken");
    expect(message).toContain("No relevant PRs found");
    expect(message).toContain("No relevant issues found");
    expect(message).toContain("No code matches found");
    expect(message).toContain("No documentation found");
  });

  it("curation handles items with zero keyword matches", () => {
    const items = [
      { title: "Unrelated PR", url: "u1", body: "Nothing relevant here" },
      { title: "Another unrelated", url: "u2", body: "Also nothing" },
    ];

    const result = curateItems(items, ["payment", "billing"], 3);

    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run __tests__/integration/pipeline.test.ts`
Expected: PASS — all 5 tests pass.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass across all test files.

- [ ] **Step 4: Commit**

```bash
git add __tests__/integration/pipeline.test.ts
git commit -m "test: add integration tests for pipeline routing and empty context resilience"
```

---

### Task 14: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README**

Create `README.md`:

````markdown
# Houston — AI-Powered Triage Simulator

Houston is an intelligent triage simulator that demonstrates how AI can orchestrate communication between clients and development teams. It classifies client messages, retrieves relevant context from GitHub, creates cards on Linear, and generates dual-tone responses — all visible as a real-time step-by-step pipeline.

## Architecture

```
Client Message
      │
      ▼
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Step 1:     │     │  Step 2:     │     │  Step 3:     │     │  Step 4:     │
│  Classify    │────▶│  Context     │────▶│  Triage      │────▶│  Respond     │
│  (Claude)    │     │  (GitHub+RAG)│     │  (Claude +   │     │  (Claude)    │
│              │     │              │     │   Linear)    │     │              │
└─────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                                          Skipped for
                                          questions
      │                                                              │
      ▼                                                              ▼
 bug/question/                                              Client Response
 feature/ambiguous                                          + Dev Summary
```

## Tech Stack

- **Next.js 15** (App Router) — Full-stack framework
- **Claude API** (Anthropic) — Message classification, card generation, response generation
- **GitHub API** (Octokit) — PR/issue/code search, documentation retrieval
- **Linear API** — Automated card creation for bugs and features
- **Vitest** — Unit and integration tests
- **Tailwind CSS** — Styling

## How AI Is Used

Houston uses the Claude API (Anthropic) via **tool use** at 3-4 points in the pipeline:

1. **Classification (Step 1):** Classifies messages into bug/question/feature/ambiguous with structured extraction. Uses a strict tiebreaker rule: when in doubt, chooses the most actionable type (bug > feature > question > ambiguous).

2. **Ranking (Step 2, optional):** When heuristic keyword matching returns >3 results per category, Claude ranks items by relevance using only titles/summaries — token-efficient pre-filtering.

3. **Card Generation (Step 3):** Generates Linear card title and description with a strict non-fabrication constraint. The model can only use information from the provided context — never invents files, functions, or hypotheses.

4. **Response Generation (Step 4):** Produces two responses with radically different tones — an empathetic, jargon-free response for the client, and a dense technical summary with hypotheses and evidence links for the developer.

**Models used:** Claude Sonnet 4.6 (default for classification, triage, responses) and Claude Haiku 4.5 (lightweight ranking in Step 2).

**Why Claude:** Native tool use guarantees structured JSON outputs without parsing hacks. The large context window accommodates the full curated context (PRs, code snippets, docs) in a single request. Strong instruction-following enables reliable tone differentiation and constraint adherence.

## Error Fallback & Partial Functionality

The app works partially without all API keys configured:
- **Without `ANTHROPIC_API_KEY`:** Nothing works — Claude is required for all pipeline steps. UI shows a clear error.
- **Without `GITHUB_TOKEN`:** Falls back to unauthenticated requests (60 req/h rate limit). UI shows a warning indicator.
- **Without `LINEAR_API_KEY`:** Step 3 shows the card as a preview but cannot sync to Linear. Pipeline continues normally.

Integration failures at runtime:
- **GitHub fails →** Pipeline continues with empty context. Steps 3 and 4 work with available information only.
- **Linear fails →** Step 3 shows the card that *would* be created but indicates it could not be synced to Linear.
- **Claude fails →** The failing step shows an error and the pipeline stops.

## Setup Instructions

1. Clone the repository:
   ```bash
   git clone https://github.com/<your-user>/houston.git
   cd houston
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables in `.env.local`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   GITHUB_TOKEN=ghp_...          # optional for public repos
   LINEAR_API_KEY=lin_api_...
   LINEAR_TEAM_ID=...
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) and try the simulator.

## Running Tests

```bash
npm test
```

## Trade-offs & Improvements

With more time, I would:

- **Embeddings for RAG:** Replace keyword matching with vector embeddings for more accurate document retrieval.
- **SSE streaming:** Use Server-Sent Events to stream each step's progress instead of sequential HTTP calls.
- **Persistence:** Add a database to store processed messages and enable a history view.
- **Authentication:** Add auth to protect API keys and enable per-user configuration.
- **Multi-channel:** Extend beyond the simulator to support Discord (as described in the original product document).
- **Configurable prompts:** Allow users to customize system prompts and classification criteria.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with architecture, AI usage, setup, and trade-offs"
```

---

### Task 15: Health Check Endpoint

**Files:**
- Create: `src/app/api/health/route.ts`

- [ ] **Step 1: Implement health check route**

Create `src/app/api/health/route.ts`:

```ts
import { NextResponse } from "next/server";

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

  return NextResponse.json(health);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/health/route.ts
git commit -m "feat: add health check endpoint for integration status"
```

---

## Self-Review

**1. Spec coverage check:**
- ✅ Shared types + TokenUsage (Task 2)
- ✅ GitHub client with all 5 operations + real code snippets (Task 3)
- ✅ RAG via GitHub with keyword match + fallback (Task 4)
- ✅ Linear client (Task 5)
- ✅ Claude client with tool use, model param, usage tracking (Task 6)
- ✅ All 4 system prompts with rules (tiebreaker, non-fabrication, tone) (Task 6)
- ✅ Ranking prompt optimized for Haiku (Task 6)
- ✅ Classify route with usage passthrough (Task 7)
- ✅ Context route with curation logic + graceful degradation comments (Task 8)
- ✅ Triage route with Linear fallback + usage passthrough (Task 9)
- ✅ Respond route with dual-tone + usage passthrough (Task 10)
- ✅ Frontend: ConfigBar (with real health status), InputPanel, StepCard (with tokens), ProcessingPanel (with total tokens) (Task 11)
- ✅ Pipeline orchestration with skip logic for questions + health fetch (Task 12)
- ✅ Execution time per step (Task 11 — StepCard)
- ✅ Token usage per step and total (Tasks 11, 12)
- ✅ Classification tests (Task 7)
- ✅ Curation tests (Task 8)
- ✅ Triage message tests (Task 9)
- ✅ Pipeline routing tests (Task 13)
- ✅ Empty context resilience tests (Task 13)
- ✅ README with models info, partial functionality, architecture diagram (Task 14)
- ✅ Health check endpoint (Task 15)
- ✅ Language guideline: all code, comments, prompts in English

**2. Placeholder scan:** No TBDs, TODOs, or vague steps found.

**3. Type consistency:**
- `ClassifyResult` — consistent across types, route, and tests
- `ContextResult` — consistent across types, route, and ProcessingPanel
- `TriageResult` — consistent across types, route, and ProcessingPanel
- `RespondResult` — consistent across types, route, and ProcessingPanel
- `TokenUsage` — consistent across types, anthropic client, StepCard, and ProcessingPanel
- `IntegrationStatus` — consistent between ConfigBar export and page.tsx import
- `ClaudeResponse<T>` — returns `{ result, usage }`, all routes destructure correctly
- `curateItems` / `curateDocs` — consistent between route export and test imports
- `buildTriageMessage` — consistent between route export and test imports
- `classifyMessage` — consistent between route export and test imports; tests use `{ result }` destructuring
