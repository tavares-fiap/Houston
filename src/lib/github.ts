import { Octokit } from "octokit";

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

export interface RawCodeMatch {
  path: string;
  snippet: string;
}

export interface RawDoc {
  path: string;
  content: string;
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

// Limit code context to control token usage and latency (MVP trade-off)
const MAX_CODE_FILES = 5;
const MAX_LINES_PER_FILE = 300;
const CONTEXT_LINES_AROUND_MATCH = 5;

export async function searchCode(
  owner: string,
  repo: string,
  query: string
): Promise<RawCodeMatch[]> {
  const response = await octokit.rest.search.code({
    q: `${query} repo:${owner}/${repo}`,
    per_page: 10,
  });

  // Take top N file paths, then fetch real content
  const topPaths = response.data.items
    .slice(0, MAX_CODE_FILES)
    .map((item) => item.path);

  const keywords = query.toLowerCase().split(/\s+/);
  const results: RawCodeMatch[] = [];

  for (const filePath of topPaths) {
    try {
      const content = await getFileContent(owner, repo, filePath);
      const snippet = extractRelevantSnippet(content, keywords);
      results.push({ path: filePath, snippet });
    } catch {
      // Skip files that can't be fetched
    }
  }

  return results;
}

function extractRelevantSnippet(content: string, keywords: string[]): string {
  const lines = content.split("\n");
  const lowerLines = lines.map((l) => l.toLowerCase());

  // Find first line matching any keyword
  const matchIndex = lowerLines.findIndex((line) =>
    keywords.some((kw) => line.includes(kw))
  );

  if (matchIndex >= 0) {
    // Return ±CONTEXT_LINES_AROUND_MATCH lines around the match
    const start = Math.max(0, matchIndex - CONTEXT_LINES_AROUND_MATCH);
    const end = Math.min(lines.length, matchIndex + CONTEXT_LINES_AROUND_MATCH + 1);
    return lines.slice(start, end).join("\n");
  }

  // No keyword match — return first MAX_LINES_PER_FILE lines
  return lines.slice(0, MAX_LINES_PER_FILE).join("\n");
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

export async function listDocs(
  owner: string,
  repo: string,
  docsPath: string = "docs"
): Promise<string[]> {
  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: docsPath,
    });
    if (!Array.isArray(response.data)) return [];
    return response.data
      .filter(
        (item) =>
          item.type === "file" &&
          (item.name.endsWith(".md") || item.name.endsWith(".txt"))
      )
      .map((item) => item.path);
  } catch {
    return [];
  }
}
