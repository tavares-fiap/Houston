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

// --- Step 2: File Selection (structural context) ---

export const SELECT_FILES_SYSTEM_PROMPT = `You are a code navigation assistant. Given a list of repository file paths and a problem description, select the files most likely to contain the relevant code.

Rules:
- Select at most 10 files
- Prioritize files in modules related to the affected area
- Include type/interface files if the problem involves typing issues
- Include relevant configuration files if the problem is infrastructure-related
- Return ONLY the paths from the provided list — do not invent paths`;

export const SELECT_FILES_TOOL: Anthropic.Tool = {
  name: "select_relevant_files",
  description: "Select the most relevant file paths for the given problem",
  input_schema: {
    type: "object" as const,
    properties: {
      selectedPaths: {
        type: "array",
        items: { type: "string" },
        description: "Selected file paths (max 10), ordered by relevance",
      },
    },
    required: ["selectedPaths"],
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
