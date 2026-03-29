"use client";

import { useState } from "react";
import type { RepoInfo } from "@/types";

export interface IntegrationStatus {
  anthropic: "ok" | "missing" | "error";
  github: "ok" | "missing" | "error";
  linear: "ok" | "missing" | "error";
}

interface ConfigBarProps {
  repo: RepoInfo;
  onRepoChange: (repo: RepoInfo) => void;
  integrations: IntegrationStatus;
}

export default function ConfigBar({ repo, onRepoChange, integrations }: ConfigBarProps) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(`${repo.owner}/${repo.name}`);

  function handleSubmit() {
    const parts = input.split("/");
    if (parts.length === 2 && parts[0] && parts[1]) {
      onRepoChange({ owner: parts[0], name: parts[1] });
    }
    setEditing(false);
  }

  return (
    <div className="flex items-center justify-between px-5 py-3 bg-zinc-950 border-b border-zinc-800">
      <div className="flex items-center gap-3">
        <span className="font-bold text-white text-sm">Houston</span>
        <span className="text-zinc-600">|</span>
        {editing ? (
          <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-white"
              placeholder="owner/repo"
              autoFocus
            />
            <button type="submit" className="text-xs text-blue-400 hover:text-blue-300">
              Save
            </button>
          </form>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 rounded px-3 py-1 text-sm hover:border-zinc-500"
          >
            <span className="text-zinc-400">Repository:</span>
            <span className="text-blue-400">{repo.owner}/{repo.name}</span>
            <span className="text-zinc-600 text-xs">▾</span>
          </button>
        )}
      </div>
      <div className="flex gap-3 text-xs text-zinc-300">
        {(["anthropic", "github", "linear"] as const).map((key) => {
          const colors = { ok: "bg-green-500", missing: "bg-yellow-500", error: "bg-red-500" };
          return (
            <span key={key} className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${colors[integrations[key]]} inline-block`} />
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
