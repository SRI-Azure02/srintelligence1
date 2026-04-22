import { NextRequest } from "next/server";
import { normalizeCortexSQL } from '@/src/lib/snowflake/sql-normalizer';

// ── Snowflake config ──────────────────────────────────────────────────────────
const ACCOUNT   = process.env.SNOWFLAKE_ACCOUNT!;   // e.g. hj98757.us-east-1
const PAT       = process.env.SNOWFLAKE_PAT!;
const WAREHOUSE = process.env.SNOWFLAKE_WAREHOUSE!;
const DATABASE  = process.env.SNOWFLAKE_DATABASE ?? 'CORTEX_TESTING';
const ROLE      = process.env.SNOWFLAKE_ROLE     ?? 'APP_SVC_ROLE';
// SNOWFLAKE_SEMANTIC_VIEW lets you override the full view path without touching DATABASE/SCHEMA.
// Strip any accidental DATABASE.SCHEMA prefix in SNOWFLAKE_SCHEMA (e.g. "CORTEX_TESTING.ML" → "ML")
const _SCHEMA_RAW = process.env.SNOWFLAKE_SCHEMA ?? 'PUBLIC';
const SCHEMA      = _SCHEMA_RAW.includes('.') ? _SCHEMA_RAW.split('.').pop()! : _SCHEMA_RAW;
const BASE_URL  = `https://${ACCOUNT}.snowflakecomputing.com`;

// Prefer an explicit full override; fall back to DATABASE.SCHEMA.CORTEX_TESTCASE
const SEMANTIC_VIEW =
  process.env.SNOWFLAKE_SEMANTIC_VIEW ?? `${DATABASE}.${SCHEMA}.CORTEX_TESTCASE`;

// ── Shared headers ────────────────────────────────────────────────────────────
function sfHeaders(includeRole = true) {
  return {
    Authorization: `Bearer ${PAT}`,
    "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "SRIntelligence/1.0",
    ...(includeRole ? { "X-Snowflake-Role": ROLE } : {}),
  };
}

// ── Cortex Analyst types ──────────────────────────────────────────────────────
interface CortexMessage {
  role: "user" | "analyst";
  content: Array<{ type: string; text?: string; statement?: string; suggestions?: string[] }>;
}

