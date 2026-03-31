# Houston — AI-Powered Triage Simulator
---
> 🧑‍🚀 _"Houston, we've had a problem."_
---
Houston is an intelligent triage simulator that shows how AI can bridge the communication gap between clients and development teams. When a client reports a problem or requests a feature, Houston classifies the message, fetches real context from GitHub, generates a Linear card, and produces two tailored responses — one for the client and one for the dev team — all orchestrated through a visible, step-by-step pipeline.

---

## Project Overview

Support and development teams operate on different wavelengths. A client says *"the app is broken"*; a developer needs to know *which module*, *what changed recently*, and *whether there's a related issue or PR*. Houston bridges that gap automatically.

**The pipeline in plain terms:**

1. A client message comes in — a bug report, a feature request, or a question.
2. Houston reads it and classifies it.
3. Houston searches the linked GitHub repository for relevant context: past PRs, issues, recent commits, and relevant source files.
4. If it's a bug or feature, Houston creates a Linear card with a structured description grounded in actual evidence.
5. Houston produces two responses: a warm, jargon-free message for the client, and a dense technical brief for the developer.

Everything happens in sequence, and each step is visible in real time in the UI.

---

## Architecture

```
Client Message
      │
      ▼
┌──────────────┐     ┌──────────────┐     ┌───────────────────┐     ┌──────────────┐
│   Step 1     │     │   Step 2     │     │     Step 3        │     │   Step 4     │
│   Classify   │────▶│   Context    │────▶│     Triage        │────▶│   Respond    │
│   (Claude    │     │   (GitHub +  │     │  (Claude + Linear)│     │   (Claude    │
│   Sonnet)    │     │   Claude     │     │                   │     │   Sonnet)    │
│              │     │   Haiku)     │     │  Skipped for      │     │              │
└──────────────┘     └──────────────┘     │  question and     │     └──────────────┘
                                          │  ambiguous        │
                                          └───────────────────┘
      │                                                                     │
      ▼                                                                     ▼
 bug / feature /                                                   Client Response
 question / ambiguous                                              + Dev Summary
```

**Token usage** is tracked at every step and displayed in the UI, giving full observability into the cost of each pipeline run.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js App Router | 16.2.1 |
| AI | Claude API (Anthropic SDK) | 0.80.0 |
| GitHub | Octokit | 5.0.5 |
| Linear | Linear SDK | 80.0.0 |
| Styling | Tailwind CSS | 4.x |
| Testing | Vitest | 4.x |
| Language | TypeScript | 5.x |

---

## How AI Is Used

Houston uses the Claude API through **structured tool use** — every Claude call returns a strongly-typed JSON object via a required tool, with no free-form parsing.

### Step 1 — Classification (`claude-sonnet-4-6`)

The message is classified into one of four types: `bug`, `feature`, `question`, or `ambiguous`. A strict tiebreaker rule is enforced in the prompt: when confidence is ambiguous between types, the most actionable type wins (`bug > feature > question > ambiguous`). The output includes a structured extraction: summary, affected area, steps to reproduce, core question, or feature description depending on the type.

### Step 2 — Context Enrichment (GitHub + `claude-haiku-4-5-20251001`)

Two mechanisms run in parallel to gather context:

**Keyword search (historical relevance):**
`searchPRs` and `searchIssues` query the GitHub repository using vocabulary extracted from the message. This surfaces issues opened months ago that would not appear in a recency-based fetch. When a category returns more than 3 results, Haiku ranks them by relevance using only titles and summaries — a token-efficient pre-filter. If 3 or fewer results come back, Haiku is skipped entirely for that category.

**Structural context (code-level understanding):**
The full repository tree is fetched and filtered through a blacklist (excludes `node_modules/`, `dist/`, `.git/`, binaries, lock files, etc.). Paths in key directories (`src/`, `lib/`, `app/`, `components/`) are prioritized and the list is capped at 1,000 entries. Haiku then selects up to 10 files most likely relevant to the reported issue, using the Step 1 classification as guidance. The selected files (truncated to 200 lines each), the 10 most recent commits, the 10 most recent closed PRs, and `package.json` are fetched in parallel and forwarded to the next steps.

This structural pass is language-agnostic: it works equally well for TypeScript, Go, Python, or Ruby repositories because the filter is based on path patterns, not file extensions.

=======
### Step 3 — Card Generation (`claude-sonnet-4-6`)

The full context — classification, relevant PRs and issues, selected files, recent commits, recent PRs, and dependencies — is assembled into a single prompt. Claude generates a Linear card title, a structured Markdown description, and labels. A strict constraint in the system prompt prevents fabrication: the model may only reference information present in the context, never invent file names, function names, or hypotheses.

