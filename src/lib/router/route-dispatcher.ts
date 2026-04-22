/**
 * RouteDispatcher — Blueprint v3.0 three-path orchestration entry point.
 *
 * Accepts a plain-text message, classifies intent, then routes via one of
 * three paths:
 *
 *   PATH A — cortex_analyst  → analystAgent.execute()
 *   PATH B — cortex_agent    → callCortexAgent() (named Snowflake agent)
 *   PATH C — pipeline        → PipelineExecutor (multi-step decomposition)
 *
 * The AGENT_ROUTING_MAP in agent-mapping.ts determines which path each
 * AgentIntent takes.  Named agents (PATH B) handle all SQL construction,
 * data preparation, and ML formatting internally — the web app only passes
 * the NL message and receives a structured response.
 */

import { randomUUID } from 'crypto';
import type {
  AgentIntent,
  AgentInput,
  AgentResult,
  AgentArtifact,
  DispatchEvent,
  FormattedResponse,
} from '../../types/agent';
import { ExecutionContext } from '../orchestrator/context';
import { synthesizer } from '../orchestrator/synthesizer';
import { classifyIntent } from './intent-classifier';
import { rateLimiter } from '../guardrails/rate-limiter';
import { costEstimator } from '../guardrails/cost-estimator';
import { lineageTracker } from '../lineage/lineage-tracker';
import { analystAgent } from '../agents/analyst-agent';
import { PipelineExecutor } from '../orchestrator/pipeline';
import { AGENT_ROUTING_MAP, enrichMessage, extractNClusters, parseForecastHorizon } from '../agents/agent-mapping';
import { callCortexAgent, SNOWFLAKE_ROLE } from '../snowflake/cortex-agent-api';
import { callCortexAnalyst } from '../snowflake/analyst-api';
import { normalizeCortexSQL, normalizeUserQuestion } from '../snowflake/sql-normalizer';
import { executeSQL } from '../snowflake/sql-api';
import { executeClusteringSQL } from '../snowflake/cluster-sql';
import { persistClusteringResults } from '../snowflake/cluster-persist';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): number {
  return Date.now();
}

function baseEvent(
  type: DispatchEvent['type'],
  context: ExecutionContext,
): Omit<DispatchEvent, 'payload' | 'intent' | 'agentName' | 'error'> {
  return {
    type,
    sessionId: context.sessionId,
    userId: context.userId,
    timestamp: now(),
  };
}

/**
 * Convert a CortexAgentResponse into an AgentResult so downstream
 * synthesizer / lineage code can handle it identically to v2.x results.
 */
function buildAgentResult(
  agentRef: string,
  intent: AgentIntent,
  displayName: string,
  text: string,
  sql: string | undefined,
  data: unknown,
  executionTimeMs: number,
  lineageId: string,
  error?: string,
): AgentResult {
  if (error) {
    return {
      success: false,
      error,
      durationMs: executionTimeMs,
      retryCount: 0,
    };
  }

  // ── [FORECAST_LOG] Server-side diagnostic for forecast intents ──────────────
  if (intent.startsWith('FORECAST')) {
    console.log(`[FORECAST_LOG] intent=${intent} agent=${agentRef}`);
    console.log(`[FORECAST_LOG] text length=${text.length} chars`);
    console.log(`[FORECAST_LOG] FULL TEXT:\n${text}`);
    console.log(`[FORECAST_LOG] data type=${typeof data} isNull=${data == null}`);
    if (data != null && typeof data === 'object') {
      console.log(`[FORECAST_LOG] data keys=${JSON.stringify(Object.keys(data as object))}`);
      const d = data as Record<string, unknown>;
      if (Array.isArray(d['historical'])) console.log(`[FORECAST_LOG] historical rows=${(d['historical'] as unknown[]).length}`);
      if (Array.isArray(d['forecast']))   console.log(`[FORECAST_LOG] forecast rows=${  (d['forecast']   as unknown[]).length}`);
      if (Array.isArray(d['validation'])) console.log(`[FORECAST_LOG] validation rows=${(d['validation'] as unknown[]).length}`);
      if (d['metrics']) console.log(`[FORECAST_LOG] metrics=${JSON.stringify(d['metrics']).slice(0, 200)}`);
    }
    console.log(`[FORECAST_LOG] sql present=${!!sql}`);
  }
  // ────────────────────────────────────────────────────────────────────────────

  // ── [CAUSAL_LOG] Server-side diagnostic for causal inference intents ─────────
  if (intent.startsWith('CAUSAL')) {
    console.log(`[CAUSAL_LOG] intent=${intent} agent=${agentRef}`);
    console.log(`[CAUSAL_LOG] text length=${text.length} chars`);
    console.log(`[CAUSAL_LOG] data type=${typeof data} isNull=${data == null}`);
    console.log(`[CAUSAL_LOG] sql present=${!!sql}`);
    if (sql) console.log(`[CAUSAL_LOG] sql (first 400):\n${sql.slice(0, 400)}`);
    // Look for CLUSTERING_RESULTS reference in text — confirms segment scoping
    const mentionsCR = /CLUSTERING_RESULTS/i.test(text) || /CLUSTERING_RESULTS/i.test(sql ?? '');
    const mentionsClusterId = /CLUSTER_ID\s*=\s*\d+/i.test(text) || /CLUSTER_ID\s*=\s*\d+/i.test(sql ?? '');
    console.log(`[CAUSAL_LOG] references CLUSTERING_RESULTS=${mentionsCR}  CLUSTER_ID filter=${mentionsClusterId}`);
    console.log(`[CAUSAL_LOG] text (first 600):\n${text.slice(0, 600)}`);
  }
  // ────────────────────────────────────────────────────────────────────────────

  const artifact: AgentArtifact = {
    id: randomUUID(),
    agentName: agentRef,
    intent,
    data: data ?? null,
    sql,
    narrative: text,
    createdAt: now(),
    lineageId,
    cacheStatus: 'miss',
  };

  return {
    success: true,
    artifact,
    durationMs: executionTimeMs,
    retryCount: 0,
  };
}

/**
 * Build the UDTF SELECT for a clustering function given an intent, the
 * RECORD_ID + FEATURES input query, and the desired number of clusters
 * (0 = auto-detect).
 *
 * UDTF signatures (all 5):
 *   KMEANS_CLUSTER(RECORD_ID VARCHAR, FEATURES VARIANT, N_SEGMENTS INT)
 *   CLUSTER_GM(RECORD_ID VARCHAR, FEATURES VARIANT, N_SEGMENTS INT)
 *   KMEDOIDS_CLUSTER(RECORD_ID VARCHAR, FEATURES VARIANT, N_SEGMENTS INT)
 *   HIERARCHICAL_CLUSTER(RECORD_ID VARCHAR, FEATURES VARIANT, N_SEGMENTS INT)
 *   DBSCAN_CLUSTER(RECORD_ID VARCHAR, FEATURES VARIANT, EPS_VALUE FLOAT, MIN_SAMPLES INT)
 *
 * Call form: SELECT res.* FROM (<input_query>) AS src,
 *            TABLE(<func>(src.RECORD_ID, src.FEATURES, <params>)
 *            OVER (PARTITION BY 1)) AS res
 *
 * IMPORTANT: inputs are column references from the subquery alias `src`,
 * NOT dollar-quoted strings.  CALL syntax is not supported by the Snowflake
 * SQL API or the Cortex Agent framework.
 */
function buildClusterUDTFSQL(intent: AgentIntent, inputQuery: string, nClusters: number): string {
  // Strip Cortex Analyst comment footer and ALL semicolons.
  // Cortex Analyst may embed "LIMIT 5000;" mid-string (not just at the end),
  // and the SQL API rejects any multi-statement input.
  const inner = inputQuery
    .replace(/\s*--\s*Generated by Cortex Analyst[\s\S]*?$/gim, '')
    .replace(/;/g, '')
    .trim();

  // The source CTE name and its FROM alias.  Using an alias (`AS src`) so that
  // UDTF param references (`src.RECORD_ID`) are unambiguous and match Snowflake's
  // recommended lateral-join pattern.
  const cteName = '_cluster_src';
  const srcAlias = 'src';

  // N_SEGMENTS=0 means "auto-detect" but most UDTFs require a positive integer.
  // Default to 5 segments when the user has not specified a count.
  const nSeg = nClusters > 0 ? nClusters : 5;

  const udtfParams = (() => {
    switch (intent) {
      case 'CLUSTER_GM':
        return `${DB_ML}.CLUSTER_GM(${srcAlias}.RECORD_ID, ${srcAlias}.FEATURES, ${nSeg})`;
      case 'CLUSTER_KMEDOIDS':
        return `${DB_ML}.KMEDOIDS_CLUSTER(${srcAlias}.RECORD_ID, ${srcAlias}.FEATURES, ${nSeg})`;
      case 'CLUSTER_HIERARCHICAL':
        return `${DB_ML}.HIERARCHICAL_CLUSTER(${srcAlias}.RECORD_ID, ${srcAlias}.FEATURES, ${nSeg})`;
      case 'CLUSTER_DBSCAN':
        // EPS_VALUE=0.0 → auto-tune via k-distance heuristic; MIN_SAMPLES=5 default
        return `${DB_ML}.DBSCAN_CLUSTER(${srcAlias}.RECORD_ID, ${srcAlias}.FEATURES, 0.0::FLOAT, 5)`;
      case 'CLUSTER':
      case 'CLUSTER_KMEANS':
      default:
        return `${DB_ML}.KMEANS_CLUSTER(${srcAlias}.RECORD_ID, ${srcAlias}.FEATURES, ${nSeg})`;
    }
  })();

  // Final SELECT + UDTF lateral join (shared by both CTE and plain-SELECT paths)
  const selectAndUdtf = [
    `SELECT res.*`,
    `FROM ${cteName} AS ${srcAlias},`,
    `TABLE(`,
    `  ${udtfParams}`,
    `  OVER (PARTITION BY 1)`,
    `) AS res`,
  ].join('\n');

  // ── CTE hoisting ─────────────────────────────────────────────────────────────
  // Cortex Analyst often returns: WITH cte1 AS (...), cte2 AS (...) SELECT ...
  // Snowflake does not allow CTEs inside a subquery/inline view, so we keep them
  // at the top level and append _cluster_src as a new CTE wrapping the final SELECT.
  //
  // Result:
  //   WITH cte1 AS (...), cte2 AS (...),
  //   _cluster_src AS (SELECT ... FROM cte1 JOIN cte2 ...)
  //   SELECT res.* FROM _cluster_src AS src, TABLE(UDTF(src.RECORD_ID, ...) OVER (...)) AS res
  if (/^WITH\s/i.test(inner.trimStart())) {
    // Walk the string tracking paren depth; record position of every top-level SELECT.
    let depth = 0;
    let lastTopSelect = -1;
    const upper = inner.toUpperCase();
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (ch === '(') { depth++; continue; }
      if (ch === ')') { depth--; continue; }
      if (depth === 0 && upper.startsWith('SELECT', i)) {
        // Word-boundary guard: preceding char must be whitespace, newline, or comma
        const before = i > 0 ? inner[i - 1] : ' ';
        if (/[\s\n,)]/.test(before) || i === 0) {
          lastTopSelect = i;
        }
      }
    }

    if (lastTopSelect > 0) {
      const ctePart    = inner.slice(0, lastTopSelect).trimEnd(); // ends with ")"
      const selectPart = inner.slice(lastTopSelect);              // "SELECT ..."
      // Remove a stray trailing comma from the CTE block (defensive)
      const cteClean   = ctePart.replace(/,\s*$/, '');
      const sql = [
        `${cteClean},`,
        `${cteName} AS (`,
        selectPart,
        `)`,
        selectAndUdtf,
      ].join('\n');
      return sql.replace(/;/g, ''); // final safety: no stray semicolons
    }
    // Parsing failed — fall through to simple wrapper
  }

  // No CTE (or fallback) — wrap the entire query as _cluster_src
  const sql = [
    `WITH ${cteName} AS (`,
    inner,
    `)`,
    selectAndUdtf,
  ].join('\n');
  return sql.replace(/;/g, ''); // final safety: no stray semicolons
}

