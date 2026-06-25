/**
 * chat-news.ts — fetch recent pharma news for chat enrichment (Phase B).
 *
 * Extracts drug/company names from the user message, queries
 * NEWS_ARTICLES_WEIGHTED, and returns a formatted news block for injection
 * into the agent prompt. Identical business logic to fetchRelevantNews() in
 * app/api/agent/report/route.ts but accepts an executeQuery adapter so it can
 * be called from route-dispatcher.ts without importing the Next.js route.
 *
 * Fails open — any error returns an empty string so the agent still runs.
 */

export interface ChatNewsItem {
  title:       string;
  url:         string;
  source:      string;
  publishedAt: string;
  summary:     string | null;
  drugNames:   string[];
  weight:      number;
}

export type ExecuteQuery = (sql: string) => Promise<{ rows: any[] }>;

const NEWS_TABLE = 'CORTEX_TESTING.PUBLIC.NEWS_ARTICLES_WEIGHTED';
const LOOKBACK_DAYS = 30;
const MAX_ITEMS = 5;

/**
 * Extract up to 5 unique drug or company names from a plain-text message.
 * Uses two heuristics:
 *   1. Pharma proper-noun sequences (2–4 capitalised words ending in Inc/Corp/…)
 *   2. Known drug-name patterns: camelCase brand names and all-caps abbreviations
 */
export function extractNewsEntities(message: string): string[] {
  const companyMatches =
    message.match(
      /\b([A-Z][a-z]+ ?){1,3}(Inc|Corp|Ltd|LLC|Pharma|Bio|Sciences|Therapeutics|Health)\b/g,
    ) ?? [];

  // Simple drug heuristic: 2+ syllable tokens starting with uppercase not at
  // sentence start (avoids grabbing ordinary sentence-opening words).
  const drugMatches =
    message.match(/(?<!\.\s)\b[A-Z][a-z]{3,}(?:mab|nib|lib|vir|zumab|tinib|ciclib)\b/g) ?? [];

  const all = [...companyMatches, ...drugMatches];
  return [...new Set(all.map((s) => s.trim()))].slice(0, 5);
}

/**
 * Build the WHERE clause extension for company/drug filtering.
 * Returns empty string when no entities found (falls back to top-weighted).
 */
export function buildNewsWhereClause(entities: string[]): string {
  if (entities.length === 0) return '';
  const conditions = entities
    .map((e) => `SOURCE_COMPANY ILIKE '%${e.replace(/'/g, "''")}%'`)
    .join(' OR ');
  return `AND (${conditions})`;
}

/**
 * Build the news SELECT query.
 */
export function buildNewsFetchSQL(entityClause: string): string {
  return `
    SELECT
        TITLE,
        CANONICAL_URL,
        SOURCE_NAME,
        PUBLISHED_AT,
        SUMMARY,
        DRUG_NAMES,
        COMPUTED_WEIGHT
    FROM ${NEWS_TABLE}
    WHERE COMPUTED_WEIGHT >= 0.05
      AND PUBLISHED_AT >= DATEADD('day', -${LOOKBACK_DAYS}, CURRENT_TIMESTAMP())
      AND IS_DUPLICATE = FALSE
      AND NVL(SOURCE_COMPANY, '') != ''
      AND UPPER(NVL(SOURCE_COMPANY, '')) NOT LIKE '%UNKNOWN%'
      AND UPPER(SOURCE_NAME) NOT LIKE '%SEC%'
      AND UPPER(SOURCE_NAME) NOT LIKE '%EDGAR%'
      ${entityClause}
    ORDER BY COMPUTED_WEIGHT DESC
    LIMIT ${MAX_ITEMS}
  `.trim();
}

/**
 * Map raw Snowflake rows to typed ChatNewsItem objects.
 * Handles VARIANT DRUG_NAMES arriving as a JSON string (Rule 7 in CLAUDE.md).
 */
export function mapNewsRows(rows: any[]): ChatNewsItem[] {
  return rows.map((r) => {
    let drugNames: string[] = [];
    const raw = r.DRUG_NAMES;
    if (Array.isArray(raw)) {
      drugNames = raw as string[];
    } else if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        drugNames = Array.isArray(parsed) ? parsed : [];
      } catch {
        drugNames = [];
      }
    }
    return {
      title:       String(r.TITLE ?? ''),
      url:         String(r.CANONICAL_URL ?? ''),
      source:      String(r.SOURCE_NAME ?? ''),
      publishedAt: String(r.PUBLISHED_AT ?? ''),
      summary:     r.SUMMARY ? String(r.SUMMARY) : null,
      drugNames,
      weight:      Number(r.COMPUTED_WEIGHT ?? 0),
    };
  });
}

/**
 * Format a list of news items as a plain-text block for agent injection.
 * Returns empty string when no items.
 */
export function buildNewsContextBlock(items: ChatNewsItem[]): string {
  if (items.length === 0) return '';

  const lines = [
    '=== RECENT PHARMA NEWS ===',
    `${items.length} recent article${items.length > 1 ? 's' : ''} relevant to this query (last ${LOOKBACK_DAYS} days):`,
    '',
  ];

  items.forEach((item, i) => {
    lines.push(`[News ${i + 1}] ${item.title}`);
    lines.push(`Source: ${item.source} | Published: ${item.publishedAt.slice(0, 10)}`);
    if (item.drugNames.length) lines.push(`Drugs: ${item.drugNames.join(', ')}`);
    if (item.summary) lines.push(`Summary: ${item.summary.slice(0, 200)}${item.summary.length > 200 ? '…' : ''}`);
    lines.push('');
  });

  lines.push('INSTRUCTION: When relevant, reference these news items in your answer using [News N] citations.');
  lines.push('=== END RECENT PHARMA NEWS ===');

  return lines.join('\n');
}

/**
 * Fetch relevant pharma news for a chat message.
 * Returns a formatted block string ready for appending to the enriched prompt.
 * Fails open — returns '' on any error.
 */
export async function fetchChatNews(
  message: string,
  executeQuery: ExecuteQuery,
): Promise<string> {
  try {
    const entities = extractNewsEntities(message);
    const entityClause = buildNewsWhereClause(entities);
    const sql = buildNewsFetchSQL(entityClause);

    const result = await executeQuery(sql);

    // If entity filter returned nothing, retry without it
    const rows =
      result.rows.length === 0 && entityClause
        ? (await executeQuery(buildNewsFetchSQL(''))).rows
        : result.rows;

    const items = mapNewsRows(rows);
    return buildNewsContextBlock(items);
  } catch (err) {
    console.warn(
      '[NEWS_ENRICH] News fetch failed (continuing without):',
      err instanceof Error ? err.message : String(err),
    );
    return '';
  }
}
