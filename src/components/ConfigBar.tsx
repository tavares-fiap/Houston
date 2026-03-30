"use client";

import { useState } from "react";
import type { RepoInfo, LinearConfig } from "@/types";

export interface IntegrationStatus {
  anthropic: "ok" | "missing" | "error";
  github: "ok" | "missing" | "error";
  linear: "ok" | "missing" | "error";
}

interface ConfigBarProps {
  repo: RepoInfo;
  onRepoChange: (repo: RepoInfo) => void;
  integrations: IntegrationStatus;
  linearConfig?: LinearConfig | null;
  onLinearConfigChange?: (config: LinearConfig | null) => void;
}

export default function ConfigBar({
  repo,
  onRepoChange,
  integrations,
  linearConfig,
  onLinearConfigChange,
}: ConfigBarProps) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(`${repo.owner}/${repo.name}`);

  // Linear config states
  const [editingLinear, setEditingLinear] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [linearTeams, setLinearTeams] = useState<{ id: string; name: string }[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);

  function handleSubmit() {
    const parts = input.split("/");
    if (parts.length === 2 && parts[0] && parts[1]) {
      onRepoChange({ owner: parts[0], name: parts[1] });
    }
    setEditing(false);
  }

  async function handleFetchTeams() {
    setLoadingTeams(true);
    setTeamsError(null);
    try {
      const res = await fetch("/api/linear/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKeyInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch teams");
      setLinearTeams(data.teams);
      setSelectedTeamId(data.teams[0]?.id ?? "");
    } catch (e) {
      setTeamsError(e instanceof Error ? e.message : "Failed to fetch teams");
    } finally {
      setLoadingTeams(false);
    }
  }

  function handleConfirmLinear() {
    if (!selectedTeamId || !apiKeyInput) return;
    const teamName = linearTeams.find((t) => t.id === selectedTeamId)?.name || "";
    onLinearConfigChange?.({
      apiKey: apiKeyInput,
      teamId: selectedTeamId,
      teamName,
    });
    setEditingLinear(false);
    setLinearTeams([]);
    setApiKeyInput("");
  }

  function handleClearLinear() {
    onLinearConfigChange?.(null);
    setEditingLinear(false);
    setLinearTeams([]);
    setApiKeyInput("");
    setSelectedTeamId("");
    setTeamsError(null);
  }

  return (
    <div className="flex items-center justify-between px-5 py-3 bg-zinc-950 border-b border-zinc-800">
      <div className="flex items-center gap-4">
        <span className="font-bold text-white text-sm">Houston</span>
        <span className="text-zinc-600">|</span>

        {/* Repository */}
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

        {/* Linear Config */}
        {editingLinear ? (
          <div className="flex items-center gap-2">
            {linearTeams.length === 0 ? (
              <>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white placeholder-zinc-500"
                  placeholder="Linear API key"
                  autoFocus
                />
                <button
                  onClick={handleFetchTeams}
                  disabled={!apiKeyInput || loadingTeams}
                  className="text-xs text-blue-400 hover:text-blue-300 disabled:text-zinc-600"
                >
                  {loadingTeams ? "Loading..." : "Fetch Teams"}
                </button>
                {teamsError && (
                  <span className="text-xs text-red-400">{teamsError}</span>
                )}
              </>
            ) : (
              <>
                <input
                  type="password"
                  value={apiKeyInput}
                  disabled
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-500 placeholder-zinc-600"
                  placeholder="Linear API key"
                />
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                >
                  {linearTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleConfirmLinear}
                  className="text-xs text-green-400 hover:text-green-300"
                >
                  Confirm
                </button>
                <button
                  onClick={() => {
                    setLinearTeams([]);
                    setSelectedTeamId("");
                    setTeamsError(null);
                  }}
                  className="text-xs text-zinc-500 hover:text-zinc-400"
                >
                  Change
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => linearConfig ? undefined : setEditingLinear(true)}
              disabled={!!linearConfig}
              className={`flex items-center gap-1.5 border rounded px-3 py-1 text-xs ${
                linearConfig
                  ? "bg-zinc-900 border-zinc-700 text-zinc-500 cursor-not-allowed"
                  : "bg-zinc-900 border-zinc-700 hover:border-zinc-500"
              }`}
            >
              <span className="text-zinc-400">Linear:</span>
              <span className={linearConfig ? "text-zinc-500" : "text-blue-400"}>
                {linearConfig ? linearConfig.teamName : "not configured"}
              </span>
              <span className="text-zinc-600">▾</span>
            </button>
            {linearConfig && (
              <button
                onClick={handleClearLinear}
                className="text-xs text-zinc-500 hover:text-red-400"
                title="Clear Linear configuration"
              >
                ✕
              </button>
            )}
          </div>
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
