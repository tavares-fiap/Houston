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
        <span className="text-green-400">✓</span> {result.github.relevantPRs.length + (result.projectStructure?.recentPRs?.length ?? 0)} PRs
        {" · "}{result.github.relevantIssues.length} Issues
        {" · "}{result.projectStructure?.recentCommits.length} Commits
        {" · "}{result.projectStructure?.selectedFiles.length} Files
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