### Step 4 — Response Generation (`claude-sonnet-4-6`)

Two responses are generated in a single call, written for radically different audiences:

- **Client response:** Empathetic, jargon-free, acknowledges the problem, communicates next steps.
- **Dev summary:** Dense and technical — includes hypotheses grounded in the fetched code context, links to relevant PRs and commits, and explicit gaps where information was insufficient.

### Why tool use?

Forcing Claude to respond exclusively through a named tool guarantees structured JSON output without parsing hacks or retry logic. If Claude doesn't invoke the tool, the call fails fast. This makes every step's output a typed TypeScript object at the boundary.

### Token Observability

Every Claude call returns `{ result, usage }` — `inputTokens` and `outputTokens` are tracked per step and accumulated across the pipeline. The UI displays the token count for each step and the total for the full run, giving full cost visibility.

---

## Error Fallback & Graceful Degradation

Houston is designed to degrade gracefully. A failure in one integration should not stop the pipeline.

| Scenario | Behavior |
|---|---|
| No `ANTHROPIC_API_KEY` | Pipeline stops immediately. Claude is required for all steps. UI shows error. |
| No `GITHUB_TOKEN` | Falls back to unauthenticated GitHub requests (60 req/h). UI shows yellow indicator. |
| No Linear credentials | Step 3 generates a card preview (not synced to Linear). Pipeline continues. |
| GitHub API fails | Context step returns empty GitHub data. Steps 3 and 4 work with what's available. |
| File fetch fails | Skipped silently via `Promise.allSettled`. Other files are still returned. |
| Linear API fails | Card shown as preview with empty `id` and `url`. No error thrown to the pipeline. |
| Claude fails | The failing step surfaces the error in the UI. Pipeline halts at that step. |

The health status dots in the top bar (Anthropic · GitHub · Linear) reflect the availability of each integration based on env var presence.

---

## Setup Instructions

1. Clone the repository:
   ```bash
   git clone https://github.com/tavares-fiap/houston.git
   cd houston
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables in `.env.local`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   GITHUB_TOKEN=ghp_...          # optional — public repos work without it (rate limited)
   LINEAR_API_KEY=lin_api_...    # optional — can be set at runtime in the UI
   LINEAR_TEAM_ID=...            # optional — can be selected at runtime in the UI
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

**Configuring Linear at runtime:** If `LINEAR_API_KEY` and `LINEAR_TEAM_ID` are not set in `.env.local`, click **"Linear: not configured"** in the top bar, paste your API key, click **"Fetch Teams"**, select a team, and confirm. The configuration is held in session state — it will not persist across page reloads.

---

## Running Tests

```bash
npm test
```


60 tests across 11 files covering API route handlers, pipeline integration, and utility functions.

---

## Trade-offs & Improvements

### Decisions made under time constraints

**Sequential HTTP calls instead of streaming.**
Each pipeline step is a separate POST request from the browser, executed in sequence. This keeps the architecture simple and makes each step's state independently trackable. The trade-off is latency — the client waits for each step to complete before the next begins. Server-Sent Events (SSE) or WebSockets would allow real-time streaming of partial results.

**Haiku for ranking and file selection, not embeddings.**
Using a small model as a lightweight ranker avoids the operational complexity of a vector store. The trade-off is precision: Haiku ranks by semantic understanding of titles and summaries, but can't reason about deep code relationships the way embeddings over ASTs would. For the scope of this project, the token cost and speed of Haiku make it the right choice.

**In-memory Linear configuration (session state).**
The API key and team ID configured through the UI are stored in React state and lost on page reload. Persisting them (encrypted, in a cookie or database) would require authentication, which was out of scope.

**No persistence.**
Pipeline results are not stored. There is no history view, no ability to review past runs, and no database. Adding a store (e.g., Postgres + Prisma) would enable trend analysis and message replay.

**Label lookup by name, not ID.**
When creating a Linear issue, labels are resolved by matching names against the full label list at call time. This is a linear scan on each triage call. A lookup map built at startup, or caching the label list, would eliminate this cost.

### What I would do with more time

- **Embeddings-based retrieval:** Replace keyword search with semantic similarity over a pre-indexed repository, enabling retrieval that matches intent rather than vocabulary.
- **Streaming responses:** Adopt SSE so each step streams output progressively instead of landing all at once.
- **Persistent history:** Store pipeline runs in a database to enable trend analysis and replay.
- **Authentication:** Add user accounts to protect API keys and enable per-user Linear/GitHub configuration.
- **Multi-channel input:** Extend beyond the web simulator to receive messages from Slack, Discord, or Teams via webhooks.
- **Configurable prompts:** Let users edit the system prompts for each step to tailor Houston's behavior to their team's specific vocabulary and processes.
