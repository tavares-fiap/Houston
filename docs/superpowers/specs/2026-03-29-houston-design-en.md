# Houston — Design Document

## 1. Overview

Houston is an intelligent triage simulator that demonstrates how AI can orchestrate communication between clients and development teams. Built as a response to a technical challenge that asks for a small full-stack application with meaningful AI usage.

Instead of implementing the Discord bot described in the original product document, the project delivers a **web simulator** where the evaluator can type messages as if they were a client and observe the processing pipeline in real time — classification, context retrieval, card creation, and response generation.

### Scope decisions

- **Web simulator instead of Discord bot:** satisfies the challenge's frontend requirement and allows the evaluator to test the product directly in the browser
- **All real integrations:** Claude API, GitHub API, and Linear API work for real — they are not mocked
- **Simplified RAG:** simplified RAG based on keyword matching, sufficient for the MVP and designed to evolve to embeddings in the future. Fetches documentation directly from the target GitHub repository, no embeddings or vector store
- **6-8 hours of development:** scope calibrated for quality and clarity, not completeness

## 2. Architecture

### Stack

- **Next.js** (App Router) — frontend and backend in the same project
- **Claude API** (Anthropic) — classification, card generation, and responses
- **GitHub API** — search for PRs, issues, code, and documentation
- **Linear API** — bug and feature card creation
- **Vitest** — unit and integration tests
- **Vercel** — deployment

### Project structure

```
houston/
├── src/
│   ├── app/
│   │   ├── page.tsx                  # Main page (simulator)
│   │   ├── layout.tsx                # Root layout
│   │   └── api/
│   │       ├── classify/route.ts     # Step 1: Classify message
│   │       ├── context/route.ts      # Step 2: Context retrieval and curation
│   │       ├── triage/route.ts       # Step 3: Create card on Linear
│   │       └── respond/route.ts      # Step 4: Generate responses
│   ├── lib/
│   │   ├── anthropic.ts              # Claude API client
│   │   ├── github.ts                 # GitHub API client (pure retrieval)
│   │   ├── linear.ts                 # Linear API client
│   │   ├── rag.ts                    # Doc retrieval via GitHub (pure retrieval)
│   │   └── prompts.ts               # System prompts per step
│   ├── components/                   # React components
│   └── types/                        # Shared types
├── __tests__/                        # Tests
├── .env.local                        # API keys
└── next.config.ts
```

### Data flow (sequential pipeline)

```
[UI: Input] → POST /api/classify
                 └─ Claude API: classifies type + extracts information
                 └─ returns: { type, confidence, extracted }

[UI: Step 2] → POST /api/context
                 └─ lib/github.ts: raw retrieval (PRs, issues, code)
                 └─ lib/rag.ts: raw retrieval (docs via GitHub)
                 └─ route.ts: filtering + ranking → curated top N
                 └─ returns: { github, docs }

[UI: Step 3] → POST /api/triage  (only for bug and feature)
                 └─ Claude API: generates card title/description
                 └─ Linear API: creates card
                 └─ returns: { card: { id, url, title, description, labels } }

[UI: Step 4] → POST /api/respond
                 └─ Claude API: generates client response + dev summary
                 └─ returns: { clientResponse, devSummary }
```

Each step receives the accumulated results from previous steps. The frontend controls the flow and makes calls sequentially.

### Separation of responsibilities

- `lib/github.ts` and `lib/rag.ts` → **pure retrieval**. Fetch raw data, without filtering or ranking.
- `/api/context/route.ts` → **curation**. Receives raw results, applies filtering + ranking, returns a curated subset (top N) to avoid polluting context in subsequent steps.

## 3. API Routes

### Step 1 — `POST /api/classify`

**Input:**
```ts
{ message: string, repo?: { owner: string, name: string } }
```

**What it does:**
- Sends the message to Claude with tool use (`classify_message`) to guarantee structured JSON output
- Classifies into exactly one type: `bug`, `question`, `feature`, or `ambiguous`
- Extracts structured information: affected functionality, steps to reproduce (if bug), core question (if question), description (if feature)

**Classification rules:**
- The model must choose **exactly one type**. No ambiguous responses.
- **Tiebreaker criterion:** when in doubt, choose the most actionable type. Bug > Feature > Question > Ambiguous. Rationale: it's better to triage something as a bug and be wrong than to classify as ambiguous and do nothing.

**Output:**
```ts
{
  type: "bug" | "question" | "feature" | "ambiguous",
  confidence: number,
  extracted: {
    summary: string,
    affectedArea?: string,
    stepsToReproduce?: string[],
    coreQuestion?: string,
    featureDescription?: string
  }
}
```

