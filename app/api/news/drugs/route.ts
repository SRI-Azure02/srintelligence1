/**
 * GET /api/news/drugs
 *
 * Returns a ranked list of distinct drug names extracted from NEWS_ARTICLES,
 * ordered by article count descending. Used to populate the drug-filter picker.
 *
 * Query params:
 *   limit   number  default 100, max 500
 *   search  string  partial match on drug name
 */

import { executeSQL } from '../../../../src/lib/snowflake/sql-api';

export async function GET(request: Request): Promise<Response> {
  const url    = new URL(request.url);
  const limit  = Math.min(Number(url.searchParams.get('limit') ?? 100), 500);
  const search = url.searchParams.get('search')?.trim() ?? '';
  const escape = (s: string) => s.replace(/'/g, "''");

  const searchClause = search
    ? `AND UPPER(d.value::STRING) LIKE UPPER('%${escape(search)}%')`
    : '';

  try {
    const result = await executeSQL(`
      SELECT
          d.value::STRING                 AS DRUG_NAME,
          COUNT(DISTINCT a.ARTICLE_ID)    AS ARTICLE_COUNT,
          MAX(a.PUBLISHED_AT)             AS LATEST_AT
      FROM CORTEX_TESTING.PUBLIC.NEWS_ARTICLES a,
           LATERAL FLATTEN(input => a.DRUG_NAMES) d
      WHERE a.IS_DUPLICATE = FALSE
        AND d.value::STRING <> ''
        ${searchClause}
      GROUP BY d.value::STRING
      ORDER BY ARTICLE_COUNT DESC, DRUG_NAME ASC
      LIMIT ${limit}
    `);

    return Response.json({ drugs: result.rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
