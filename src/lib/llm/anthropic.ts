/**
 * Anthropic SDK wrapper for SRIntelligence.
 *
 * Model: claude-sonnet-4-5
 *
 * Exports:
 *   classifyIntent        — classify a user message into an AgentIntent
 *   decomposeIntoPipeline — produce a PipelineDefinition from a message
 *   synthesizeNarrative   — generate an executive markdown summary
 *   detectTimePeriods     — extract baseline / target time period references
 *   generatePlan          — break a user request into ordered analysis steps
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AgentIntent, PipelineDefinition, PipelineStep } from '../../types/agent';

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-5';

// ---------------------------------------------------------------------------
// classifyIntent
// ---------------------------------------------------------------------------

const VALID_INTENTS: AgentIntent[] = [
  'ANALYST',
  'FORECAST_PROPHET',
  'FORECAST_SARIMA',
  'FORECAST_HW',
  'FORECAST_XGB',
  'FORECAST_COMPARE',
  'FORECAST_AUTO',
  'FORECAST_HYBRID',
  'MTREE',
  'CLUSTER',
  'CLUSTER_GM',
  'CLUSTER_DBSCAN',
  'CLUSTER_HIERARCHICAL',
  'CLUSTER_KMEANS',
  'CLUSTER_KMEDOIDS',
  'CLUSTER_COMPARE',
  'CAUSAL_AUTO',
  'CAUSAL_CONTRIBUTION',
  'CAUSAL_DRIVERS',
  'CAUSAL_VALIDATION',
  'CAUSAL_NARRATIVE',
  'CAUSAL_PIPELINE',
  'PIPELINE',
  'UNKNOWN',
];

function parseIntent(raw: string): AgentIntent {
  const upper = raw.trim().toUpperCase() as AgentIntent;
  return (VALID_INTENTS as string[]).includes(upper) ? upper : 'UNKNOWN';
}

export async function classifyIntent(
  message: string,
  conversationContext?: string,
): Promise<AgentIntent> {
  const systemPrompt = [
    'You are an intent classifier for a business intelligence assistant.',
    'Classify the user message into exactly ONE of these intents (respond with only the intent keyword):',
    VALID_INTENTS.join(', '),
    '',
    'Intent definitions:',
    '  ANALYST              — data retrieval, SQL-based Q&A, general analytics questions',
    '  FORECAST_PROPHET     — time-series forecasting with Facebook Prophet',
    '  FORECAST_SARIMA      — SARIMA/ARIMA-based forecasting',
    '  FORECAST_HW          — Holt-Winters exponential smoothing',
    '  FORECAST_XGB         — XGBoost-based forecasting',
    '  FORECAST_HYBRID      — hybrid ensemble forecasting combining multiple models',
    '  FORECAST_COMPARE     — compare multiple forecasting models',
    '  FORECAST_AUTO        — auto-select the best forecasting model',
    '  MTREE                — metric tree / driver / root-cause decomposition',
    '  CLUSTER              — generic segmentation or clustering (auto-selects GMM)',
    '  CLUSTER_GM           — Gaussian Mixture Model clustering (explicit)',
    '  CLUSTER_DBSCAN       — DBSCAN density-based clustering (explicit)',
    '  CLUSTER_HIERARCHICAL — hierarchical/agglomerative clustering (explicit)',
    '  CLUSTER_KMEANS       — K-Means clustering (explicit)',
    '  CLUSTER_KMEDOIDS     — K-Medoids clustering (explicit)',
    '  CLUSTER_COMPARE      — compare all clustering algorithms and pick the best',
    '  CAUSAL_AUTO          — auto-run full causal inference pipeline',
    '  CAUSAL_CONTRIBUTION  — decompose a metric change into driver contributions',
    '  CAUSAL_DRIVERS       — identify statistically significant causal drivers',
    '  CAUSAL_VALIDATION    — validate causal assumptions (DiD, placebo, etc.)',
    '  CAUSAL_NARRATIVE     — generate a plain-language narrative from causal results',
    '  CAUSAL_PIPELINE      — run the full end-to-end causal inference pipeline',
    '  PIPELINE             — multi-step workflow spanning several of the above',
    '  UNKNOWN              — none of the above applies',
    '',
    'Respond with a single uppercase word only. No punctuation, no explanation.',
  ].join('\n');

  const userContent = conversationContext
    ? `Context:\n${conversationContext}\n\nMessage: ${message}`
    : `Message: ${message}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 20,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const firstBlock = response.content[0];
  if (firstBlock.type !== 'text') return 'UNKNOWN';
  return parseIntent(firstBlock.text);
}

// ---------------------------------------------------------------------------
// decomposeIntoPipeline
// ---------------------------------------------------------------------------

function validatePipelineDefinition(raw: unknown): PipelineDefinition {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Pipeline decomposition returned non-object');
  }

  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj.steps)) {
    throw new Error('Pipeline definition missing steps array');
  }

  const steps = obj.steps as PipelineStep[];

  return {
    id: typeof obj.id === 'string' ? obj.id : crypto.randomUUID(),
    name: typeof obj.name === 'string' ? obj.name : 'Unnamed Pipeline',
    description: typeof obj.description === 'string' ? obj.description : '',
    steps,
    parallelizable: typeof obj.parallelizable === 'boolean' ? obj.parallelizable : false,
    createdAt: typeof obj.createdAt === 'number' ? obj.createdAt : Date.now(),
    semanticViewDisplayName:
      typeof obj.semanticViewDisplayName === 'string' ? obj.semanticViewDisplayName : '',
  };
}

export async function decomposeIntoPipeline(params: {
  message: string;
  semanticViewDisplayName: string;
  conversationContext?: string;
}): Promise<PipelineDefinition> {
  const { message, semanticViewDisplayName, conversationContext } = params;

  const systemPrompt = [
    'You are a pipeline decomposition engine for a business intelligence assistant.',
    `The semantic view (data source) display name is: "${semanticViewDisplayName}"`,
    '',
    'Decompose the user request into a PipelineDefinition JSON object with this exact shape:',
    '{',
    '  "id": "<uuid>",',
    '  "name": "<pipeline name>",',
    '  "description": "<what this pipeline does>",',
    '  "semanticViewDisplayName": "<display name>",',
    '  "parallelizable": <boolean>,',
    '  "createdAt": <unix ms timestamp>,',
    '  "steps": [',
    '    {',
    '      "stepId": "<unique string>",',
    '      "intent": "<AgentIntent>",',
    '      "agentName": "<human-readable agent name>",',
    '      "description": "<what this step does>",',
    '      "dependsOn": ["<stepId>", ...],',
    '      "required": <boolean>,',
    '      "params": {}',
    '    }',
    '  ]',
    '}',
    '',
    'Rules:',
    '  1. Each step is a call to a Snowflake Named Cortex Agent — do NOT add a',
    '     preceding ANALYST step. The named agents handle all data retrieval,',
    '     SQL construction, and ML logic internally.',
    '  2. Use only valid AgentIntent values:',
    '     • Data exploration: ANALYST',
    '     • Forecasting: FORECAST_PROPHET, FORECAST_SARIMA, FORECAST_HW, FORECAST_XGB,',
    '       FORECAST_HYBRID, FORECAST_COMPARE, FORECAST_AUTO',
    '     • Metric tree: MTREE',
    '     • Clustering: CLUSTER, CLUSTER_GM, CLUSTER_DBSCAN, CLUSTER_HIERARCHICAL,',
    '       CLUSTER_KMEANS, CLUSTER_KMEDOIDS, CLUSTER_COMPARE',
    '     • Causal: CAUSAL_AUTO, CAUSAL_CONTRIBUTION, CAUSAL_DRIVERS, CAUSAL_VALIDATION,',
    '       CAUSAL_NARRATIVE, CAUSAL_PIPELINE',
    '  3. Only include ANALYST as a step when the user explicitly asks for raw data',
    '     exploration or SQL output — not as a mandatory first step.',
    '  4. dependsOn must reference stepIds of preceding steps only.',
    '  5. Respond with valid JSON only — no markdown fences, no explanation.',
    '  6. For causal inference requests, use the full 4-step sequential pipeline:',
    '     CAUSAL_CONTRIBUTION → CAUSAL_DRIVERS → CAUSAL_VALIDATION → CAUSAL_NARRATIVE.',
    '     Each step depends on the previous one. Use CAUSAL_AUTO only when the user',
    '     explicitly requests a single-step auto analysis.',
  ].join('\n');

  const userContent = [
    conversationContext ? `Context:\n${conversationContext}\n` : '',
    `Request: ${message}`,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const firstBlock = response.content[0];
  if (firstBlock.type !== 'text') {
    throw new Error('Unexpected response type from pipeline decomposition');
  }

  let parsed: unknown;
  try {
    // Strip accidental markdown fences if the model adds them
    const cleaned = firstBlock.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse pipeline JSON: ${String(err)}`);
  }

  return validatePipelineDefinition(parsed);
}

// ---------------------------------------------------------------------------
// synthesizeNarrative
// ---------------------------------------------------------------------------

export async function synthesizeNarrative(params: {
  userQuestion: string;
  results: Array<{
    agentName: string;
    data?: unknown;
    sql?: string;
    narrative?: string;
  }>;
  customInstructions?: string;
}): Promise<string> {
  const { userQuestion, results, customInstructions } = params;

  const systemPrompt = [
    'You are an expert business intelligence analyst writing executive summaries.',
    'Produce a concise, insightful markdown report that directly answers the user question.',
    'Use headers, bullet points, and bold text for key metrics.',
    'Do not include raw SQL in the narrative. Do not repeat the question verbatim.',
    customInstructions ? `\nAdditional instructions:\n${customInstructions}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const agentSummaries = results
    .map((r, i) => {
      const parts: string[] = [`--- Agent ${i + 1}: ${r.agentName} ---`];
      if (r.narrative) parts.push(`Narrative: ${r.narrative}`);
      if (r.data !== undefined) parts.push(`Data: ${JSON.stringify(r.data, null, 2)}`);
      return parts.join('\n');
    })
    .join('\n\n');

  const userContent = `User Question: ${userQuestion}\n\nAgent Results:\n${agentSummaries}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    temperature: 0.3,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const firstBlock = response.content[0];
  if (firstBlock.type !== 'text') return '';
  return firstBlock.text;
}

// ---------------------------------------------------------------------------
// detectTimePeriods
// ---------------------------------------------------------------------------

export async function detectTimePeriods(
  message: string,
  context?: string,
): Promise<{ baseline: string; target: string }> {
  const DEFAULT_BASELINE = '6 months ago to 3 months ago';
  const DEFAULT_TARGET = 'last 3 months';

  const systemPrompt = [
    'You extract time period references from business questions.',
    'Return a JSON object with exactly two keys: "baseline" and "target".',
    'Each value is a human-readable time period description (e.g. "last quarter", "January 2024 to March 2024").',
    `If no clear period is mentioned, use defaults: baseline="${DEFAULT_BASELINE}", target="${DEFAULT_TARGET}".`,
    'Respond with valid JSON only — no markdown fences, no explanation.',
  ].join('\n');

  const userContent = context
    ? `Context:\n${context}\n\nMessage: ${message}`
    : `Message: ${message}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 100,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const firstBlock = response.content[0];
  if (firstBlock.type !== 'text') {
    return { baseline: DEFAULT_BASELINE, target: DEFAULT_TARGET };
  }

  try {
    const cleaned = firstBlock.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      baseline:
        typeof parsed.baseline === 'string' ? parsed.baseline : DEFAULT_BASELINE,
      target: typeof parsed.target === 'string' ? parsed.target : DEFAULT_TARGET,
    };
  } catch {
    return { baseline: DEFAULT_BASELINE, target: DEFAULT_TARGET };
  }
}

// ---------------------------------------------------------------------------
// generatePlan
// ---------------------------------------------------------------------------

export interface RawPlanStep {
  title: string;
  description: string;
  message: string;
}

/**
 * Breaks a user request into an ordered sequence of agent-executable steps.
 * Returns between 2–6 steps, each with a short title, a one-sentence description,
 * and the exact message string to send to the routing pipeline.
 */
