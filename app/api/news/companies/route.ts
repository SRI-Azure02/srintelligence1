import { executeSQL } from '../../../../src/lib/snowflake/sql-api';

export async function GET(): Promise<Response> {
  try {
    const result = await executeSQL(`
      SELECT DISTINCT COMPANY
      FROM   CORTEX_TESTING.PUBLIC.NEWS_SOURCES
      WHERE  NVL(IS_DELETED, FALSE) = FALSE
        AND  NVL(IS_ACTIVE,  FALSE) = TRUE
        AND  COMPANY IS NOT NULL
      ORDER BY COMPANY
    `);
    return Response.json({ companies: result.rows.map((r) => r.COMPANY as string) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