### Step 2 — `POST /api/context`

**Input:** step 1 result + repo info

**What it does:**
- `lib/github.ts` searches for PRs, issues, and code (raw retrieval)
- `lib/rag.ts` searches for repo documentation via GitHub (raw retrieval)
- `route.ts` applies filtering + ranking and returns only a curated subset

**Ranking strategy (2 levels):**
1. **Heuristic (fast, no cost):** filters by recency, keyword match on title/path, lexical similarity (keyword-based)
2. **Claude-assisted (when heuristic returns >3 results per category):** sends titles/summaries to Claude to rank relevance before fetching full content — avoids burning tokens on irrelevant content. Skipped when the heuristic already returns ≤3 results per category.

**Adapts search based on type:** bugs focus on PRs/code, questions focus on docs, features focus on codebase structure.

**Output (curated, top N):**
```ts
{
  github: {
    relevantPRs: Array<{ title, url, body }>,        // top 3
    relevantIssues: Array<{ title, url, body }>,      // top 3
    codeMatches: Array<{ path, snippet }>              // top 5 snippets
  },
  docs: Array<{ path, content, relevance }>            // top 3 docs
}
```

### Step 3 — `POST /api/triage`

**Input:** results from steps 1 and 2

**Only executes for `bug` and `feature`.** For `question` and `ambiguous`, the frontend skips this step.

**What it does:**
- Uses Claude with tool use (`create_card`) to generate a markdown title and description for the card
- Creates the card on Linear API with appropriate labels (Bug / Feature Request)

**Strong constraint: do not fabricate information.** Claude can only use information present in the curated context from previous steps. If there is no evidence of where the bug is, the card says "location not identified" — it never invents a file or function. The prompt includes an explicit instruction: "Do not infer, do not guess, do not fabricate. If the information is not in the provided context, say it is not available." Hypotheses are only generated in Step 4 (devSummary), never in the card.

**Output:**
```ts
{
  card: {
    id: string,
    url: string,
    title: string,
    description: string,
    labels: string[]
  }
}
```

### Step 4 — `POST /api/respond`

**Input:** results from all previous steps

**What it does:**
- Uses Claude with tool use to generate two responses with radically different tones:
  - **Suggested response for the client:** empathetic, simple language, no technical terms, confirms the request was received and is being handled, offers next steps when possible
  - **Summary for the dev:** technical and dense, includes hypotheses based on evidence from context ("PR #42 touched this module 3 days ago"), links to PRs/issues/card, and explicit gaps ("no tests found for this flow")

**Output:**
```ts
{
  clientResponse: string,
  devSummary: string
}
```

## 4. AI Integration (Claude API)

### Why Claude

The challenge asks to explain the model choice. Reasons:
- **Native tool use:** guarantees structured outputs in classification and triage steps, no manual parsing
- **Large context window:** allows sending the entire curated context (PRs, snippets, docs) in a single request
- **Instruction-following quality:** system prompts with classification criteria and tone differentiation work well

### Usage moments

1. **Step 1 — Classification:** tool use with `classify_message`. Single type, tiebreaker by actionability.
2. **Step 2 — Ranking (optional):** lightweight call with titles/summaries to rank relevance. Token-efficient. Skipped when heuristic is sufficient.
3. **Step 3 — Card generation:** tool use with `create_card`. Non-fabrication constraint.
4. **Step 4 — Response generation:** tool use returning both responses (client + dev) with distinct tones.

### Prompts

All system prompts are centralized in `lib/prompts.ts`, one per step. Each prompt includes:
- Step role and context
- Specific rules (tiebreaker, non-fabrication, tone differentiation)
- Expected tool schema

## 5. External Integrations

### `lib/github.ts`

Pure retrieval client. Uses the GitHub REST API (or `octokit`).

**Operations:**
- `searchPRs(owner, repo, query)` — searches PRs by keywords
- `searchIssues(owner, repo, query)` — searches issues by keywords
- `searchCode(owner, repo, query)` — searches code in the repo
- `getFileContent(owner, repo, path)` — fetches content of a specific file
- `listDocs(owner, repo, docsPath?)` — lists markdown files in the repo

Authentication via GitHub token (env var). Works with public repos without a token (lower rate limit).

All functions return raw data — no filtering, no ranking.

### `lib/rag.ts`

Simplified RAG based on keyword matching, sufficient for the MVP and designed to evolve to embeddings in the future. Documentation retrieval via GitHub with keyword match against titles and content.

