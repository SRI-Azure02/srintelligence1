export type NavSection = "chat" | "data-explore" | "workflows";

export interface RecentAnalysis {
  id: string;
  title: string;
  timestamp: string;
  threadId: string;
}

export interface ChatThread {
  id: string;
  title: string;
  date: string;
  messages: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  agentActivity?: AgentActivity;
  tableData?: TableData;
  chartData?: ChartData[];
  suggestedFollowups?: string[];
  /** Structured forecast data — when set, renders ForecastArtifact instead of plain markdown */
  forecastData?: Record<string, unknown>;
  /** Structured segmentation data — when set, renders SegmentationArtifact instead of plain markdown */
  segmentData?: Record<string, unknown>;
  /** Raw narrative text from the clustering agent — preserved so the component can extract z-scores */
  clusterNarrative?: string;
  /** Raw narrative text from the Meta Tree agent — rendered by MTreeArtifact */
  mTreeNarrative?: string;
  /** Raw narrative text from the Causal Inference agent — rendered by CausalNarrativeReport */
  causalNarrative?: string;
  /** When set, this message IS a plan card (role = "user", content = "") */
  plan?: Plan;
  /** When set on an agent message, links it back to the plan step that produced it */
  planStepId?: string;
}

export interface AgentActivity {
  masterAgent: string;
  routedTo: string;
  latency: string;
}

export interface TableData {
  headers: string[];
  rows: (string | number)[][];
}

export interface ChartData {
  name: string;
  value: number;
  change?: number;
}

export interface WorkflowCard {
  id: string;
  name: string;
  description: string;
  agentChain: AgentStep[];
  schedule: "manual" | "auto";
  scheduleLabel?: string;
  lastRun: string;
  status: "success" | "running" | "failed";
  runCount: number;
  createdAt?: string;   // ISO-8601 timestamp
  updatedAt?: string;   // ISO-8601 timestamp (updated on every save)
  notes?: string;       // freeform user notes about this workflow
}

export interface AgentStep {
  id: string;
  type: AgentType;
  label: string;
  prompt?: string;
  icon: string;
  config?: Record<string, unknown>;
  runPerSegment?: boolean;
  position?: { x: number; y: number };
}

export type AgentType =
  | "sri-analyst"
  | "sri-forecast"
  | "sri-clustering"
  | "sri-mtree"
  | "sri-causal"
  // forecast sub-types
  | "prophet"
  | "sarima"
  | "holt-winters"
  | "xgboost"
  | "hybrid"
  | "auto-forecast"
  // clustering sub-types
  | "gmm"
  | "kmeans"
  | "kmedoids"
  | "dbscan"
  | "hierarchical"
  | "auto-cluster"
  | "output";

export interface WorkflowVersion {
  versionId: string;
  workflowId: string;
  versionNumber: number;  // 1-based, auto-incremented
  savedAt: string;        // ISO-8601
  name: string;           // workflow name at time of save
  agentChain: AgentStep[];
  notes: string;          // optional per-version note left by the user
  bookmarked?: boolean;   // pinned versions survive the 10-version cap
}

export interface WorkflowRun {
  id: string;
  runNumber: number;
  workflowId: string;
  startedAt: string;
  steps: WorkflowRunStep[];
}

export interface WorkflowRunStep {
  stepId: string;
  label: string;
  icon: string;
  status: "done" | "running" | "pending" | "failed";
  duration?: string;
  progress?: number;
  result?: WorkflowStepResult;
}

export interface WorkflowStepResult {
  type: "table" | "segments" | "forecast";
  data: unknown;
}

export interface SemanticTable {
  id: string;
  name: string;
  icon: string;
  columns: SemanticColumn[];
  position: { x: number; y: number };
  relations: TableRelation[];
}

export interface SemanticColumn {
  name: string;
  type: string;
  description: string;
  samples: string;
}

export interface TableRelation {
  targetTable: string;
  joinKey: string;
  label: string;
}

export interface BusinessRule {
  name: string;
  definition: string;
  details: string[];
}

export interface SemanticModel {
  id: string;
  name: string;
  description: string;
  tables: SemanticTable[];
}

// ── Planning Mode ─────────────────────────────────────────────────────────────

export type PlanStepStatus = "pending" | "running" | "done" | "error";

export interface PlanStep {
  /** Stable unique ID generated at creation time */
  id: string;
  /** Short one-line label shown in the step card, e.g. "Segment customers by revenue" */
  title: string;
  /** One sentence describing what this step does */
  description: string;
  /** The exact message string sent to the agent when this step executes */
  message: string;
  status: PlanStepStatus;
  errorMessage?: string;
}

export interface Plan {
  id: string;
  originalPrompt: string;
  steps: PlanStep[];
  /** Whether the plan is currently executing */
  executing: boolean;
  /** Index of the step currently running (-1 = not started, null = finished/error) */
  executingIndex: number | null;
}