// ── Call Cortex Analyst ───────────────────────────────────────────────────────
async function callCortexAnalyst(messages: CortexMessage[]) {
  const res = await fetch(`${BASE_URL}/api/v2/cortex/analyst/message`, {
    method: "POST",
    headers: sfHeaders(),
    body: JSON.stringify({
      messages,
      semantic_view: SEMANTIC_VIEW,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cortex Analyst ${res.status}: ${body}`);
  }
  return res.json();
}

// ── Execute SQL via Snowflake SQL API ─────────────────────────────────────────
async function executeSQL(sql: string): Promise<{ headers: string[]; rows: (string | number)[][] }> {
  const res = await fetch(`${BASE_URL}/api/v2/statements`, {
    method: "POST",
    // Role is passed in the request body for SQL API, not as a header
    headers: sfHeaders(false),
    body: JSON.stringify({
      statement: sql,
      timeout: 60,
      database: DATABASE,
      schema: SCHEMA,
      warehouse: WAREHOUSE,
      role: ROLE,
      parameters: { MULTI_STATEMENT_COUNT: "0" },
    }),
  });

  // 200 = sync success, 202 = async (need to poll)
  if (res.status === 202) {
    const init = await res.json();
    return pollSQL(init.statementHandle as string);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SQL API ${res.status}: ${body}`);
  }

  const data = await res.json();
  return parseSQLResult(data);
}

async function pollSQL(handle: string): Promise<{ headers: string[]; rows: (string | number)[][] }> {
  const url = `${BASE_URL}/api/v2/statements/${handle}`;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await fetch(url, { headers: sfHeaders() });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Poll ${res.status}: ${body}`);
    }
    const data = await res.json();
    if (data.status === "success") return parseSQLResult(data);
    if (data.status === "failed") throw new Error(data.message ?? "SQL failed");
  }
  throw new Error("SQL query timed out after 30 seconds");
}

function parseSQLResult(data: {
  resultSetMetaData?: { rowType?: Array<{ name: string }> };
  data?: (string | number)[][];
}): { headers: string[]; rows: (string | number)[][] } {
  const cols = data.resultSetMetaData?.rowType ?? [];
  const rows = data.data ?? [];
  const headers = cols.map((c) => c.name);
  // Snowflake returns everything as strings; cast numeric-looking cells to numbers
  const typedRows = rows.map((row) =>
    row.map((cell) => {
      if (cell === null || cell === undefined) return "";
      const n = Number(cell);
      return !isNaN(n) && cell !== "" ? n : cell;
    })
  );
  return { headers, rows: typedRows };
}

// ── Derive chart data from a table ───────────────────────────────────────────
function deriveChart(
  tableData: { headers: string[]; rows: (string | number)[][] }
): Array<{ name: string; value: number }> | null {
  const { headers, rows } = tableData;
  if (!rows.length || headers.length < 2) return null;

  const firstHeader = headers[0] ?? '';

  // ── Suppress: entity / person lists ──────────────────────────────────────
  // These produce meaningless high-cardinality bar charts rather than insights.
  const isEntityList = /first.?name|last.?name|physician|patient|doctor|hcp|npi|prescriber|provider/i.test(firstHeader);
  if (isEntityList) return null;

  // ── Suppress: geographic / demographic aggregations ───────────────────────
  // Region, state, specialty, plan-type breakdowns are best shown as tables.
  // A bar chart only makes sense here when the user explicitly asks for one;
  // auto-generating it produces an unexpected chart that wasn't requested.
  const isGeographicOrDemographic = /region|state|territory|country|geography|specialty|plan.?type|payer|channel|segment|tier/i.test(firstHeader);
  if (isGeographicOrDemographic) return null;

  // ── Suppress: large non-temporal dumps ───────────────────────────────────
  // High row-count results without a time column are raw entity dumps, not
  // summaries suitable for charting.
  const hasTemporalCol = headers.some((h) =>
    /date|month|week|year|quarter|period|time/i.test(h)
  );
  if (rows.length > 30 && !hasTemporalCol) return null;

  // ── Suppress: single-row results ─────────────────────────────────────────
  // A single data point is not a meaningful chart.
  if (rows.length === 1) return null;

  // First column = label, first numeric column = value
  const valueIdx = headers.findIndex(
    (_, i) => i > 0 && rows.some((r) => typeof r[i] === "number")
  );
  if (valueIdx < 0) return null;

  return rows.slice(0, 25).map((row) => ({
    name: String(row[0]),
    value: typeof row[valueIdx] === "number" ? (row[valueIdx] as number) : 0,
  }));
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      query: string;
      history?: CortexMessage[];
    };
    const { query, history = [] } = body;

    if (!query?.trim()) {
      return Response.json({ error: "query is required" }, { status: 400 });
    }

    const t0 = Date.now();

    // Build full conversation history for Cortex Analyst
    const messages: CortexMessage[] = [
      ...history,
      { role: "user", content: [{ type: "text", text: query }] },
    ];

    // ── Step 1: get SQL from Cortex Analyst ──────────────────────────────────
    let analystResponse: {
      message: { role: string; content: Array<{ type: string; text?: string; statement?: string; suggestions?: string[] }> };
      request_id?: string;
      warnings?: string[];
    };

    try {
      analystResponse = await callCortexAnalyst(messages);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json({ error: `Cortex Analyst error: ${msg}` }, { status: 502 });
    }

    const content = analystResponse.message?.content ?? [];
    const textBlock       = content.find((c) => c.type === "text");
    const sqlBlock        = content.find((c) => c.type === "sql");
    const suggestionsBlock = content.find((c) => c.type === "suggestions");

    // ── Step 2: normalise then execute the SQL if present ───────────────────
    let tableData: { headers: string[]; rows: (string | number)[][] } | null = null;
    let chartData: Array<{ name: string; value: number }> | null = null;
    let sqlError: string | null = null;

    const rawSql = sqlBlock?.statement ?? null;
    const normalisedSql = rawSql ? normalizeCortexSQL(rawSql) : null;
    if (normalisedSql && normalisedSql !== rawSql) {
      console.log('[/api/cortex] SQL normalised.\nBefore:', rawSql);
      console.log('[/api/cortex] After:', normalisedSql);
    }

    if (normalisedSql) {
      try {
        tableData = await executeSQL(normalisedSql);
        chartData = deriveChart(tableData);
      } catch (err: unknown) {
        sqlError = err instanceof Error ? err.message : String(err);
        console.error("[/api/cortex] SQL execution error:", sqlError);
      }
    }

    const latency = ((Date.now() - t0) / 1000).toFixed(1) + "s";

    // The analyst message to append to history for next turn
    const analystHistoryMessage: CortexMessage = analystResponse.message as CortexMessage;

    return Response.json({
      content: textBlock?.text ?? "Analysis complete.",
      sql: normalisedSql ?? null,
      sqlError,
      tableData,
      chartData,
      suggestedFollowups: suggestionsBlock?.suggestions ?? [],
      latency,
      // Return the full analyst message so the client can append it to history
      analystMessage: analystHistoryMessage,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/cortex] Unhandled error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