**Flow:**
1. Uses `github.listDocs()` to discover documentation files in the repo
2. Uses `github.getFileContent()` to fetch the content
3. Returns raw docs — curation stays in `/api/context`

**Docs fallback:** searches in `docs/` first. If it doesn't exist or is empty, falls back to `README.md`. Ensures there's always some documentation to work with.

### `lib/linear.ts`

Client for card creation. Uses the Linear GraphQL API (official SDK `@linear/sdk`).

**Operations:**
- `createIssue(teamId, title, description, labels)` — creates issue, returns id + url
- `getTeams()` — lists available teams

**Configuration via env vars:**
- `LINEAR_API_KEY` — API key
- `LINEAR_TEAM_ID` — team where cards are created

Automatic labels: "Bug" or "Feature Request" based on Step 1 classification.

### Environment variables

```
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...          # optional for public repos
LINEAR_API_KEY=lin_api_...
LINEAR_TEAM_ID=...
```

## 6. Frontend

### Layout (3 areas)

**1. Config bar (top)**
- GitHub repository selector (owner/repo) — the evaluator can switch the target repo
- Integration status indicators (green/red for Anthropic, GitHub, Linear)

**2. Input panel (left)**
- Textarea for the "client" message
- "Send to Houston" button
- Pre-built clickable example messages (a bug, a question, a feature) — makes the demo easier

**3. Processing panel (right)**
- Visual pipeline with 4 steps in vertically stacked cards
- Each step has 3 visual states:
  - **Pending (gray):** waiting for previous steps
  - **Processing (blue):** spinner + progress messages
  - **Complete (green):** expanded with detailed result
- If a step fails, shows the error on that step
- Step 1 complete shows: type (badge), confidence, extracted information
- Step 2 complete shows: PRs, issues, snippets, and docs found (collapsible)
- Step 3 complete shows: created card with real link to Linear (or "Skipped" for questions)
- Step 4 complete shows: two areas — "Response for Client" and "Summary for Dev"
- Optionally, each step can display its execution time (execution time per step)

### Configuration

- API keys: environment variables (`.env.local`)
- GitHub repository: selectable in the UI (the evaluator can switch without restarting)

## 7. Tests

### Framework

Vitest — integrated with Next.js, fast, good DX.

### What to test

**1. Classification (unit)**
- Given structured output from Claude, step 1 returns the correct type and extracted fields
- Tiebreaker test: low confidence results in the most actionable type

**2. Context curation (unit)**
- Given N raw PRs/issues/docs, `/api/context` returns at most the configured top N
- Heuristic ranking orders by relevance correctly

**3. Pipeline routing (integration)**
- `question` message skips Step 3 and goes straight to Step 4
- `bug` message goes through all 4 steps

**4. Non-fabrication constraint (unit)**
- Step 3 prompt with empty context generates a card that says "information not available"

**5. Resilience to empty context (integration)**
- When GitHub returns 0 PRs, 0 issues, 0 code matches, and RAG returns 0 docs, the pipeline does not break. Step 2 returns a valid empty structure, Step 3 creates a card with available information (only from Step 1), Step 4 generates responses normally.

### What NOT to test (MVP)

- Real calls to external APIs — mocked in tests
- React components
- Full E2E

### Setup

Mocks of clients (`lib/anthropic.ts`, `lib/github.ts`, `lib/linear.ts`).

## 8. Deployment and Deliverables

### Deployment

Vercel — direct deploy from GitHub repo, zero config with Next.js. Env vars configured in the Vercel dashboard.

### README

1. **Project overview** — what Houston is, the problem it solves
2. **Tech stack** — Next.js, Claude API, GitHub API, Linear API, Vitest
3. **Architecture diagram** — high-level pipeline (Input → Classify → Context → Triage → Respond) with the APIs involved in each step
4. **How AI is used** — the 3-4 moments of Claude usage with justification for model choice
5. **Error fallback** — behavior in case of integration failure:
   - GitHub fails → pipeline continues with empty context
   - Linear fails → Step 3 shows the card that would be created but indicates it could not be created
   - Claude fails → step fails and pipeline stops with visible error
6. **Setup instructions** — clone, `npm install`, configure `.env.local`, `npm run dev`
7. **Trade-offs / improvements** — what would be done with more time (embeddings for RAG, SSE for streaming, persistence, auth, multi-channel)

### Demo

Live demo on Vercel (if deployed) or Loom recording showing the complete flow: bug, question, and feature messages going through the pipeline.

---

**Language guideline:** All code, comments, and prompts are written in English to align with standard practices in international engineering teams.
