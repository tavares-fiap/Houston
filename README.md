# Houston — AI-Powered Triage Simulator
---
> 🧑‍🚀 _- "Houston, we've had a problem"_ 
---

Houston is an intelligent triage simulator that demonstrates how AI can orchestrate communication between clients and development teams. It classifies client messages, retrieves relevant context from GitHub, creates cards on Linear, and generates dual-tone responses — all visible as a real-time step-by-step pipeline.

## Architecture

```
Client Message
      │
      ▼
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Step 1:     │     │  Step 2:     │     │  Step 3:     │     │  Step 4:     │
│  Classify    │────▶│  Context     │────▶│  Triage      │────▶│  Respond     │
│  (Claude)    │     │  (GitHub)    │     │  (Claude +   │     │  (Claude)    │
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
- **GitHub API** (Octokit) — PR/issue search and structural repository context (tree, files, commits)
- **Linear API** — Automated card creation for bugs and features
- **Vitest** — Unit and integration tests
- **Tailwind CSS** — Styling

## How AI Is Used

Houston uses the Claude API (Anthropic) via **tool use** at 3-4 points in the pipeline:

1. **Classification (Step 1):** Classifies messages into bug/question/feature/ambiguous with structured extraction. Uses a strict tiebreaker rule: when in doubt, chooses the most actionable type (bug > feature > question > ambiguous).

2. **Context enrichment (Step 2):** Two complementary mechanisms run after classification:
   - **Structural context:** Haiku receives the filtered repository tree alongside the Step 1 classification — type, summary, affected area, core question. It selects up to 10 files most likely to contain relevant code. This structural pass is independent of keyword matching and works even when keyword search returns nothing. The selected files (truncated to 200 lines each), the 10 most recent commits, the 10 most recent closed PRs, and `package.json` are fetched in parallel and forwarded to Steps 3 and 4. The tree filter is **blacklist-based** (excludes noise like `node_modules/`, `dist/`, `.git/`, `vendor/`, and binary file types) rather than extension-whitelisted — so it works across any language or stack. Paths in important directories (`src/`, `app/`, `lib/`, `components/`, etc.) are surfaced first to help Haiku make better selections. The list is capped at 1000 paths before being sent to the model.
   - **Keyword search (PRs and issues):** `searchPRs` and `searchIssues` are retained because they serve a different purpose from the structural mechanism — they find **historically relevant** PRs and issues by matching vocabulary from the client message against title and body text. This catches issues that were opened months ago and may not appear in the recent PRs list. When keyword matching returns >3 results per category, Haiku ranks them by relevance using only titles/summaries (token-efficient pre-filtering). If a category has ≤3 results, Claude is skipped entirely for that category.

3. **Card Generation (Step 3):** Generates Linear card title and description with a strict non-fabrication constraint. The model can only use information from the provided context — never invents files, functions, or hypotheses.

4. **Response Generation (Step 4):** Produces two responses with radically different tones — an empathetic, jargon-free response for the client, and a dense technical summary with hypotheses and evidence links for the developer.

**Models used:** Claude Sonnet 4.6 (default for classification, triage, responses) and Claude Haiku 4.5 (lightweight ranking in Step 2).

**Why Claude:** Native tool use guarantees structured JSON outputs without parsing hacks. The large context window accommodates the full curated context (PRs, issues, selected files, recent commits, recent PRs) in a single request. Strong instruction-following enables reliable tone differentiation and constraint adherence.

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

- **Structural file selection via repo tree + Haiku:** The current approach fetches the full repo tree, applies a blacklist filter (excludes `node_modules/`, `dist/`, binaries, and similar noise — language-agnostic), prioritizes paths in key directories (`src/`, `lib/`, etc.), caps at 1000 paths, and asks Haiku to pick the most relevant files given the classification. This works well for repos up to ~1000 filtered files. For very large monorepos, the cap could cause relevant files to be dropped; a more targeted approach would be to pre-filter by the affected area (path prefix matching) before sending to Haiku, or add semantic re-ranking with embeddings for higher precision.
- **SSE streaming:** Use Server-Sent Events to stream each step's progress instead of sequential HTTP calls.
- **Persistence:** Add a database to store processed messages and enable a history view.
- **Authentication:** Add auth to protect API keys and enable per-user configuration.
- **Multi-channel:** Extend beyond the simulator to support Discord (as described in the original product document).
- **Configurable prompts:** Allow users to customize system prompts and classification criteria.
