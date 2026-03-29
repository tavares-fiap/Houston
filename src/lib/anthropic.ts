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
