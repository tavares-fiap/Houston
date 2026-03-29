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
