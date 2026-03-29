import { listDocs, getFileContent } from "@/lib/github";
import type { RawDoc } from "@/lib/github";

// Pure retrieval — no filtering or ranking. All curation happens in /api/context.
export async function searchDocs(
  owner: string,
  repo: string
): Promise<RawDoc[]> {
  // Step 1: Discover doc files
  const docPaths = await listDocs(owner, repo, "docs");

  // Fallback: try README.md if docs/ is empty
  if (docPaths.length === 0) {
    try {
      const readmeContent = await getFileContent(owner, repo, "README.md");
      return [{ path: "README.md", content: readmeContent }];
    } catch {
      return [];
    }
  }

  // Step 2: Fetch content of each doc (raw, no keyword filtering)
  const docs: RawDoc[] = [];
  for (const path of docPaths) {
    try {
      const content = await getFileContent(owner, repo, path);
      docs.push({ path, content });
    } catch {
      // Skip files that can't be fetched
    }
  }

  return docs;
}
