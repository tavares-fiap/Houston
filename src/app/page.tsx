"use client";

import { useState, useCallback, useEffect } from "react";
import ConfigBar from "@/components/ConfigBar";
import type { IntegrationStatus } from "@/components/ConfigBar";
import InputPanel from "@/components/InputPanel";
import ProcessingPanel from "@/components/ProcessingPanel";
import type {
  RepoInfo,
  LinearConfig,
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
  const [linearConfig, setLinearConfig] = useState<LinearConfig | null>(null);

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setIntegrations).catch(() => {});
  }, []);

  useEffect(() => {
    if (linearConfig) {
      setIntegrations((prev) => ({ ...prev, linear: "ok" }));
    }
  }, [linearConfig]);

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
          {
            classification,
            context,
            linearApiKey: linearConfig?.apiKey,
            linearTeamId: linearConfig?.teamId,
          },
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
      <ConfigBar
        repo={repo}
        onRepoChange={setRepo}
        integrations={integrations}
        linearConfig={linearConfig}
        onLinearConfigChange={setLinearConfig}
      />
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