/**
 * Build a RECORD_ID + FEATURES SELECT directly from a prior analyst SQL result,
 * without calling Cortex Analyst again. This preserves the exact cohort (same
 * WHERE / HAVING / LIMIT as the prior query) rather than letting Cortex Analyst
 * re-interpret the population from a NL hint.
 *
 * The prior SQL is wrapped as a CTE (_prior_cohort), and we derive:
 *   RECORD_ID — first column that looks like an entity key (contains KEY, ID, NPI, GID, etc.)
 *   FEATURES  — all remaining numeric-sounding columns packed with OBJECT_CONSTRUCT
 *
 * Returns null when the prior result doesn't contain suitable columns (falls back
 * to the Cortex Analyst path).
 */
/**
 * Split a SQL string that starts with WITH into its CTE prefix block and the
 * top-level SELECT body.  Tracks parenthesis depth so that SELECT keywords
 * inside CTE bodies (depth ≥ 1) are ignored.
 *
 * Returns null if no top-level SELECT is found.
 */
function splitTopLevelSelect(sql: string): { cteBlock: string; selectBlock: string } | null {
  let depth = 0;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth--; continue; }
    if (depth === 0 && /^SELECT\b/i.test(sql.slice(i))) {
      const cteBlock   = sql.slice(0, i).trim().replace(/,\s*$/, '');
      const selectBlock = sql.slice(i).trim();
      return { cteBlock, selectBlock };
    }
  }
  return null;
}

function buildCohortClusterSQL(priorSQL: string, priorColumns: string[]): string | null {
  if (priorColumns.length < 2) return null;

  // Detect the entity ID column — prefer explicit key/id patterns
  const ID_PATTERNS = /key|_id$|^id_|^npi|gid|identifier|code$/i;
  const SKIP_PATTERNS = /name|desc|label|date|year|month|quarter|day|state|type|category|status|flag/i;

  const idCol = priorColumns.find(c => ID_PATTERNS.test(c))
    ?? priorColumns[0]; // fallback: first column

  // Feature columns: everything that isn't the ID and doesn't look like a text/dimension column.
  // Extended to exclude geographic/contact text fields (city, address, street, zip, phone, fax)
  // that were previously counted as features and leading to wrong path selection.
  const featureCols = priorColumns.filter(
    c => c !== idCol && !SKIP_PATTERNS.test(c) && !/city|address|street|zip|phone|fax/i.test(c),
  );

  if (featureCols.length === 0) {
    // No numeric-looking columns — use all non-ID columns
    featureCols.push(...priorColumns.filter(c => c !== idCol));
  }
  if (featureCols.length === 0) return null;

  // TRY_CAST only accepts VARCHAR input in Snowflake — it cannot cast NUMBER to FLOAT.
  // TRY_TO_DOUBLE(col::VARCHAR) works for both numeric columns (NUMBER → VARCHAR → DOUBLE)
  // and comma-formatted string columns like "18,414" produced by TO_CHAR().
  // REPLACE strips the commas before parsing so "18,414" becomes 18414.0.
  const objectArgs = featureCols
    .map(c => `    '${c}', COALESCE(TRY_TO_DOUBLE(REPLACE(${c}::VARCHAR, ',', '')), 0.0)`)
    .join(',\n');

  // Strip semicolons and single-line SQL comments (e.g. "-- Generated by Cortex Analyst ...")
  const inner = priorSQL
    .replace(/;/g, '')
    .replace(/--[^\n]*/g, '')
    .trim();

  // ── Flatten nested CTEs ──────────────────────────────────────────────────
  // If the prior SQL already has CTEs (`WITH … SELECT …`), wrapping the whole
  // thing as `WITH _prior_cohort AS (WITH … SELECT …)` produces invalid nested
  // WITH clauses.  Instead, promote the original CTEs to the top level and add
  // _prior_cohort as just another CTE wrapping the final SELECT body.
  let ctePrefix: string;
  if (/^\s*WITH\s+/i.test(inner)) {
    const split = splitTopLevelSelect(inner);
    if (split) {
      // split.cteBlock  = "WITH cte1 AS (...), cte2 AS (...), ..."
      // split.selectBlock = "SELECT ... FROM ... WHERE ..."
      ctePrefix = `${split.cteBlock},\n_prior_cohort AS (\n${split.selectBlock}\n)`;
    } else {
      // Couldn't parse — fall back to plain wrapping (may fail on complex SQL)
      ctePrefix = `WITH _prior_cohort AS (\n${inner}\n)`;
    }
  } else {
    ctePrefix = `WITH _prior_cohort AS (\n${inner}\n)`;
  }

  return [
    ctePrefix,
    `SELECT`,
    `  CAST(${idCol} AS VARCHAR) AS RECORD_ID,`,
    `  OBJECT_CONSTRUCT(`,
    objectArgs,
    `  )::VARIANT AS FEATURES`,
    `FROM _prior_cohort`,
    `WHERE ${idCol} IS NOT NULL`,
  ].join('\n');
}

/**
 * Count the number of key-value pairs inside a SQL OBJECT_CONSTRUCT(...) call.
 * Handles both single-line and multi-line OBJECT_CONSTRUCT bodies.
 * Returns 0 if no OBJECT_CONSTRUCT is found.
 */
