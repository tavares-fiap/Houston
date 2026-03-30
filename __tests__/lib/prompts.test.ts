import { describe, it, expect } from "vitest";
import {
  SELECT_FILES_SYSTEM_PROMPT,
  SELECT_FILES_TOOL,
} from "@/lib/prompts";

describe("SELECT_FILES_SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof SELECT_FILES_SYSTEM_PROMPT).toBe("string");
    expect(SELECT_FILES_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it("instructs to select at most 10 files", () => {
    expect(SELECT_FILES_SYSTEM_PROMPT).toContain("10");
  });

  it("prohibits inventing paths not in the provided list", () => {
    expect(SELECT_FILES_SYSTEM_PROMPT).toMatch(/only.*paths.*provided list|provided list.*only.*paths/i);
  });
});

describe("SELECT_FILES_TOOL", () => {
  it("has the correct tool name", () => {
    expect(SELECT_FILES_TOOL.name).toBe("select_relevant_files");
  });

  it("requires selectedPaths in the schema", () => {
    const required = SELECT_FILES_TOOL.input_schema.required as string[];
    expect(required).toContain("selectedPaths");
  });

  it("defines selectedPaths as an array of strings", () => {
    const props = SELECT_FILES_TOOL.input_schema.properties as Record<string, { type: string; items?: { type: string } }>;
    expect(props.selectedPaths.type).toBe("array");
    expect(props.selectedPaths.items?.type).toBe("string");
  });

  it("has a description on the tool", () => {
    expect(typeof SELECT_FILES_TOOL.description).toBe("string");
    expect(SELECT_FILES_TOOL.description.length).toBeGreaterThan(0);
  });
});
