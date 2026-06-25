import { executeSQL } from '../snowflake/sql-api';
import type { SourceConfig } from './types';

// Snowflake VARIANT columns arrive as a JSON string from the SQL API
function parseVariant(raw: unknown): unknown {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw ?? {};
}

/**
 * Loads all active sources from NEWS_SOURCES.
 * Calling code should cache this result for the duration of a scrape run.
 */
export async function loadActiveSources(): Promise<SourceConfig[]> {
  const result = await executeSQL(`
    SELECT
        SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY,
        FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE,
        BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN, LAST_SCRAPED_AT
    FROM CORTEX_TESTING.PUBLIC.NEWS_SOURCES
    WHERE IS_ACTIVE = TRUE AND NVL(IS_DELETED, FALSE) = FALSE
    ORDER BY SOURCE_ID
  `);

  return result.rows.map((row) => ({
    sourceId:          row.SOURCE_ID          as string,
    sourceName:        row.SOURCE_NAME         as string,
    baseUrl:           row.BASE_URL            as string,
    category:          row.CATEGORY            as SourceConfig['category'],
    company:           (row.COMPANY ?? null)   as string | null,
    fetchMethod:       row.FETCH_METHOD        as SourceConfig['fetchMethod'],
    fetchConfig:       parseVariant(row.FETCH_CONFIG) as SourceConfig['fetchConfig'],
    platformType:      (row.PLATFORM_TYPE ?? null) as SourceConfig['platformType'],
    isActive:          Boolean(row.IS_ACTIVE),
    baseWeight:        Number(row.BASE_WEIGHT),
    decayLambda:       Number(row.DECAY_LAMBDA),
    scrapeIntervalMin: Number(row.SCRAPE_INTERVAL_MIN),
    lastScrapedAt:     row.LAST_SCRAPED_AT
      ? new Date(row.LAST_SCRAPED_AT as string)
      : null,
  }));
}

/**
 * Returns sources whose LAST_SCRAPED_AT is older than their
 * SCRAPE_INTERVAL_MIN, or have never been scraped.
 */
export async function loadSourcesDue(): Promise<SourceConfig[]> {
  const result = await executeSQL(`
    SELECT
        SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY,
        FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE,
        BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN, LAST_SCRAPED_AT
    FROM CORTEX_TESTING.PUBLIC.NEWS_SOURCES
    WHERE IS_ACTIVE = TRUE AND NVL(IS_DELETED, FALSE) = FALSE
      AND (
            LAST_SCRAPED_AT IS NULL
         OR LAST_SCRAPED_AT < DATEADD('minute', -SCRAPE_INTERVAL_MIN, CURRENT_TIMESTAMP())
          )
    ORDER BY COALESCE(LAST_SCRAPED_AT, '1970-01-01') ASC
  `);

  return result.rows.map((row) => ({
    sourceId:          row.SOURCE_ID            as string,
    sourceName:        row.SOURCE_NAME           as string,
    baseUrl:           row.BASE_URL              as string,
    category:          row.CATEGORY              as SourceConfig['category'],
    company:           (row.COMPANY ?? null)     as string | null,
    fetchMethod:       row.FETCH_METHOD          as SourceConfig['fetchMethod'],
    fetchConfig:       parseVariant(row.FETCH_CONFIG) as SourceConfig['fetchConfig'],
    platformType:      (row.PLATFORM_TYPE ?? null) as SourceConfig['platformType'],
    isActive:          Boolean(row.IS_ACTIVE),
    baseWeight:        Number(row.BASE_WEIGHT),
    decayLambda:       Number(row.DECAY_LAMBDA),
    scrapeIntervalMin: Number(row.SCRAPE_INTERVAL_MIN),
    lastScrapedAt:     row.LAST_SCRAPED_AT
      ? new Date(row.LAST_SCRAPED_AT as string)
      : null,
  }));
}
