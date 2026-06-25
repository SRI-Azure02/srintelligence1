/**
 * GET /api/news/health
 *
 * Returns scrape health for every active source plus system-level summary.
 * Used by the Health tab in the News Sources dashboard.
 *
 * Response shape:
 *   {
 *     summary: { activeSources, overdueCount, articlesTotal, articles24h, lastCronAt, lastManualAt }
 *     sources: SourceHealth[]
 *   }
 */

import { executeSQL } from '../../../../src/lib/snowflake/sql-api';

export async function GET(): Promise<Response> {
  try {
    const [sourcesResult, summaryResult, recentRunsResult] = await Promise.all([

      // Per-source health
      executeSQL(`
        SELECT
            s.SOURCE_ID,
            s.SOURCE_NAME,
            s.CATEGORY,
            s.COMPANY,
            s.IS_ACTIVE,
            s.SCRAPE_INTERVAL_MIN,
            s.LAST_SCRAPED_AT,
            DATEDIFF('minute', s.LAST_SCRAPED_AT, CURRENT_TIMESTAMP())          AS MINS_SINCE_SCRAPE,
            CASE
                WHEN s.LAST_SCRAPED_AT IS NULL THEN TRUE
                WHEN DATEDIFF('minute', s.LAST_SCRAPED_AT, CURRENT_TIMESTAMP())
                     > s.SCRAPE_INTERVAL_MIN * 2.5 THEN TRUE
                ELSE FALSE
            END                                                                  AS IS_OVERDUE,
            COUNT(DISTINCT CASE
                WHEN a.SCRAPED_AT >= DATEADD('hour', -24, CURRENT_TIMESTAMP())
                THEN a.ARTICLE_ID END)                                           AS ARTICLES_24H,
            COUNT(DISTINCT CASE
                WHEN a.SCRAPED_AT >= DATEADD('day',  -7,  CURRENT_TIMESTAMP())
                THEN a.ARTICLE_ID END)                                           AS ARTICLES_7D,
            COUNT(DISTINCT a.ARTICLE_ID)                                         AS ARTICLES_TOTAL,
            -- Last run stats from logs
            MAX(l.RUN_AT)                                                        AS LAST_RUN_AT,
            MAX(CASE WHEN l.RUN_AT = (
                SELECT MAX(RUN_AT) FROM CORTEX_TESTING.PUBLIC.NEWS_SCRAPE_LOGS ll
                WHERE ll.SOURCE_ID = s.SOURCE_ID
            ) THEN l.RUN_SOURCE END)                                             AS LAST_RUN_SOURCE,
            SUM(CASE WHEN l.RUN_AT >= DATEADD('day', -7, CURRENT_TIMESTAMP())
                THEN l.ERROR_COUNT ELSE 0 END)                                   AS ERRORS_7D,
            SUM(CASE WHEN l.RUN_AT >= DATEADD('day', -7, CURRENT_TIMESTAMP())
                THEN l.INSERTED ELSE 0 END)                                      AS INSERTED_7D,
            COUNT(DISTINCT CASE WHEN l.RUN_AT >= DATEADD('day', -7, CURRENT_TIMESTAMP())
                THEN l.LOG_ID END)                                               AS RUNS_7D
        FROM  CORTEX_TESTING.PUBLIC.NEWS_SOURCES s
        LEFT JOIN CORTEX_TESTING.PUBLIC.NEWS_ARTICLES a
               ON a.SOURCE_ID = s.SOURCE_ID AND a.IS_DUPLICATE = FALSE
        LEFT JOIN CORTEX_TESTING.PUBLIC.NEWS_SCRAPE_LOGS l
               ON l.SOURCE_ID = s.SOURCE_ID
        WHERE s.IS_DELETED = FALSE
        GROUP BY
            s.SOURCE_ID, s.SOURCE_NAME, s.CATEGORY, s.COMPANY,
            s.IS_ACTIVE, s.SCRAPE_INTERVAL_MIN, s.LAST_SCRAPED_AT
        ORDER BY IS_OVERDUE DESC, MINS_SINCE_SCRAPE DESC NULLS FIRST
      `),

      // System-level summary
      executeSQL(`
        SELECT
            COUNT(DISTINCT CASE WHEN IS_ACTIVE = TRUE  AND IS_DELETED = FALSE THEN SOURCE_ID END) AS ACTIVE_SOURCES,
            COUNT(DISTINCT CASE WHEN IS_DELETED = FALSE THEN SOURCE_ID END)                        AS TOTAL_SOURCES
        FROM CORTEX_TESTING.PUBLIC.NEWS_SOURCES
      `),

      // Recent cron and manual run timestamps
      executeSQL(`
        SELECT RUN_SOURCE, MAX(RUN_AT) AS LAST_RUN
        FROM   CORTEX_TESTING.PUBLIC.NEWS_SCRAPE_LOGS
        WHERE  RUN_AT >= DATEADD('day', -7, CURRENT_TIMESTAMP())
        GROUP BY RUN_SOURCE
      `),
    ]);

    // Also get total + 24h article counts
    const articleStats = await executeSQL(`
      SELECT
          COUNT(*)                                                          AS TOTAL,
          COUNT(CASE WHEN SCRAPED_AT >= DATEADD('hour', -24, CURRENT_TIMESTAMP()) THEN 1 END) AS LAST_24H
      FROM CORTEX_TESTING.PUBLIC.NEWS_ARTICLES
      WHERE IS_DUPLICATE = FALSE
    `);

    const sys           = summaryResult.rows[0]  ?? {};
    const artStats      = articleStats.rows[0]   ?? {};
    const cronRun       = recentRunsResult.rows.find((r) => r.RUN_SOURCE === 'cron');
    const manualRun     = recentRunsResult.rows.find((r) => r.RUN_SOURCE === 'manual');

    const isTrue = (v: unknown) => v === true || v === "true";
    const sources       = sourcesResult.rows;
    const overdueCount  = sources.filter((s) => isTrue(s.IS_OVERDUE)).length;

    return Response.json({
      summary: {
        activeSources: Number(sys.ACTIVE_SOURCES ?? 0),
        totalSources:  Number(sys.TOTAL_SOURCES  ?? 0),
        overdueCount,
        articlesTotal: Number(artStats.TOTAL   ?? 0),
        articles24h:   Number(artStats.LAST_24H ?? 0),
        lastCronAt:    cronRun?.LAST_RUN   ?? null,
        lastManualAt:  manualRun?.LAST_RUN ?? null,
      },
      sources,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
