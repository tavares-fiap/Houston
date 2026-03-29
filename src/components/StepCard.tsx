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