export async function generatePlan(params: {
  message: string;
  conversationContext?: string;
}): Promise<{ steps: RawPlanStep[] }> {
  const { message, conversationContext } = params;

  const systemPrompt = [
    'You are a planning assistant for a pharma business-intelligence platform called SRIntelligence.',
    'The platform can execute the following agent types:',
    '  • Analyst      — SQL queries against Snowflake (cohort selection, metric retrieval)',
    '  • Clustering   — segment physicians/patients into groups by behaviour',
    '  • Forecast     — time-series forecasting (Prophet, SARIMA, Holt-Winters, XGBoost, Hybrid)',
    '  • Causal       — causal-inference driver analysis and competitive attribution',
    '  • MTree        — metric-tree / waterfall decomposition of share change',
    '',
    'Given a user request, return a JSON object (no markdown fences, no commentary):',
    '{',
    '  "steps": [',
    '    {',
    '      "title": "<8-word max action label, sentence case, no trailing punctuation>",',
    '      "description": "<one sentence: what this step does and which agent handles it>",',
    '      "message": "<self-contained, executable BI prompt for this step>"',
    '    }',
    '  ]',
    '}',
    '',
    'Rules:',
    '  1. Produce 2–6 steps. Never fewer than 2, never more than 6.',
    '  2. Each "message" must stand alone — the agent receives it without additional context.',
    '     Embed necessary filters (geography, brand, date range, etc.) directly in the message.',
    '  3. Sequence: data retrieval → aggregation/segmentation → ML analysis → synthesis.',
    '  4. Do NOT include a step whose only purpose is "summarise" — the platform auto-summarises.',
    '  5. If prior context already retrieved a cohort, the first step should reference it naturally.',
    '  6. Respond with valid JSON only.',
  ].join('\n');

  const userContent = [
    conversationContext ? `Recent conversation:\n${conversationContext}\n` : '',
    `User request: ${message}`,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 900,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  const firstBlock = response.content[0];
  if (firstBlock.type !== 'text') {
    throw new Error('Unexpected response type from plan generation');
  }

  let parsed: unknown;
  try {
    const cleaned = firstBlock.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse plan JSON: ${String(err)}`);
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as Record<string, unknown>).steps)
  ) {
    throw new Error('Plan response is missing steps array');
  }

  const steps = ((parsed as Record<string, unknown>).steps as unknown[]).map(
    (s, i): RawPlanStep => {
      if (!s || typeof s !== 'object') throw new Error(`Step ${i} is not an object`);
      const obj = s as Record<string, unknown>;
      if (typeof obj.title !== 'string' || typeof obj.message !== 'string') {
        throw new Error(`Step ${i} missing required title or message field`);
      }
      return {
        title:       obj.title,
        description: typeof obj.description === 'string' ? obj.description : '',
        message:     obj.message,
      };
    },
  );

  if (steps.length < 1) throw new Error('Plan must have at least one step');
  return { steps };
}
