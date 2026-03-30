import { Octokit } from "octokit";
import type { ProjectFile, RecentCommit, RecentPR } from "@/types";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

export interface RawPR {
  title: string;
  url: string;
  body: string;
  updatedAt: string;
}

export interface RawIssue {
  title: string;
  url: string;
  body: string;
  updatedAt: string;
}

export async function searchPRs(
  owner: string,
  repo: string,
  query: string
): Promise<RawPR[]> {
  const response = await octokit.rest.search.issuesAndPullRequests({
    q: `${query} repo:${owner}/${repo} is:pr`,
    per_page: 10,
    sort: "updated",
  });
  return response.data.items.map((item) => ({
    title: item.title,
    url: item.html_url,
    body: item.body ?? "",
    updatedAt: item.updated_at,
  }));
}

export async function searchIssues(
  owner: string,
  repo: string,
  query: string
): Promise<RawIssue[]> {
  const response = await octokit.rest.search.issuesAndPullRequests({
    q: `${query} repo:${owner}/${repo} is:issue`,
    per_page: 10,
    sort: "updated",
  });
  return response.data.items.map((item) => ({
    title: item.title,
    url: item.html_url,
    body: item.body ?? "",
    updatedAt: item.updated_at,
  }));
}

export async function getFileContent(
  owner: string,
  repo: string,
  path: string
): Promise<string> {
  const response = await octokit.rest.repos.getContent({
    owner,
    repo,
    path,
  });
  const data = response.data;
  if (!("content" in data)) throw new Error(`${path} is not a file`);
  return Buffer.from(data.content, "base64").toString("utf-8");
}

// Returns all file paths from the repository tree
export async function fetchRepoTree(owner: string, repo: string): Promise<string[]> {
  const response = await octokit.request("GET /repos/{owner}/{repo}/git/trees/HEAD", {
    owner,
    repo,
    recursive: "1",
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
  });
  return (response.data.tree as Array<{ type: string; path: string }>)
    .filter((item) => item.type === "blob")
    .map((item) => item.path);
}

// Returns the N most recent commits
export async function fetchRecentCommits(owner: string, repo: string, count: number): Promise<RecentCommit[]> {
  const response = await octokit.request("GET /repos/{owner}/{repo}/commits", {
    owner,
    repo,
    per_page: count,
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
  });
  return (response.data as Array<{ sha: string; commit: { message: string }; html_url: string }>).map((c) => ({
    sha: c.sha,
    message: c.commit.message.split("\n")[0],
    url: c.html_url,
  }));
}

// Reads multiple files in parallel, ignoring individual errors. Truncates to maxLines.
export async function fetchFilesBatch(
  owner: string,
  repo: string,
  paths: string[],
  maxLines = 80
): Promise<ProjectFile[]> {
  const results = await Promise.allSettled(
    paths.map(async (path) => {
      const content = await getFileContent(owner, repo, path);
      const lines = content.split("\n").slice(0, maxLines).join("\n");
      return { path, content: lines } as ProjectFile;
    })
  );
  return results
    .filter((r): r is PromiseFulfilledResult<ProjectFile> => r.status === "fulfilled")
    .map((r) => r.value);
}

// Returns the N most recently updated closed PRs
export async function fetchRecentPRs(owner: string, repo: string, count: number): Promise<RecentPR[]> {
  const response = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
    owner,
    repo,
    state: "closed",
    sort: "updated",
    per_page: count,
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
  });
  return (response.data as Array<{
    number: number;
    title: string;
    html_url: string;
    merged_at: string | null;
    body: string | null;
  }>).map((pr) => ({
    number: pr.number,
    title: pr.title,
    url: pr.html_url,
    mergedAt: pr.merged_at,
    body: pr.body ?? "",
  }));
}