function countObjectConstructKeys(sql: string): number {
  const m = sql.match(/OBJECT_CONSTRUCT\s*\(([\s\S]*?)\)\s*(?:::\s*VARIANT)?/i);
  if (!m) return 0;
  // Each key is a quoted string literal — count them
  return (m[1].match(/'[^']+'/g) ?? []).length;
}

/**
 * Columns that actually exist on RX_TABLE and can be used as the GROUP BY
 * entity key.  Any detected key that is NOT in this set is normalised to the
 * closest match below (or to 'physician_key' as the ultimate default).
 *
 * Cortex Analyst is non-deterministic and may generate arbitrary aliases
 * (physician_gid, npi_number, prescriber_key, hcp_id, …).  Rather than
 * maintaining an ever-growing alias map we whitelist valid keys and fall back.
 */
const RX_TABLE_VALID_ENTITY_KEYS = new Set([
  'physician_key',
  'patient_gid',
  'drug_id',
  'market_code',
  'product_ndc_code',
]);

/**
 * Normalise an entity key detected from Cortex Analyst SQL to an actual
 * RX_TABLE column.  If the key is already valid, return it unchanged.
 * Otherwise apply heuristics to pick the closest real column.
 */
function normaliseEntityKey(raw: string): string {
  const lower = raw.toLowerCase();
  if (RX_TABLE_VALID_ENTITY_KEYS.has(lower)) return lower;

  // Physician / prescriber / HCP / NPI variants → physician_key
  if (/physician|prescriber|hcp|provider|doctor|npi/i.test(lower)) return 'physician_key';
  // Patient variants → patient_gid
  if (/patient|member|enrollee/i.test(lower)) return 'patient_gid';
  // Drug variants → drug_id
  if (/drug|ndc|product/i.test(lower)) return 'drug_id';
  // Plan variants → market_code
  if (/plan|market|payer|insurance/i.test(lower)) return 'market_code';

  // Unknown — safe default
  console.warn(`[CLUSTER] Unknown entity key "${raw}" — defaulting to physician_key`);
  return 'physician_key';
}

/**
 * Detect the entity key that will become RECORD_ID.
 * Strips any table alias prefix (e.g. "p.physician_key" → "physician_key").
 * Normalises the result to an actual RX_TABLE column via normaliseEntityKey().
 * Returns the bare column name or null.
 */
function detectEntityKey(sql: string): string | null {
  // Match: [alias.]<col>::VARCHAR AS RECORD_ID
  const cast1 = sql.match(/(?:\w+\.)?(\w+)\s*::\s*VARCHAR\s+AS\s+RECORD_ID/i);
  if (cast1) return normaliseEntityKey(cast1[1]);
  // Match: CAST([alias.]<col> AS VARCHAR) AS RECORD_ID
  const cast2 = sql.match(/CAST\s*\(\s*(?:\w+\.)?(\w+)\s+AS\s+VARCHAR\s*\)\s+AS\s+RECORD_ID/i);
  if (cast2) return normaliseEntityKey(cast2[1]);
  return null;
}

// normalizeClusterSQL — alias for the shared normalizeCortexSQL utility.
// Fixes known Cortex Analyst inference errors (brand_generic_indicator values,
// date_rx_filled format strings) in clustering input SQL.
const normalizeClusterSQL = normalizeCortexSQL;

/**
 * Returns true when the user is asking about the traits / profile of a
 * specific cluster or segment (e.g. "key traits of cluster 1",
 * "describe segment 2", "what defines group 0").
 *
 * These questions are always routed to ANALYST by intent-classifier after a
 * clustering turn, but Cortex Analyst cannot answer them because cluster
 * assignments are outside the semantic model.  We intercept them in PATH A
 * and answer directly from the stored cluster narrative instead.
 */
function isClusterProfileQuery(message: string): boolean {
  // Must reference a specific cluster/segment/group number
  if (!/\b(?:cluster|segment|group)\s*\d+/i.test(message)) return false;
  // Must ask about traits, characteristics, or description
  return /\b(?:key\s+traits?|characteristics?|profile|describe|what\s+(?:is|are|defines?|makes?)|summarize|top\s+(?:features?|drivers?)|drivers?|tell\s+me\s+about|explain)\b/i.test(message);
}

/**
 * Build a deterministic response for a cluster profile query from the stored
 * cluster narrative and cluster summary metadata.
 *
 * Parses "- **Segment N** (X records, Y%) — top driver: **FEATURE** (Z=Z.ZZ)"
 * lines out of the last CLUSTER assistant message and formats a focused reply.
 */
function buildClusterProfileResponse(
  message: string,
  narrative: string,
  clusterSummary: Record<number, { label: string; count: number }>,
  algorithm: string,
): string {
  // Extract all segment numbers referenced in the user message
  const segNums = [...message.matchAll(/\b(?:cluster|segment|group)\s*(\d+)\b/gi)]
    .map((m) => Number(m[1]));

  // Extract all segment lines from the narrative
  const segLineRe = /- \*\*Segment (\d+)\*\* \(([\d,]+) records?, ([\d.]+)%\)(?:.*?top driver: \*\*([^*]+)\*\* \(Z=([\d.]+)\))?/g;
  const segMap: Record<number, { count: string; pct: string; topDriver?: string; topZ?: string }> = {};
  let m: RegExpExecArray | null;
  while ((m = segLineRe.exec(narrative)) !== null) {
    segMap[Number(m[1])] = {
      count: m[2],
      pct: m[3],
      topDriver: m[4]?.trim(),
      topZ: m[5],
    };
  }

  // Extract header line for context
  const algoLine = narrative.match(/\*\*[A-Z_]+ clustering\*\*[^\n]*/i)?.[0] ?? '';
  const qualLine  = narrative.match(/Model confidence[^\n]*/i)?.[0] ?? '';

  const lines: string[] = [];

  for (const segNum of segNums) {
    const info = segMap[segNum];
    const meta = clusterSummary[segNum];
    const label = meta?.label ?? `Cluster ${segNum}`;

    lines.push(`**Segment ${segNum} — ${label}**\n`);

    if (info) {
      const totalRecords = meta?.count ?? Number(info.count.replace(/,/g, ''));
      lines.push(`- **Size:** ${info.count} records (${info.pct}% of population)`);
      if (info.topDriver) {
        const zDesc = info.topZ ? ` (Z-score = ${info.topZ})` : '';
        lines.push(`- **Top differentiating feature:** ${info.topDriver}${zDesc} — members of this segment score markedly above average on this metric`);
      }
    } else if (meta) {
      lines.push(`- **Size:** ${meta.count.toLocaleString()} records`);
    } else {
      lines.push(`_No detail found for Segment ${segNum} in the current run._`);
    }
  }

  if (lines.length === 0) {
    return `No segment profile data is available. Please run a clustering analysis first.`;
  }

  // Add provenance footer
  if (algoLine) lines.push(`\n_Source: ${algoLine}_`);
  if (qualLine) lines.push(`_${qualLine}_`);
  lines.push(`_Refer to the Z-Score Snake Plot above for a full cross-segment feature comparison._`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Database / schema constants — driven by environment so the app works with
// any Snowflake database name without code changes.
// ---------------------------------------------------------------------------

const SNOWFLAKE_DB  = process.env.SNOWFLAKE_DATABASE  ?? 'CORTEX_TESTING';
const SNOWFLAKE_SCH = process.env.SNOWFLAKE_SCHEMA    ?? 'PUBLIC';
const SNOWFLAKE_ML  = process.env.SNOWFLAKE_ML_SCHEMA ?? 'ML';
const DB_SCHEMA     = `${SNOWFLAKE_DB}.${SNOWFLAKE_SCH}`;
const DB_ML         = `${SNOWFLAKE_DB}.${SNOWFLAKE_ML}`;

/** Fully-qualified RX_TABLE used as the standard base for feature enrichment. */
const RX_TABLE_FQN = `${DB_SCHEMA}.RX_TABLE`;

/** Fully-qualified CLUSTERING_RESULTS table. */
const CLUSTERING_RESULTS_FQN = `${DB_SCHEMA}.CLUSTERING_RESULTS`;

/**
 * Build a 6-feature SELECT directly from RX_TABLE, restricted to the
 * entities returned by a prior analyst cohort query.
 *
 * Used when the prior analyst result has entity IDs but no numeric feature
 * columns (e.g. a physician list with name/specialty/state only).
 * We re-aggregate from RX_TABLE with the standard 6 features, but add
 * an IN-subquery filter so only cohort members are included.
 *
 * entityKey   — bare column name that is both the GROUP BY key and the
 *               column projected by the prior SQL (e.g. PHYSICIAN_KEY).
 * priorSQL    — the prior analyst SELECT statement (no trailing semicolon).
 * nFeatures   — how many features to include (default 6, max 10).
 */
/**
 * @param cohortKey  Column name AS IT APPEARS in _prior_cohort (may be any alias
 *                   Cortex Analyst invented, e.g. 'NPI_NUMBER', 'PHYSICIAN_GID').
 * @param rxKey      Column name in RX_TABLE (normalised, e.g. 'physician_key').
 * @param priorSQL   The prior analyst SELECT statement (no trailing semicolon).
 * @param nFeatures  Number of features to include from CLUSTER_FEATURE_POOL.
 *
 * Two separate keys are required because Cortex Analyst uses different column
 * names in the prior query than the actual underlying table column names.
 * cohortKey reads from _prior_cohort; rxKey drives the RX_TABLE GROUP BY.
 */
function buildCohortScopedFeatureSQL(
  cohortKey: string,
  rxKey: string,
  priorSQL: string,
  nFeatures = 6,
): string {
  const features = CLUSTER_FEATURE_POOL
    .slice(0, Math.min(nFeatures, CLUSTER_FEATURE_POOL.length))
    .join(',\n         ');

  const cleanSQL = priorSQL
    .replace(/--[^\n]*/g, '')
    .replace(/;/g, '')
    .trim();

  let ctePrefix: string;
  if (/^\s*WITH\s+/i.test(cleanSQL)) {
    const split = splitTopLevelSelect(cleanSQL);
    if (split) {
      ctePrefix = `${split.cteBlock},\n_prior_cohort AS (\n${split.selectBlock}\n)`;
    } else {
      ctePrefix = `WITH _prior_cohort AS (\n${cleanSQL}\n)`;
    }
  } else {
    ctePrefix = `WITH _prior_cohort AS (\n${cleanSQL}\n)`;
  }

  // _cohort_keys reads from _prior_cohort using the raw column name (cohortKey)
  // so it works regardless of what alias Cortex Analyst used in the prior query.
  // The RX_TABLE join uses the normalised rxKey which is guaranteed to exist.
  return [
    ctePrefix,
    `, _cohort_keys AS (`,
    `  SELECT DISTINCT ${cohortKey}::VARCHAR AS _ek`,
    `  FROM   _prior_cohort`,
    `  WHERE  ${cohortKey} IS NOT NULL`,
    `)`,
    `SELECT rx.${rxKey}::VARCHAR AS RECORD_ID,`,
    `       OBJECT_CONSTRUCT(`,
    `         ${features}`,
    `       )::VARIANT AS FEATURES`,
    `FROM   ${RX_TABLE_FQN} rx`,
    `INNER JOIN _cohort_keys ck ON rx.${rxKey}::VARCHAR = ck._ek`,
    `GROUP  BY rx.${rxKey}`,
    `HAVING COUNT(rx.claim_id) >= 1`,
  ].join('\n');
}

/**
 * Build an N-feature SELECT directly from RX_TABLE.
 *
 * Features are drawn from CLUSTER_FEATURE_POOL (first N entries).
 * Defaults to 6; caller passes a higher count when the user requested more.
 *
 * All entity-key columns (physician_key, patient_gid, primary_plan_id,
 * drug_id) are FK columns directly on RX_TABLE, so no JOIN is needed.
 *
 * entityKey — bare column name to GROUP BY and expose as RECORD_ID.
 * nFeatures — how many features to include (default 6, max 10).
 */
function buildStandardFeatureSQL(entityKey: string, nFeatures = 6): string {
  const features = CLUSTER_FEATURE_POOL
    .slice(0, Math.min(nFeatures, CLUSTER_FEATURE_POOL.length))
    .join(',\n         ');

  return [
    `SELECT ${entityKey}::VARCHAR AS RECORD_ID,`,
    `       OBJECT_CONSTRUCT(`,
    `         ${features}`,
    `       )::VARIANT AS FEATURES`,
    `FROM   ${RX_TABLE_FQN}`,
    `WHERE  (ptd_final_claim = 1 OR ptd_final_claim IS NULL)`,
    `  AND  claim_status_code = '1'`,
    `  AND  ${entityKey} IS NOT NULL`,
    `GROUP  BY ${entityKey}`,
    `HAVING COUNT(claim_id) >= 5`,
    `LIMIT  10000`,
  ].join('\n');
}

/**
 * Guarantee at least nFeatures features in the OBJECT_CONSTRUCT.
 *
 * Rules:
 *  1. If the SQL already has ≥ nFeatures keys → return unchanged.
 *  2. If the SQL is a CTE (PATH 1A cohort query) → return unchanged; the
 *     cohort is pre-aggregated and re-aggregating from RX_TABLE would break it.
 *  3. Otherwise (PATH 1B thin Cortex Analyst SQL) → detect the entity key
 *     and rebuild entirely from RX_TABLE with nFeatures from the feature pool.
 *     The Cortex-Analyst FROM/WHERE is dropped because it may reference
 *     lookup tables (PHYS_REF, PATIENT, etc.) that don't have claim_id /
 *     primary_patient_pay / etc.
 */
const MIN_CLUSTER_FEATURES = 5;

function enrichClusterInputSQL(sql: string, nFeatures = 6): string {
  const keyCount = countObjectConstructKeys(sql);

  // Extract the raw (un-normalised) entity key from the SQL to check whether
  // the column actually exists on RX_TABLE.  Cortex Analyst is non-deterministic
  // and may use aliases like NPI_NUMBER, PHYSICIAN_GID, etc.
  const rawKeyMatch =
    sql.match(/(?:\w+\.)?(\w+)\s*::\s*VARCHAR\s+AS\s+RECORD_ID/i) ??
    sql.match(/CAST\s*\(\s*(?:\w+\.)?(\w+)\s+AS\s+VARCHAR\s*\)\s+AS\s+RECORD_ID/i);
  const rawKey = rawKeyMatch ? rawKeyMatch[1].toLowerCase() : null;
  const entityKeyIsValid = rawKey !== null && RX_TABLE_VALID_ENTITY_KEYS.has(rawKey);

  // Return as-is ONLY when both the feature count is sufficient AND the entity
  // key is a real RX_TABLE column.  If the key is an alias (e.g. npi_number),
  // we must rebuild even if the feature count looks fine.
  if (keyCount >= MIN_CLUSTER_FEATURES && keyCount >= nFeatures && entityKeyIsValid) {
    return sql;
  }

  // CTE-based cohort SQL (PATH 1A) uses _prior_cohort — columns there are
  // already aggregated, so we cannot layer RX_TABLE aggregates on top.
  if (/\b_prior_cohort\b/i.test(sql)) {
    console.log(`[CLUSTER] CTE-based cohort SQL has ${keyCount} feature(s), entityKeyValid=${entityKeyIsValid} — skipping enrichment to avoid breaking aggregated CTE.`);
    return sql;
  }

  // Rebuild from RX_TABLE using the normalised entity key.
  const entityKey = rawKey ? normaliseEntityKey(rawKey) : 'physician_key';
  console.log(`[CLUSTER] Rebuilding from RX_TABLE: keyCount=${keyCount}/${nFeatures}, rawKey=${rawKey ?? 'none'}, entityKey=${entityKey}`);
  return buildStandardFeatureSQL(entityKey, nFeatures);
}

/**
 * Pre-resolve "segment N" / "cluster N" / "group N" references in a user
 * message to an explicit label + SQL filter.
 *
 * Named Cortex Agents look up undefined terms against the semantic model and
 * respond with "no predefined segment field exists".  By rewriting the message
 * before it reaches the agent we avoid that dead-end entirely.
 *
 * The generated SQL filter is scoped to a specific RUN_ID when provided so
 * that the physician_key IN (...) subquery returns only the 192 records from
 * the relevant clustering run, not the 75 000+ accumulated across all runs.
 *
 * Example:
 *   "run causal on physicians in segment 0"
 *   → "run causal on physicians in the group "High Volume Physicians"
 *      (192 records; SQL filter: physician_key IN (SELECT RECORD_ID FROM
 *       ${CLUSTERING_RESULTS_FQN}
 *       WHERE CLUSTER_ID = 0 AND RUN_ID = '<uuid>'))"
 */
function resolveSegmentReferences(
  message: string,
  clusterSummary: Record<number, { label: string; count: number }>,
  recordIdCol: string | undefined,
  runId: string | undefined,
): string {
  const SEGMENT_RE = /\b(?:segment|cluster|group)\s+(\d+)\b/gi;
  if (!SEGMENT_RE.test(message)) return message;
  SEGMENT_RE.lastIndex = 0; // reset after .test()
  return message.replace(SEGMENT_RE, (_match, numStr) => {
    const cid = Number(numStr);
    const info = clusterSummary[cid];
    const label = info?.label ?? `Cluster ${cid}`;
    const countStr = info?.count != null ? `, ${info.count} records` : '';
    const runFilter = runId ? ` AND RUN_ID = '${runId}'` : '';
    const filter = recordIdCol
      ? `${recordIdCol} IN (SELECT RECORD_ID FROM ${CLUSTERING_RESULTS_FQN} WHERE CLUSTER_ID = ${cid}${runFilter})`
      : `RECORD_ID IN (SELECT RECORD_ID FROM ${CLUSTERING_RESULTS_FQN} WHERE CLUSTER_ID = ${cid}${runFilter})`;
    return `the group "${label}"${countStr} (SQL filter: ${filter})`;
  });
}

// ---------------------------------------------------------------------------
// Feature pool — ordered by analytical value; first 6 are always the standard
// set, extras (7–10) are added when the user requests a larger feature count.
// All columns exist directly on RX_TABLE (no JOINs required).
// ---------------------------------------------------------------------------
const CLUSTER_FEATURE_POOL: string[] = [
  `'TOTAL_CLAIMS',    COUNT(claim_id)::FLOAT`,
  `'AVG_OOP',         AVG(primary_patient_pay)::FLOAT`,
  `'AVG_PLAN_PAY',    AVG(primary_plan_pay)::FLOAT`,
  `'UNIQUE_DRUGS',    COUNT(DISTINCT drug_id)::FLOAT`,
  `'UNIQUE_PATIENTS', COUNT(DISTINCT patient_gid)::FLOAT`,
  // AVG_DAYS_SUPPLY promoted to standard set (replaces FILL_RATE which is
  // degenerate in RX_TABLE — all rows are filled claims so claim_status_code
  // is always '1', producing zero-variance FILL_RATE = 1.0 that adds no
  // discriminating power in clustering).
  `'AVG_DAYS_SUPPLY', AVG(product_days_supply)::FLOAT`,
  // Extended — available when user asks for 7+ features
  `'TOTAL_OOP',       SUM(primary_patient_pay)::FLOAT`,
  `'TOTAL_PLAN_PAY',  SUM(primary_plan_pay)::FLOAT`,
  `'UNIQUE_PLANS',    COUNT(DISTINCT primary_plan_id)::FLOAT`,
  `'FILL_RATE',       AVG(CASE WHEN claim_status_code = '1' THEN 1.0 ELSE 0.0 END)::FLOAT`,
];

/**
 * Extract the minimum feature count from natural-language instructions such as:
 *   "use at least 7 features"
 *   "minimum 8 features"
 *   "use 7+ features"
 *   "with 9 features"
 *
 * Returns the requested count clamped to [5, POOL_SIZE].
 * Returns 5 (the default minimum) when no count instruction is found.
 */
function extractMinFeatureCount(message: string): number {
  const m =
    message.match(/(?:at\s+least|minimum|min|use|with|using|include)\s+(\d+)\+?\s*features?/i) ??
    message.match(/(\d+)\+\s*features?/i);
  if (m) {
    const requested = Number(m[1]);
    // Honour the user's requested count (clamped to pool size); floor at 5
    return Math.min(Math.max(requested, 5), CLUSTER_FEATURE_POOL.length);
  }
  return 5; // default minimum
}

/**
 * Extract column names explicitly listed by the user in a clustering prompt.
 * Handles patterns like:
 *   "using features: TOTAL_CLAIMS, AVG_OOP, UNIQUE_DRUGS"
 *   "features: [TOTAL_CLAIMS, AVG_OOP]"
 *   "cluster on TOTAL_CLAIMS, AVG_OOP and UNIQUE_DRUGS"
 * Returns an empty array when no features are detected.
 */
function extractUserFeatures(message: string): string[] {
  // Pattern 1: "features: col1, col2, ..." (with optional brackets)
  const featuresKeyword = message.match(/features\s*:\s*\[?([^\]\n]+)\]?/i);
  if (featuresKeyword) {
    return featuresKeyword[1]
      .split(/,\s*/)
      .map(f => f.trim().replace(/[[\]]/g, ''))
      .filter(f => f.length > 0 && !/^and$/i.test(f));
  }
  // Pattern 2: "cluster on/using col1, col2 and col3"
  const clusterOn = message.match(/cluster(?:ing)?\s+(?:on|using)\s+([A-Z_][A-Z0-9_,\s]+?)(?:\s+into|\s+for|\.|$)/i);
  if (clusterOn) {
    const candidates = clusterOn[1]
      .split(/,\s*|\s+and\s+/i)
      .map(f => f.trim())
      .filter(f => /^[A-Z_][A-Z0-9_]{2,}$/i.test(f)); // looks like a column name
    if (candidates.length >= 2) return candidates;
  }
  return [];
}

/**
 * Build a Cortex Analyst question that asks for a clustering input query.
 *
 * The analyst must produce a standalone SELECT with exactly 2 columns:
 *   RECORD_ID VARCHAR  — unique entity identifier
 *   FEATURES  VARIANT  — OBJECT_CONSTRUCT of numeric feature key-value pairs
 *
 * These columns are passed by reference to the clustering UDTF:
 *   TABLE(UDTF(src.RECORD_ID, src.FEATURES, n) OVER (PARTITION BY 1))
 */
function buildClusterInputQuestion(message: string, nClusters: number, priorUserQuestion?: string): string {
  const nHint = nClusters > 0
    ? `The user wants exactly ${nClusters} cluster${nClusters !== 1 ? 's' : ''}.`
    : 'The number of clusters will be auto-detected.';

  // If the user is asking to cluster a cohort identified in a prior turn, include
  // that prior question as a natural-language filter hint so Cortex Analyst applies
  // the same population scope (e.g. same drug, same date range, same specialty).
  const cohortSection = priorUserQuestion
    ? `\n\n[COHORT CONTEXT: The user previously identified a specific population with this question — "${priorUserQuestion.slice(0, 400)}". Apply exactly the same filters (state, date range, product, specialty, etc.) when selecting the RECORD_IDs to cluster. Do NOT cluster the entire population.]\n`
    : '';

  // If the user named specific features, generate an explicit OBJECT_CONSTRUCT hint
  // so Cortex Analyst cannot ignore them or default to a single-column fallback.
  // Also honour a minimum-count instruction like "at least 7 features".
  const userFeatures = extractUserFeatures(message);
  const minCount = extractMinFeatureCount(message); // honours "at least N features"
  const featureRule = userFeatures.length > 0
    ? `  - REQUIRED: The OBJECT_CONSTRUCT MUST include ALL of these user-specified features (map each to the appropriate aggregate): ${userFeatures.join(', ')}`
    : `  - REQUIRED: Include AT LEAST ${minCount} diverse numeric features in OBJECT_CONSTRUCT — do NOT use only TOTAL_CLAIMS; include a mix such as AVG_OOP, AVG_PLAN_PAY, UNIQUE_DRUGS, UNIQUE_PATIENTS, FILL_RATE, AVG_DAYS_SUPPLY, TOTAL_OOP, TOTAL_PLAN_PAY, or equivalent aggregates available in the semantic model`;

  const featuresExample = userFeatures.length > 0
    ? userFeatures.slice(0, 5).map(f => `           '${f}', <aggregate of ${f}>::FLOAT`).join(',\n')
    : `           'TOTAL_CLAIMS',    COUNT(claim_id)::FLOAT,
           'AVG_OOP',         AVG(primary_patient_pay)::FLOAT,
           'AVG_DAYS_SUPPLY', AVG(product_days_supply)::FLOAT,
           'UNIQUE_DRUGS',    COUNT(DISTINCT drug_id)::FLOAT,
           'UNIQUE_PATIENTS', COUNT(DISTINCT patient_gid)::FLOAT`;

  return `${message}${cohortSection}

Generate a SELECT query for clustering that returns EXACTLY 2 columns (no others):
  1. RECORD_ID VARCHAR  — the unique entity identifier cast to VARCHAR.
     Use whatever column the semantic model defines as the primary key for this entity type
     (e.g. the physician identifier, patient identifier, etc.).
  2. FEATURES  VARIANT  — numeric metrics packed with OBJECT_CONSTRUCT, cast as VARIANT.

Example of the required format (use the correct table and column names from the semantic model):
  SELECT <entity_key>::VARCHAR AS RECORD_ID,
         OBJECT_CONSTRUCT(
${featuresExample}
         )::VARIANT AS FEATURES
  FROM   <appropriate_table_from_semantic_model>
  WHERE  <relevant_filters>
  GROUP  BY <entity_key>
  HAVING COUNT(*) >= 5

Strict rules:
  - Output a standalone SELECT only — no trailing semicolon, no CALL or INSERT
  - Use the column names and table names exactly as defined in the semantic model
  - GROUP BY the entity identifier column
  - OBJECT_CONSTRUCT keys must be NUMERIC aggregates (SUM/COUNT/AVG/etc.) cast to ::FLOAT
  - HAVING COUNT(*) >= 5 to exclude sparse records
  - Do NOT add a LIMIT clause — the clustering UDTF must receive all matching records
${featureRule}
  - ${nHint}`;
}

/**
 * Generate a human-readable clustering narrative from the UDTF result rows.
 *
 * Parses MODEL_METADATA (a JSON string present on every row, identical for
 * all rows in a run) and synthesises a markdown summary that
 * SegmentationArtifact.parseClusteringNarrative() can further enrich.
 */
function buildClusterNarrative(
  rows: Record<string, unknown>[],
  nClustersRequested: number,
): string {
  if (rows.length === 0) {
    return 'Clustering returned no results. The input query may have produced no records.';
  }

  // Parse MODEL_METADATA from the first row — it is identical for all rows.
  let meta: Record<string, unknown> = {};
  const rawMeta = rows[0]['MODEL_METADATA'] ?? rows[0]['model_metadata'];
  if (typeof rawMeta === 'string') {
    try { meta = JSON.parse(rawMeta) as Record<string, unknown>; } catch { /* ignore */ }
  }

  const algorithm      = (meta['algorithm'] as string | undefined) ?? 'Clustering';
  const nClustersUsed  = (meta['n_clusters'] as number | undefined) ?? nClustersRequested;
  const totalRecords   = (meta['n_records'] as number | undefined) ?? rows.length;
  const featureNames   = (meta['feature_names'] as string[] | undefined) ?? [];
  const silhouette     = meta['global_silhouette_avg'] as number | undefined;
  const confLabel      = meta['model_confidence_label'] as string | undefined;
  const dq             = meta['data_quality'] as Record<string, unknown> | undefined;
  const dropped        = (dq?.['dropped_features'] as string[] | undefined) ?? [];
  const droppedProt    = (dq?.['dropped_protected'] as string[] | undefined) ?? [];
  const clusterProfs   = meta['cluster_profiles'] as Record<string, Record<string, unknown>> | undefined;
  const clusterSizes   = meta['cluster_sizes'] as Record<string, number> | undefined;

  const lines: string[] = [];

  // ── Header ─────────────────────────────────────────────────────────────────
  lines.push(
    `**${algorithm} clustering** identified **${nClustersUsed} segment${nClustersUsed !== 1 ? 's' : ''}** ` +
    `across **${totalRecords.toLocaleString()} records**` +
    (featureNames.length > 0
      ? ` using **${featureNames.length} feature${featureNames.length !== 1 ? 's' : ''}** ` +
        `(${featureNames.slice(0, 5).join(', ')}${featureNames.length > 5 ? ', …' : ''})`
      : '') +
    '.',
  );

  // ── Model quality ──────────────────────────────────────────────────────────
  if (silhouette !== undefined) {
    const qual = silhouette > 0.5 ? 'strong cluster separation'
               : silhouette > 0.2 ? 'moderate cluster separation'
               : 'weak cluster separation — interpret with caution';
    lines.push(`Model confidence: **${confLabel ?? 'N/A'}** (silhouette = ${silhouette.toFixed(3)} — ${qual}).`);
  }

  // ── Data quality warnings ──────────────────────────────────────────────────
  if (droppedProt.length > 0) {
    lines.push(
      `⚠️ User-requested feature${droppedProt.length > 1 ? 's' : ''} **${droppedProt.join(', ')}** ` +
      `dropped due to zero variance — check your data pipeline for these columns.`,
    );
  } else if (dropped.length > 0) {
    lines.push(`${dropped.length} feature${dropped.length > 1 ? 's' : ''} dropped due to zero variance.`);
  }

  // ── Per-segment summaries ──────────────────────────────────────────────────
  if (clusterProfs) {
    for (const [idStr, profile] of Object.entries(clusterProfs)) {
      const size      = clusterSizes?.[idStr] ?? 0;
      const pct       = totalRecords > 0 ? ((size / totalRecords) * 100).toFixed(1) : '?';
      const topDriver = profile['_TOP_DRIVER'] as string | undefined;
      const topZ      = profile['_TOP_DRIVER_ZSCORE'] as number | undefined;

      const driverStr = topDriver
        ? ` — top driver: **${topDriver}** (Z=${typeof topZ === 'number' ? topZ.toFixed(2) : '?'})`
        : '';
      lines.push(`- **Segment ${idStr}** (${size.toLocaleString()} records, ${pct}%)${driverStr}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// RouteDispatcher
// ---------------------------------------------------------------------------

export class RouteDispatcher {
  constructor(private context: ExecutionContext) {}

  async *dispatch(message: string, signal?: AbortSignal): AsyncGenerator<DispatchEvent> {
    const startMs = now();
    const reqId = startMs.toString(36);
    console.time(`TOTAL_REQUEST:${reqId}`);

    // -----------------------------------------------------------------------
    // 1. Classify intent
    // -----------------------------------------------------------------------
    yield {
      ...baseEvent('ROUTING', this.context),
      payload: { stage: 'classifying' },
    };

    const priorIntents = this.context.conversationHistory
      .filter((m) => m.role === 'assistant' && m.intent)
      .map((m) => m.intent as AgentIntent);

    console.time(`2_CLASSIFY_INTENT:${reqId}`);
    const classification = await classifyIntent({
      message,
      conversationContext: this.context.conversationHistory
        .slice(-16)
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n'),
      priorIntents,
    });
    console.timeEnd(`2_CLASSIFY_INTENT:${reqId}`);

    console.log(`[DISPATCHER] intent=${classification.intent} confidence=${classification.confidence} patterns=[${classification.matchedPatterns.join(', ')}]`);

    const intent: AgentIntent =
      classification.intent === 'UNKNOWN' ? 'ANALYST' : classification.intent;

    // Look up the route
    const route = AGENT_ROUTING_MAP[intent];
    const agentName = route.displayName;
    console.log(`[DISPATCHER] route: type=${route.type} agent=${route.cortexAgentName ?? 'n/a'} display="${agentName}"`);

    // -----------------------------------------------------------------------
    // 2. Routing event
    // -----------------------------------------------------------------------
    yield {
      ...baseEvent('ROUTING', this.context),
      intent,
      agentName,
      payload: {
        stage: 'routing',
        routingType: route.type,
        cortexAgentName: route.cortexAgentName,
        confidence: classification.confidence,
        matchedPatterns: classification.matchedPatterns,
      },
    };

    // -----------------------------------------------------------------------
    // 3. Rate limit check
    // -----------------------------------------------------------------------
    console.time(`3_RATE_LIMIT:${reqId}`);
    const rateLimitResult = await rateLimiter.checkAndConsume(this.context.userId);
    console.timeEnd(`3_RATE_LIMIT:${reqId}`);
    if (!rateLimitResult.allowed) {
      yield {
        ...baseEvent('ERROR', this.context),
        intent,
        agentName,
        error: rateLimitResult.reason ?? 'Rate limit exceeded.',
        payload: {
          retryAfterMs: rateLimitResult.retryAfterMs,
          remainingQueries: rateLimitResult.remainingQueries,
        },
      };
      return;
    }

    // -----------------------------------------------------------------------
    // 4. Cost estimate
    // -----------------------------------------------------------------------
    const costEstimate = costEstimator.estimate(intent, message, {});
    yield {
      ...baseEvent('ROUTING', this.context),
      intent,
      agentName,
      payload: {
        stage: 'cost_estimate',
        costEstimate,
        remainingCredits: rateLimitResult.remainingCredits,
      },
    };

    // -----------------------------------------------------------------------
    // 5. Build base AgentInput (used by PATH A and the pipeline path)
    // -----------------------------------------------------------------------
    const baseInput: AgentInput = {
      message,
      intent,
      sessionId: this.context.sessionId,
      userId: this.context.userId,
      semanticView: this.context.semanticView,
      conversationHistory: this.context.conversationHistory,
      userPreferences: this.context.userPreferences,
      extraContext: { abortSignal: signal, bypassCache: this.context.bypassCache ?? false },
    };

    // -----------------------------------------------------------------------
    // 6. Dispatch
    // -----------------------------------------------------------------------
    let result: AgentResult = { success: false, error: 'Dispatcher: no execution path matched', durationMs: 0, retryCount: 0 };

    try {
      // ─────────────────────────────────────────────────────────────────────
      // PATH C — pipeline (decompose into multiple steps)
      // ─────────────────────────────────────────────────────────────────────
      if (route.type === 'pipeline') {
        result = yield* this.dispatchPipeline(message, intent, agentName, baseInput, signal, startMs);
      }

      // ─────────────────────────────────────────────────────────────────────
      // PATH A — cortex_analyst
      // ─────────────────────────────────────────────────────────────────────
      else if (route.type === 'cortex_analyst') {
        yield { ...baseEvent('AGENT_START', this.context), intent, agentName };

        // ── Intercept cluster-profile queries ─────────────────────────────
        // After a clustering run, questions like "key traits of cluster 1"
        // are classified as ANALYST (post-cluster follow-up suppression), but
        // Cortex Analyst cannot answer them — cluster assignments are outside
        // the semantic model.  When stored cluster metadata exists we answer
        // directly from the narrative without calling Cortex Analyst.
        const clusterMeta = this.context.getLastClusterMeta?.();
        if (clusterMeta && isClusterProfileQuery(message)) {
          const lastClusterMsg = [...this.context.conversationHistory]
            .reverse()
            .find((m) => m.role === 'assistant' && m.intent && /^CLUSTER/.test(String(m.intent)));
          const clusterNarrative = lastClusterMsg?.content ?? '';
          const responseText = buildClusterProfileResponse(
            message,
            clusterNarrative,
            clusterMeta.clusterSummary ?? {},
            clusterMeta.algorithm ?? 'Clustering',
          );
          console.log(`[DISPATCHER] Cluster profile query intercepted — answering from stored narrative`);
          result = buildAgentResult(
            'cluster-profile', intent, agentName,
            responseText, undefined, null,
            now() - startMs, randomUUID(),
          );
        } else {
          console.time(`5_ANALYST_AGENT:${reqId}`);
          result = await analystAgent.execute(baseInput);
          console.timeEnd(`5_ANALYST_AGENT:${reqId}`);
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // PATH B-CLUSTER — CLUSTER* intents bypass the named agent entirely.
      //
      // Flow:
      //   1. Cortex Analyst → generate RECORD_ID + FEATURES input query
      //   2. Wrap in UDTF SELECT...TABLE()...OVER() (not CALL — SQL API
      //      cannot execute CALL for stored procedures)
      //   3. executeSQL() → raw UDTF rows
      //   4. Convert to { results: { headers, rows } } for SegmentationArtifact
      //   5. persistClusteringResults() [non-blocking]
      //   6. buildClusterNarrative() from MODEL_METADATA
      //
      // SRI_CLUSTERING_AGENT is NOT called for CLUSTER* intents (except
      // CLUSTER_COMPARE, which falls through to PATH B-AGENT so that the
      // named agent can handle multi-algorithm comparison natively).
      // ─────────────────────────────────────────────────────────────────────
      else if (intent.startsWith('CLUSTER') && intent !== 'CLUSTER_COMPARE') {
        result = yield* this.dispatchCluster(
          message, intent, agentName,
          route.cortexAgentName ?? `${DB_ML}.SRI_CLUSTERING_AGENT`,
          baseInput, signal, startMs,
        );
      }

      // ─────────────────────────────────────────────────────────────────────
      // PATH B-AGENT — other named Snowflake agents (FORECAST, CAUSAL, MTREE,
      // and CLUSTER_COMPARE which needs multi-algorithm support from the agent)
      // ─────────────────────────────────────────────────────────────────────
      else {
        const cortexRef = route.cortexAgentName!;

        yield {
          ...baseEvent('AGENT_START', this.context),
          intent,
          agentName,
          payload: { stage: 'calling_cortex_agent', cortexAgentName: cortexRef },
        };

        // Use getLastAnalystResult() to get both SQL and columns so that
        // enrichMessage can build a directive cohort constraint for FORECAST
        // and CAUSAL intents (not just a passive SQL code-block hint).
        const priorAnalyst = this.context.getLastAnalystResult?.();
        const lastSQL = priorAnalyst?.sql ?? this.context.getLastAnalystSQL?.();
        // Pull the last ANALYST narrative from conversation history to give
        // downstream agents (FORECAST, CAUSAL, MTREE) cohort context.
        const lastAnalystNarrative = [...this.context.conversationHistory]
          .reverse()
          .find((m) => m.role === 'assistant' && m.intent === 'ANALYST')
          ?.content;
        const isForecastIntent = /^FORECAST_/.test(intent) || intent === 'FORECAST_COMPARE' as string;
        const isCausalIntent = /^CAUSAL/.test(intent);
        const clusterInfo = this.context.getLastClusterMeta?.();

        // ── Cluster context for forecast / causal ─────────────────────────
        // When a clustering run preceded this forecast or causal request we
        // try two things:
        //
        // 1. Fetch per-cluster label+count (lightweight summary).
        // 2. Compute per-cluster metric thresholds by joining the prior cohort
        //    SQL with CLUSTERING_RESULTS server-side.  These thresholds let the
        //    forecast agent filter via plain "metric BETWEEN min AND max" SQL —
        //    no CLUSTERING_RESULTS reference required (Cortex Analyst cannot
        //    resolve that table since it is outside the semantic model).
        //    Causal agents CAN reference CLUSTERING_RESULTS directly, but the
        //    summary still lets us build the segment→label mapping injected into
        //    the enriched message.
        let clusterSummary: Record<number, { label: string; count: number }> | undefined;
        let clusterThresholds: Record<number, {
          label: string; count: number; metricCol: string; minVal: number; maxVal: number;
        }> | undefined;

        // ── Step 1: Fetch cluster summary ─────────────────────────────────────
        // Always fetch when a prior in-memory clustering run is known (forecast
        // or causal follow-up), OR when a causal intent references a segment by
        // number even without in-memory cluster meta — this handles the common
        // case where clustering was done in a prior browser session.
        const hasCausalSegmentRef = isCausalIntent &&
          /\b(?:segment|cluster|group)\s+\d+\b/i.test(message);

        if ((clusterInfo && (isForecastIntent || isCausalIntent)) || hasCausalSegmentRef) {
          // Use the in-memory summary stored by dispatchCluster when available —
          // this avoids an extra Snowflake round-trip and is always accurate for
          // the current session's clustering run.
          const storedMeta = this.context.getLastClusterMeta?.();
          if (storedMeta?.clusterSummary && Object.keys(storedMeta.clusterSummary).length > 0) {
            clusterSummary = storedMeta.clusterSummary;
            console.log(`[CLUSTER_CTX] Cluster summary from context (in-memory): ${
              Object.entries(clusterSummary).map(([k, v]) => `Cluster ${k} (${v.label}): ${v.count}`).join(', ')}`);
          } else {
            // Fallback: query CLUSTERING_RESULTS for cross-session or pre-fix scenarios.
            try {
              // Scope to the latest run only — without this filter the GROUP BY
              // aggregates across all historical runs, inflating per-cluster counts
              // dramatically (e.g. 192 → 75 485 for a table with many prior runs).
              const summaryResult = await executeSQL(
                `SELECT CLUSTER_ID, MAX(CLUSTER_LABEL) AS CLUSTER_LABEL, COUNT(*) AS RECORD_CNT
                 FROM ${CLUSTERING_RESULTS_FQN}
                 WHERE RUN_TIMESTAMP = (SELECT MAX(RUN_TIMESTAMP) FROM ${CLUSTERING_RESULTS_FQN})
                 GROUP BY CLUSTER_ID ORDER BY CLUSTER_ID`,
                SNOWFLAKE_ROLE, signal,
              );
              if (summaryResult.rowCount > 0) {
                clusterSummary = {};
                for (const row of summaryResult.rows) {
                  const cid = Number(row['CLUSTER_ID'] ?? row['cluster_id']);
                  const lbl = String(row['CLUSTER_LABEL'] ?? row['cluster_label'] ?? `Cluster ${cid}`);
                  const cnt = Number(row['RECORD_CNT'] ?? row['record_cnt'] ?? 0);
                  clusterSummary[cid] = { label: lbl, count: cnt };
                }
                console.log(`[CLUSTER_CTX] Cluster summary from Snowflake (fallback): ${
                  Object.entries(clusterSummary).map(([k, v]) => `Cluster ${k} (${v.label}): ${v.count}`).join(', ')}`);
              }
            } catch (err) {
              console.warn('[CLUSTER_CTX] Could not fetch cluster summary:', err instanceof Error ? err.message : String(err));
            }
          }
        }

        // ── Step 2: Synthesise clusterInfo from CLUSTERING_RESULTS when the
        //    in-memory record is absent (cross-session scenario) ───────────────
        // CLUSTERING_RESULTS stores ALGORITHM, N_SEGMENTS_USED, and RUN_TIMESTAMP
        // on every row.  Query the latest run to reconstruct enough metadata for
        // message enrichment.  The semantic model relationship
        // (CLUSTERING_RESULTS.RECORD_ID = physician_ref.physician_key) means the
        // CI agent can resolve the physician key join itself — we use
        // 'physician_key' as the default recordIdCol since that is what the
        // relationship exposes.
        let effectiveClusterInfo = clusterInfo ?? undefined;
        if (!effectiveClusterInfo && hasCausalSegmentRef && clusterSummary) {
          try {
            // Fetch a single representative row from the latest run so we can
            // get ALGORITHM, N_SEGMENTS_USED, and — critically — the exact RUN_ID.
            // Using LIMIT 1 instead of MAX(RUN_ID) avoids lexicographic UUID
            // ordering issues when multiple runs share the same RUN_TIMESTAMP.
            const latestRunResult = await executeSQL(
              `SELECT ALGORITHM, N_SEGMENTS_USED, RUN_ID
               FROM ${CLUSTERING_RESULTS_FQN}
               WHERE RUN_TIMESTAMP = (
                 SELECT MAX(RUN_TIMESTAMP) FROM ${CLUSTERING_RESULTS_FQN}
               )
               LIMIT 1`,
              SNOWFLAKE_ROLE, signal,
            );
            if (latestRunResult.rowCount > 0) {
              const row = latestRunResult.rows[0];
              effectiveClusterInfo = {
                nClusters: Number(row['N_SEGMENTS_USED'] ?? row['n_segments_used'] ?? Object.keys(clusterSummary).length),
                recordIdCol: 'physician_key', // default: matches CLUSTERING_RESULTS.RECORD_ID semantic model relationship
                algorithm: String(row['ALGORITHM'] ?? row['algorithm'] ?? 'Clustering'),
                runId: String(row['RUN_ID'] ?? row['run_id'] ?? 'unknown'),
              };
              console.log(`[CLUSTER_CTX] Synthetic clusterInfo from CLUSTERING_RESULTS: ` +
                `algorithm=${effectiveClusterInfo.algorithm} nClusters=${effectiveClusterInfo.nClusters} ` +
                `recordIdCol=${effectiveClusterInfo.recordIdCol} (cross-session)`);
            }
          } catch (err) {
            console.warn('[CLUSTER_CTX] Could not synthesise clusterInfo from CLUSTERING_RESULTS:', err instanceof Error ? err.message : String(err));
          }
        }

        // ── Step 3: Metric thresholds for forecast scoping ────────────────────
        // Joins the prior cohort SQL with CLUSTERING_RESULTS so the forecast
        // agent can filter via plain BETWEEN expressions (no CLUSTERING_RESULTS
        // reference needed in its SQL, which Cortex Analyst cannot resolve for
        // forecast intents).  Only runs when we have a real (not synthetic)
        // clusterInfo — synthetic info has no prior cohort SQL to join.
        if (clusterInfo && isForecastIntent) {
          const recordIdCol = clusterInfo.recordIdCol;
          const metricCol = priorAnalyst?.columns?.find(c =>
            c !== recordIdCol &&
            !/^(date|week|month|year|period|time|ds|record_id)/i.test(c),
          );
          if (lastSQL && recordIdCol && metricCol && clusterSummary && Object.keys(clusterSummary).length >= 2) {
            try {
              const cleanSQL = lastSQL
                .replace(/--[^\n]*/g, '')
                .replace(/;/g, '')
                .replace(/\s+ORDER\s+BY\s+[\s\S]+$/i, '')
                .trim();
              const thresholdSQL =
                `WITH cohort AS (\n${cleanSQL}\n)\n` +
                `SELECT cr.CLUSTER_ID,\n` +
                `       MAX(cr.CLUSTER_LABEL)  AS CLUSTER_LABEL,\n` +
                `       COUNT(*)               AS RECORD_CNT,\n` +
                `       MIN(cohort.${metricCol}) AS MIN_VAL,\n` +
                `       MAX(cohort.${metricCol}) AS MAX_VAL\n` +
                `FROM   cohort\n` +
                `JOIN   ${CLUSTERING_RESULTS_FQN} cr\n` +
                `  ON   CAST(cohort.${recordIdCol} AS VARCHAR) = cr.RECORD_ID\n` +
                `GROUP  BY cr.CLUSTER_ID\n` +
                `ORDER  BY cr.CLUSTER_ID`;
              const threshResult = await executeSQL(thresholdSQL, SNOWFLAKE_ROLE, signal);
              if (threshResult.rowCount >= 2) {
                clusterThresholds = {};
                for (const row of threshResult.rows) {
                  const cid  = Number(row['CLUSTER_ID'] ?? row['cluster_id']);
                  const lbl  = String(row['CLUSTER_LABEL'] ?? row['cluster_label'] ?? `Cluster ${cid}`);
                  const cnt  = Number(row['RECORD_CNT'] ?? row['record_cnt'] ?? 0);
                  const minV = Number(row['MIN_VAL'] ?? row['min_val'] ?? 0);
                  const maxV = Number(row['MAX_VAL'] ?? row['max_val'] ?? 0);
                  clusterThresholds[cid] = { label: lbl, count: cnt, metricCol, minVal: minV, maxVal: maxV };
                }
                console.log(`[CLUSTER_CTX] Cluster thresholds (${metricCol}): ${
                  Object.entries(clusterThresholds).map(([k, v]) => `Cluster ${k}: ${v.minVal}–${v.maxVal}`).join(', ')}`);
              }
            } catch (err) {
              console.warn('[CLUSTER_CTX] Could not compute cluster thresholds:', err instanceof Error ? err.message : String(err));
            }
          }
        }

        // ── Step 4: Resolve "segment N" references in the user message ────────
        // Rewrites "segment 0" → "the group 'High Volume Physicians', 192 records
        // (SQL filter: physician_key IN (SELECT RECORD_ID FROM CLUSTERING_RESULTS
        // WHERE CLUSTER_ID = 0))" so the agent receives an explicit filter rather
        // than an undefined term it will look up in the semantic model.
        const resolvedMessage = isCausalIntent && clusterSummary && effectiveClusterInfo
          ? resolveSegmentReferences(message, clusterSummary, effectiveClusterInfo.recordIdCol, effectiveClusterInfo.runId)
          : message;
        if (isCausalIntent) {
          if (resolvedMessage !== message) {
            console.log(`[CAUSAL] Segment references resolved in message: "${resolvedMessage.slice(0, 400)}"`);
          } else if (hasCausalSegmentRef && !clusterSummary) {
            console.warn(`[CAUSAL] clusterSummary unavailable — segment references NOT resolved. ` +
              `clusterInfo=${!!clusterInfo} effectiveClusterInfo=${!!effectiveClusterInfo}. ` +
              `"segment N" in message will be sent as-is to agent.`);
          }
        }

        const enriched = enrichMessage(resolvedMessage, intent, {
          priorSQL: lastSQL ?? undefined,
          priorColumns: priorAnalyst?.columns,
          priorNarrative: lastAnalystNarrative,
          clusterInfo: effectiveClusterInfo,
          clusterSummary,
          clusterThresholds,
          // Parse horizon from the original user message so the agent honours
          // requests like "4-week forecast" instead of always using 13 weeks.
          forecastHorizon: isForecastIntent
            ? parseForecastHorizon(message)
            : undefined,
        });
        // Derive the intent family prefix (e.g. "CAUSAL", "FORECAST", "MTREE")
        // so buildAgentMessages can filter out unrelated assistant turns from
        // prior runs (e.g. clustering narrative confusing the causal agent).
        const intentFamily = intent.includes('_')
          ? intent.split('_')[0]
          : intent;
        const agentMessages = this.buildAgentMessages(enriched, intentFamily);

        const lineageId = randomUUID();
        console.time(`5_CORTEX_AGENT:${reqId}`);
        const cortexResponse = await callCortexAgent(cortexRef, agentMessages, signal);
        console.timeEnd(`5_CORTEX_AGENT:${reqId}`);

        result = buildAgentResult(
          cortexRef,
          intent,
          agentName,
          cortexResponse.text,
          cortexResponse.sql,
          cortexResponse.data,
          cortexResponse.executionTimeMs,
          lineageId,
          cortexResponse.error,
        );
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const errorMsg = err instanceof Error ? err.message : String(err);
      yield {
        ...baseEvent('AGENT_ERROR', this.context),
        intent,
        agentName,
        error: errorMsg,
      };
      return;
    }

    // -----------------------------------------------------------------------
    // 7. Emit agent complete
    // -----------------------------------------------------------------------
    if (!result.success && result.error) {
      yield {
        ...baseEvent('AGENT_ERROR', this.context),
        intent,
        agentName,
        error: result.error,
      };
      return;
    }

    // Store successful result so subsequent turns can access it via context
    // helpers (getLastAnalystSQL, getLastAnalystData, etc.).
    if (result.success && result.artifact) {
      this.context.storeResult(`${intent}_${startMs}`, result);
    }

    // -----------------------------------------------------------------------
    // 8. Formatting
    // -----------------------------------------------------------------------
    yield {
      ...baseEvent('SYNTHESIS_START', this.context),
      intent,
      payload: { stage: 'formatting' },
    };

    console.time(`9_FORMAT:${reqId}`);
    const formatted = synthesizer.formatResult(result, intent);
    console.timeEnd(`9_FORMAT:${reqId}`);

    // -----------------------------------------------------------------------
    // 9. Record credit usage (non-blocking)
    // -----------------------------------------------------------------------
    rateLimiter.recordCreditUsage(this.context.userId, costEstimate.credits);

    // -----------------------------------------------------------------------
    // 10. Record lineage (non-blocking)
    // -----------------------------------------------------------------------
    lineageTracker.record({
      sessionId: this.context.sessionId,
      userId: this.context.userId,
      semanticViewId: this.context.semanticView.id,
      semanticViewName: this.context.semanticView.displayName,
      userQuestion: message,
      intent,
      agentName,
      executedSQL: result.artifact?.sql,
      rowCount: (() => {
        const d = result.artifact?.data as Record<string, unknown> | undefined;
        const rows = (d?.['results'] as { rows?: unknown[] } | undefined)?.rows;
        return Array.isArray(rows) ? rows.length : undefined;
      })(),
      executionTimeMs: now() - startMs,
      cacheStatus: result.artifact?.cacheStatus ?? 'miss',
      creditsConsumed: costEstimate.credits,
    });

    // -----------------------------------------------------------------------
    // 11. Build FormattedResponse
    // -----------------------------------------------------------------------
    const formattedResponse: FormattedResponse = synthesizer.toFormattedResponse(formatted, {
      sessionId: this.context.sessionId,
      intent,
      durationMs: now() - startMs,
      totalCostEstimate: {
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: costEstimate.credits * 0.002,
        model: agentName,
      },
    });

    // -----------------------------------------------------------------------
    // 12. Add to conversation history
    // -----------------------------------------------------------------------
    // Store BOTH the user message and the assistant response so that
    // buildConversationHistory() always produces properly alternating
    // user/analyst pairs for Cortex Analyst.  Without the user message,
    // consecutive assistant turns produce [analyst, analyst, ...] which
    // causes Cortex Analyst 400: "Role must change after every message."
    this.context.addMessage({
      id: `user_${startMs}`,
      role: 'user',
      content: message,
      timestamp: startMs,
    });
    this.context.addMessage({
      id: formattedResponse.id,
      role: 'assistant',
      content: formattedResponse.narrative,
      timestamp: now(),
      intent,
      artifactId: result.artifact?.id,
      // Persist the generated SQL so buildConversationHistory() can replay it as
      // a { type: 'sql', statement } content block in subsequent Cortex Analyst
      // calls — giving the model the structural context needed for accurate follow-ups.
      sql: result.artifact?.sql,
    });

    // -----------------------------------------------------------------------
    // 13. Emit complete
    // -----------------------------------------------------------------------
    console.timeEnd(`TOTAL_REQUEST:${reqId}`);
    yield {
      ...baseEvent('SYNTHESIS_COMPLETE', this.context),
      intent,
      agentName,
      payload: { result: formattedResponse },
    };
  }

  // ---------------------------------------------------------------------------
  // PATH C — pipeline
  // ---------------------------------------------------------------------------

  private async *dispatchPipeline(
    message: string,
    intent: AgentIntent,
    agentName: string,
    baseInput: AgentInput,
    signal: AbortSignal | undefined,
    startMs: number,
  ): AsyncGenerator<DispatchEvent, AgentResult> {
    // Decompose the request into a pipeline definition.
    // The LLM classifier will have set intent='PIPELINE' for complex multi-step
    // requests; here we build a minimal pipeline that covers the common cases.
    const { decomposeIntoPipeline } = await import('../llm/anthropic');

    let pipelineDef: Awaited<ReturnType<typeof decomposeIntoPipeline>> | null = null;
    try {
      pipelineDef = await decomposeIntoPipeline({
        message,
        semanticViewDisplayName: this.context.semanticView.displayName,
        conversationContext: this.context.conversationHistory
          .slice(-4)
          .map((m) => `${m.role}: ${m.content}`)
          .join('\n'),
      });
    } catch { /* fall back to default 2-step pipeline */ }

    const pipeline = pipelineDef ?? this.buildDefaultPipeline(message);

    const executor = new PipelineExecutor(this.context);

    // Track the last successfully-completed step result explicitly rather than
    // using .pop() on intermediateResults (which iterates insertion order and
    // could return a result from a prior turn if no new step completed).
    let lastStepResult: AgentResult | undefined;

    for await (const pipelineEvent of executor.execute(pipeline, { nlQuery: message })) {
      if (pipelineEvent.type === 'step_start') {
        yield {
          ...baseEvent('AGENT_START', this.context),
          intent,
          agentName: pipelineEvent.agentName,
          payload: { stepId: pipelineEvent.stepId },
        };
      } else if (pipelineEvent.type === 'step_complete') {
        lastStepResult = pipelineEvent.result;
        yield {
          ...baseEvent('AGENT_COMPLETE', this.context),
          intent,
          agentName,
          payload: { stepId: pipelineEvent.stepId, result: pipelineEvent.result },
        };
      } else if (pipelineEvent.type === 'step_error') {
        yield {
          ...baseEvent('AGENT_ERROR', this.context),
          intent,
          agentName,
          error: pipelineEvent.error,
          payload: { stepId: pipelineEvent.stepId },
        };
      } else if (pipelineEvent.type === 'synthesis') {
        yield {
          ...baseEvent('SYNTHESIS_COMPLETE', this.context),
          intent,
          payload: { narrative: pipelineEvent.narrative },
        };
      }
    }

    // Return the result from the last completed pipeline step.
    return lastStepResult ?? {
      success: false,
      error: 'Pipeline produced no results.',
      durationMs: Date.now() - startMs,
      retryCount: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // PATH B-CLUSTER — direct UDTF execution (bypasses named agent)
  // ---------------------------------------------------------------------------

  private async *dispatchCluster(
    message: string,
    intent: AgentIntent,
    agentName: string,
    cortexAgentRef: string,
    baseInput: AgentInput,
    signal: AbortSignal | undefined,
    startMs: number,
  ): AsyncGenerator<DispatchEvent, AgentResult> {
    const reqId = startMs.toString(36);
    const lineageId = randomUUID();

    yield {
      ...baseEvent('AGENT_START', this.context),
      intent,
      agentName,
      payload: { stage: 'clustering_direct', intent },
    };

    const nClusters = extractNClusters(message);
    console.log(
      `[CLUSTER] intent=${intent} n_clusters=${nClusters} ` +
      `(${nClusters === 0 ? 'auto-detect' : 'user-specified'})`,
    );

    // ── Step 1: RECORD_ID + FEATURES input query ────────────────────────────
    // PATH 1A — Prior ANALYST cohort exists: build the RECORD_ID + FEATURES
    //   SQL directly from the prior result (exact same WHERE / HAVING / LIMIT).
    //   This guarantees clustering runs on exactly the identified cohort without
    //   Cortex Analyst re-interpreting the population from a NL hint.
    // PATH 1B — No prior cohort: ask Cortex Analyst to generate the query.
    let inputQuery = '';

    const priorAnalyst = this.context.getLastAnalystResult?.();
    const userFeatures = extractUserFeatures(message);
    // How many features the user wants — respects "at least N features" phrasing.
    // Used by all three SQL-building paths (1A, 1A-SCOPED, 1B) to guarantee the
    // correct feature count regardless of which path runs.
    const nFeatures = extractMinFeatureCount(message);
    console.log(`[CLUSTER] Requested feature count: ${nFeatures}`);

    // ── PATH 1A / 1A-SCOPED — prior analyst cohort exists ───────────────────
    // Build the clustering input SQL directly from the prior result so the
    // clustering runs on exactly the same cohort (same WHERE / HAVING).
    // PATH 1B (Cortex Analyst) is used as fallback when there is no prior cohort.
    if (priorAnalyst?.sql && priorAnalyst.columns.length > 0) {
      console.log(`[CLUSTER] Prior cohort detected (${priorAnalyst.columns.length} cols).`);

      const ENTITY_ID_RE = /key|_id$|^id_|^npi|gid|identifier/i;
      // rawIdCol: column name as it appears in the prior analyst result (may be any alias)
      const rawIdCol = priorAnalyst.columns.find(c => ENTITY_ID_RE.test(c)) ?? priorAnalyst.columns[0];

      // Hard rule: always resolve to the canonical RX_TABLE column name.
      // physician_gid (semantic view name) → physician_key (RX_TABLE column).
      // physician_key is the universal physician identifier present across all
      // relevant tables (RX_TABLE, PHYSICIAN_REF, CLUSTERING_RESULTS, etc.) and
      // its values match what the semantic view exposes as physician_gid.
      const idCol = normaliseEntityKey(rawIdCol);
      console.log(`[CLUSTER] cohortKey="${rawIdCol}" → rxKey="${idCol}"`);

      // Numeric feature columns in the prior result.
      // SKIP_PATTERNS extended to exclude geographic/contact text fields
      // (city, address, street, zip, phone, fax) which were previously being
      // counted as numeric features and inflating priorFeatureCols.length.
      const priorFeatureCols = priorAnalyst.columns.filter(
        c => !/key|_id$|^id_|^npi|gid|identifier|code$|name|desc|label|date|year|month|quarter|day|state|type|category|status|flag|city|address|street|zip|phone|fax/i.test(c),
      );

      if (priorFeatureCols.length >= 5) {
        // PATH 1A: prior result already has 5+ numeric feature columns — use them
        // directly from _prior_cohort (no RX_TABLE join needed).
        const cohortSQL = buildCohortClusterSQL(priorAnalyst.sql, priorAnalyst.columns);
        if (cohortSQL) {
          const enriched = enrichClusterInputSQL(cohortSQL, nFeatures);
          if (countObjectConstructKeys(enriched) >= nFeatures) {
            console.log(`[CLUSTER] PATH 1A: using prior cohort SQL features.`);
            inputQuery = enriched;
          }
        }
      }

      if (!inputQuery) {
        // PATH 1A-SCOPED: re-aggregate rich RX_TABLE features scoped to the cohort.
        //
        // cohortKey (rawIdCol, e.g. "PHYSICIAN_GID") is read from _prior_cohort.
        // rxKey     (idCol,    e.g. "physician_key") is the canonical RX_TABLE column.
        //
        // Hard rule: physician_gid values from the semantic view are identical to
        // physician_key values in RX_TABLE — the join is always valid.  Using
        // physician_key as the join target (rxKey) ensures CLUSTERING_RESULTS.RECORD_ID
        // also stores physician_key values, keeping all downstream joins consistent.
        console.log(`[CLUSTER] PATH 1A-SCOPED: cohortKey="${rawIdCol}" rxKey="${idCol}" nFeatures=${nFeatures}`);
        inputQuery = buildCohortScopedFeatureSQL(rawIdCol, idCol, priorAnalyst.sql, nFeatures);
        console.log(`[CLUSTER] PATH 1A-SCOPED SQL (first 400):\n${inputQuery.slice(0, 400)}`);
      }
    }

    // ── PATH 1B — no prior cohort: Cortex Analyst generates the SQL ─────────
    if (!inputQuery) {
      // Pass conversation history so Cortex Analyst understands follow-on context
      // like "cluster those physicians". Content must be Array<{type,text}>.
      const clusterHistory = this.context.conversationHistory
        .slice(-16)
        .map((m) => ({
          role: (m.role === 'assistant' ? 'analyst' : 'user') as 'user' | 'analyst',
          content: [{ type: 'text', text: m.content }],
        }));

      // Extract the prior user question (if any) to pass as cohort context so
      // Cortex Analyst scopes the clustering to the same population.
      const priorUserQ = this.context.conversationHistory
        .slice().reverse()
        .find(m => m.role === 'user' && m.content !== message)
        ?.content;

      const analystQuestion = normalizeUserQuestion(
        buildClusterInputQuestion(message, nClusters, priorUserQ),
      );
      console.time(`5a_CLUSTER_ANALYST:${reqId}`);
      let analystResp: Awaited<ReturnType<typeof callCortexAnalyst>>;
      try {
        analystResp = await callCortexAnalyst({
          question: analystQuestion,
          semanticView: baseInput.semanticView.fullyQualifiedName,
          conversationHistory: clusterHistory.length > 0 ? clusterHistory : undefined,
          signal,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[CLUSTER] Cortex Analyst call failed: ${msg}`);
        return buildAgentResult('', intent, agentName, '', undefined, null, Date.now() - startMs, lineageId, `Cortex Analyst error: ${msg}`);
      }
      console.timeEnd(`5a_CLUSTER_ANALYST:${reqId}`);

      if (analystResp.error || !analystResp.sql) {
        const errMsg = analystResp.error ?? 'Cortex Analyst did not return SQL for the clustering input query';
        console.error(`[CLUSTER] Analyst error: ${errMsg}`);
        return buildAgentResult('', intent, agentName, '', undefined, null, Date.now() - startMs, lineageId, errMsg);
      }
      inputQuery = analystResp.sql.trim().replace(/;\s*$/, '');

      // Apply the same value/format normalisations used for analyst queries so
      // known Cortex Analyst inference errors don't reach the UDTF.
      inputQuery = normalizeClusterSQL(inputQuery);

      // Cortex Analyst may return fewer features than requested, or may use a
      // column that doesn't exist on the underlying table.  Rebuild if needed.
      inputQuery = enrichClusterInputSQL(inputQuery, nFeatures);
    }

    console.log(`[CLUSTER] Input query (first 300): ${inputQuery.slice(0, 300)}`);

    // ── Step 2: Wrap input query in UDTF SELECT...TABLE()...OVER() ──────────
    const udtfSQL = buildClusterUDTFSQL(intent, inputQuery, nClusters);
    console.log(`[CLUSTER] UDTF SQL:\n${udtfSQL}`);

    // ── Step 3: Execute via Node.js driver (avoids REST API 45s async cutoff) ──
    console.time(`5b_CLUSTER_UDTF:${reqId}`);
    let udtfResult: Awaited<ReturnType<typeof executeClusteringSQL>>;
    try {
      udtfResult = await executeClusteringSQL(udtfSQL, signal);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[CLUSTER] UDTF execution failed: ${msg}`);
      return buildAgentResult('', intent, agentName, '', undefined, null, Date.now() - startMs, lineageId, `Clustering UDTF error: ${msg}`);
    }
    console.timeEnd(`5b_CLUSTER_UDTF:${reqId}`);
    console.log(`[CLUSTER] UDTF returned ${udtfResult.rowCount} rows, columns: ${udtfResult.columns.join(', ')}`);

    if (udtfResult.rowCount === 0) {
      return buildAgentResult(
        '', intent, agentName,
        'Clustering returned no results. The source data query matched no records after applying the minimum group size filter.',
        udtfSQL, null, Date.now() - startMs, lineageId,
      );
    }

    // ── Step 4: Convert rows for SegmentationArtifact ───────────────────────
    // fromResultTable() in SegmentationArtifact expects:
    //   { results: { headers: string[], rows: (string|number|null)[][] } }
    // where rows are arrays indexed by column position (not Record<name,val>).
    const headers = udtfResult.columns;

    // MODEL_METADATA is a large JSON blob (~3 KB) repeated identically across
    // every row.  fromResultTable() only reads rows[0][ciModelMeta], so keeping
    // it in all 10 000 rows bloats the SSE payload to ~30 MB and risks the JSON
    // being truncated/corrupted on the client (causing feature_weighting to be
    // silently lost).  Strip it from every row after the first.
    const metaColIdx = headers.findIndex(
      (h) => h.toUpperCase() === 'MODEL_METADATA',
    );
    const tableRows = udtfResult.rows.map((r, rowIdx) =>
      headers.map((h, colIdx) => {
        // Null-out MODEL_METADATA for all rows except row 0
        if (colIdx === metaColIdx && rowIdx > 0) return null;
        const v = r[h];
        return v === undefined ? null : (v as string | number | null);
      }),
    );
    // Key must be `rows` — that is what fromResultTable() in SegmentationArtifact reads.
    const clusterData = { results: { headers, rows: tableRows } };

    // ── Step 5: Persist to CLUSTERING_RESULTS [non-blocking] ────────────────
    // Parse MODEL_METADATA from the first row to get N_SEGMENTS_USED and algorithm.
    const firstRow = udtfResult.rows[0] ?? {};
    const rawMeta = firstRow['MODEL_METADATA'] ?? firstRow['model_metadata'];
    let parsedMeta: Record<string, unknown> = {};
    if (typeof rawMeta === 'string') {
      try { parsedMeta = JSON.parse(rawMeta) as Record<string, unknown>; } catch { /* ignore */ }
    }
const nSegmentsUsed = (parsedMeta['n_clusters'] as number | undefined) ?? nClusters;
    const algorithmLabel = (() => {
      switch (intent) {
        case 'CLUSTER_GM':          return 'GM';
        case 'CLUSTER_KMEDOIDS':    return 'KMEDOIDS';
        case 'CLUSTER_HIERARCHICAL':return 'HIERARCHICAL';
        case 'CLUSTER_DBSCAN':      return 'DBSCAN';
        default:                    return 'KMEANS';
      }
    })();

    const runId = randomUUID();
    const runTimestamp = new Date().toISOString();

    persistClusteringResults(
      udtfResult.rows,
      {
        userId: this.context.userId,
        sessionId: this.context.sessionId,
        queryId: udtfResult.queryId || undefined,
        runId,
        runTimestamp,
        algorithm: algorithmLabel,
        nSegmentsRequested: nClusters,
        nSegmentsUsed,
      },
      signal,
    ).catch((err) => {
      console.error('[CLUSTER] Persistence failed (non-fatal):', err instanceof Error ? err.message : String(err));
    });

    // ── Step 5b: Store cluster metadata in context ───────────────────────────
    // Lets downstream FORECAST / CAUSAL steps know about cluster assignments
    // without re-running the UDTF. recordIdCol is extracted from the UDTF SQL
    // (CAST(col AS VARCHAR) AS RECORD_ID pattern).
    const idColMatch = udtfSQL.match(/CAST\((\w+)\s+AS\s+VARCHAR\)\s+AS\s+RECORD_ID/i);
    const recordIdCol = idColMatch?.[1];

    // Build cluster summary (id → label + count) directly from UDTF rows so
    // downstream CAUSAL / FORECAST agents can reference segment labels without
    // issuing an additional Snowflake query.
    const clusterSummary: Record<number, { label: string; count: number }> = {};
    for (const row of udtfResult.rows) {
      const cid = Number(row['CLUSTER_ID'] ?? row['cluster_id'] ?? -1);
      if (cid < 0) continue;
      if (!clusterSummary[cid]) {
        clusterSummary[cid] = {
          label: String(row['CLUSTER_LABEL'] ?? row['cluster_label'] ?? `Cluster ${cid}`),
          count: 0,
        };
      }
      clusterSummary[cid].count++;
    }

    this.context.storeClusterMeta({
      nClusters: nSegmentsUsed,
      recordIdCol,
      algorithm: algorithmLabel,
      runId,
      clusterSummary: Object.keys(clusterSummary).length > 0 ? clusterSummary : undefined,
    });

    // ── Step 6: Build narrative from MODEL_METADATA ─────────────────────────
    const narrative = buildClusterNarrative(udtfResult.rows, nClusters);

    return buildAgentResult(
      cortexAgentRef,
      intent,
      agentName,
      narrative,
      udtfSQL,
      clusterData,
      Date.now() - startMs,
      lineageId,
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a default 2-step pipeline (ANALYST → FORECAST_AUTO) for the PIPELINE
   * intent when LLM decomposition is unavailable.
   */
  private buildDefaultPipeline(message: string) {
    const analystStepId = 'step_1_analyst';
    return {
      id: randomUUID(),
      name: 'Auto Pipeline',
      description: message.slice(0, 200),
      steps: [
        {
          stepId: analystStepId,
          intent: 'ANALYST' as AgentIntent,
          agentName: 'analyst',
          description: message.slice(0, 120),
          dependsOn: [],
          required: true,
        },
        {
          stepId: 'step_2_forecast',
          intent: 'FORECAST_AUTO' as AgentIntent,
          agentName: 'auto-forecast',
          description: 'Forecast the analyst results',
          dependsOn: [analystStepId],
          required: false,
        },
      ],
      parallelizable: false,
      createdAt: Date.now(),
      semanticViewDisplayName: this.context.semanticView.displayName,
    };
  }

  /**
   * Build the message array to send to a named Cortex Agent.
   *
   * @param currentMessage  The enriched user message to send now.
   * @param intentFamily    Optional prefix (e.g. "CAUSAL", "FORECAST").
   *                        When supplied, history turns whose `intent` belongs
   *                        to a *different* agent family are excluded.
   *                        This prevents e.g. a clustering narrative from
   *                        appearing as an "assistant" message to the causal
   *                        agent — which causes it to continue that conversation
   *                        instead of starting a fresh analysis pipeline.
   *                        ANALYST turns are always included as they provide
   *                        useful data-source context for any agent.
   */
  private buildAgentMessages(
    currentMessage: string,
    intentFamily?: string,
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const history = this.context.conversationHistory.slice(-16);
    const agentMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    for (const turn of history) {
      if (turn.role !== 'user' && turn.role !== 'assistant') continue;

      // When filtering by family, drop assistant turns from other families.
      // (User turns are always kept — they give the question context.)
      if (intentFamily && turn.role === 'assistant' && turn.intent) {
        const isAnalyst  = turn.intent === 'ANALYST';
        const isSameFamily = turn.intent.startsWith(intentFamily);
        if (!isAnalyst && !isSameFamily) continue;
      }

      agentMessages.push({ role: turn.role, content: turn.content });
    }

    agentMessages.push({ role: 'user', content: currentMessage });
    return agentMessages;
  }
}
