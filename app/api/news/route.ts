/**
 * GET /api/news
 *
 * Query params (all filter params accept comma-separated lists for multi-select):
 *   limit        number   default 50, max 200
 *   offset       number   default 0
 *   categories   string   comma-separated SOURCE_CATEGORY values
 *   companies    string   comma-separated SOURCE_COMPANY values (exact match)
 *   articleTypes string   comma-separated ARTICLE_TYPE values
 *   search       string   partial match on TITLE or SUMMARY
 *   drugs        string   comma-separated drug names in DRUG_NAMES array
 *   minWeight    number   default 0.01
 *   daysBack     number   default 90, max 365
 *   sortBy       string   newest|oldest|weight|source|drug_count|doctype
 */

import { executeSQL } from '../../../src/lib/snowflake/sql-api';

export async function GET(request: Request): Promise<Response> {
  const url    = new URL(request.url);
  const params = url.searchParams;

  const limit      = Math.min(Number(params.get('limit')  ?? 50),  200);
  const offset     = Math.max(Number(params.get('offset') ?? 0),   0);
  const sortBy     = params.get('sortBy')    ?? 'newest';
  const minWeight  = Number(params.get('minWeight') ?? 0.01);
  const daysBack   = Math.min(Number(params.get('daysBack') ?? 90), 365);
  const search     = params.get('search') ?? '';

  const categories  = splitParam(params.get('categories'));
  const companies   = splitParam(params.get('companies'));
  const articleTypes = splitParam(params.get('articleTypes'));
  const drugs       = splitParam(params.get('drugs'));

  const ORDER_BY: Record<string, string> = {
    newest:    'PUBLISHED_AT DESC',
    oldest:    'PUBLISHED_AT ASC',
    weight:    'COMPUTED_WEIGHT DESC',
    source:    'SOURCE_NAME ASC, COMPUTED_WEIGHT DESC',
    drug_count:'ARRAY_SIZE(DRUG_NAMES) DESC, COMPUTED_WEIGHT DESC',
    doctype:   'ARTICLE_TYPE ASC, COMPUTED_WEIGHT DESC',
  };
  const orderClause = ORDER_BY[sortBy] ?? ORDER_BY.newest;

  const conditions: string[] = [
    `COMPUTED_WEIGHT >= ${minWeight}`,
    `PUBLISHED_AT >= DATEADD('day', -${daysBack}, CURRENT_TIMESTAMP())`,
  ];

  if (categories.length)   conditions.push(`SOURCE_CATEGORY IN (${inList(categories)})`);
  if (companies.length)    conditions.push(`SOURCE_COMPANY  IN (${inList(companies)})`);
  if (articleTypes.length) conditions.push(`ARTICLE_TYPE    IN (${inList(articleTypes)})`);
  if (search)              conditions.push(`(TITLE ILIKE '%${esc(search)}%' OR SUMMARY ILIKE '%${esc(search)}%')`);
  if (drugs.length === 1)  conditions.push(`ARRAY_CONTAINS('${esc(drugs[0])}'::VARIANT, DRUG_NAMES)`);
  if (drugs.length > 1)    conditions.push(`(${drugs.map((d) => `ARRAY_CONTAINS('${esc(d)}'::VARIANT, DRUG_NAMES)`).join(' OR ')})`);

  const where = conditions.join(' AND ');

  try {
    const [result, countResult] = await Promise.all([
      executeSQL(`
        SELECT
            ARTICLE_ID, SOURCE_ID, SOURCE_NAME, SOURCE_COMPANY, SOURCE_CATEGORY,
            TITLE, SUMMARY, CANONICAL_URL, AUTHOR, PUBLISHED_AT, SCRAPED_AT,
            ARTICLE_TYPE, FILING_TYPE, TAGS, COMPANIES_MENTIONED, DRUG_NAMES,
            FEEDBACK_SCORE, FEEDBACK_MULTIPLIER, AGE_DAYS, COMPUTED_WEIGHT
        FROM  CORTEX_TESTING.PUBLIC.NEWS_ARTICLES_WEIGHTED
        WHERE ${where}
        ORDER BY ${orderClause}
        LIMIT  ${limit}
        OFFSET ${offset}
      `),
      executeSQL(`SELECT COUNT(*) AS TOTAL FROM CORTEX_TESTING.PUBLIC.NEWS_ARTICLES_WEIGHTED WHERE ${where}`),
    ]);

    const total    = Number(countResult.rows[0]?.TOTAL ?? 0);
    const articles = result.rows.map((row) => ({
      ...row,
      TAGS:                parseArr(row.TAGS),
      DRUG_NAMES:          parseArr(row.DRUG_NAMES),
      COMPANIES_MENTIONED: parseArr(row.COMPANIES_MENTIONED),
      COMPUTED_WEIGHT:     Number(row.COMPUTED_WEIGHT ?? 0),
      AGE_DAYS:            Number(row.AGE_DAYS        ?? 0),
      FEEDBACK_SCORE:      Number(row.FEEDBACK_SCORE  ?? 0),
    }));

    return Response.json({ articles, pagination: { total, limit, offset, hasMore: offset + limit < total } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

function splitParam(v: string | null): string[] {
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

function inList(vals: string[]): string {
  return vals.map((v) => `'${esc(v)}'`).join(', ');
}

function parseArr(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}
