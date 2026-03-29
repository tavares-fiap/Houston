import { LinearClient } from "@linear/sdk";

function getClient(): LinearClient {
  return new LinearClient({ apiKey: process.env.LINEAR_API_KEY! });
}

export async function createIssue(params: {
  teamId: string;
  title: string;
  description: string;
  labels: string[];
}): Promise<{ id: string; url: string; title: string; description: string }> {
  const client = getClient();

  // Find existing labels by name
  const allLabels = await client.issueLabels();
  const labelIds = params.labels
    .map((name) => allLabels.nodes.find((l) => l.name === name)?.id)
    .filter((id): id is string => id !== undefined);

  const issuePayload = await client.createIssue({
    teamId: params.teamId,
    title: params.title,
    description: params.description,
    labelIds,
  });

  const issue = await issuePayload.issue;
  if (!issue) throw new Error("Failed to create Linear issue");

  return {
    id: issue.id,
    url: issue.url,
    title: issue.title,
    description: issue.description ?? "",
  };
}

export async function getTeams(): Promise<Array<{ id: string; name: string }>> {
  const client = getClient();
  const teams = await client.teams();
  return teams.nodes.map((t) => ({ id: t.id, name: t.name }));
}
