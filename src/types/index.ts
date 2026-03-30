// --- Common ---

export interface RepoInfo {
  owner: string;
  name: string;
}

// --- Linear Config ---

export interface LinearConfig {
  apiKey: string;
  teamId: string;
  teamName: string;
}

// --- Step 1: Classification ---

export type MessageType = "bug" | "question" | "feature" | "ambiguous";

export interface ExtractedInfo {
  summary: string;
  affectedArea?: string;
  stepsToReproduce?: string[];
  coreQuestion?: string;
  featureDescription?: string;
}

export interface ClassifyInput {
  message: string;
  repo?: RepoInfo;
}

export interface ClassifyResult {
  type: MessageType;
  confidence: number;
  extracted: ExtractedInfo;
}

// --- Step 2: Context ---

export interface PRInfo {
  title: string;
  url: string;
  body: string;
}

export interface IssueInfo {
  title: string;
  url: string;
  body: string;
}

export interface ProjectFile {
  path: string;
  content: string;
}

export interface RecentCommit {
  sha: string;
  message: string;
  url: string;
}

export interface RecentPR {
  number: number;
  title: string;
  url: string;
  mergedAt: string | null;
  body: string;
}

export interface ProjectStructure {
  selectedFiles: ProjectFile[];
  recentCommits: RecentCommit[];
  dependencies: string | null; // package.json content, null if absent
  recentPRs: RecentPR[];
}

export interface ContextInput {
  classification: ClassifyResult;
  repo: RepoInfo;
}

export interface ContextResult {
  github: {
    relevantPRs: PRInfo[];
    relevantIssues: IssueInfo[];
  };
  projectStructure?: ProjectStructure;
}

// --- Step 3: Triage ---

export interface TriageInput {
  classification: ClassifyResult;
  context: ContextResult;
  linearApiKey?: string;
  linearTeamId?: string;
}

export interface CardInfo {
  id: string;
  url: string;
  title: string;
  description: string;
  labels: string[];
}

export interface TriageResult {
  card: CardInfo;
}

// --- Step 4: Respond ---

export interface RespondInput {
  classification: ClassifyResult;
  context: ContextResult;
  triage?: TriageResult;
}

export interface RespondResult {
  clientResponse: string;
  devSummary: string;
}

// --- Token Usage (observability) ---

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

// --- Frontend Pipeline State ---

export type StepStatus = "pending" | "processing" | "complete" | "error" | "skipped";

export interface StepState<T = unknown> {
  status: StepStatus;
  result?: T;
  error?: string;
  executionTimeMs?: number;
  usage?: TokenUsage;
}

export interface PipelineState {
  classify: StepState<ClassifyResult>;
  context: StepState<ContextResult>;
  triage: StepState<TriageResult>;
  respond: StepState<RespondResult>;
}
