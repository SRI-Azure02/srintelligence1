/**
 * GET  /api/news/sources — list all sources with health stats
 * POST /api/news/sources — add a new source
 */

import { executeSQL } from '../../../../src/lib/snowflake/sql-api';

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(): Promise<Response> {
  try {
    const result = await executeSQL(`
      SELECT
          s.SOURCE_ID,
          s.SOURCE_NAME,
          s.BASE_URL,
          s.CATEGORY,
          s.COMPANY,
          s.FETCH_METHOD,
          s.PLATFORM_TYPE,
          s.IS_ACTIVE,
          s.IS_DELETED,
          s.BASE_WEIGHT,
          s.DECAY_LAMBDA,
          s.SCRAPE_INTERVAL_MIN,
          s.LAST_SCRAPED_AT,
          s.ADDED_BY,
          s.DELETED_BY,
          s.DELETED_AT,
          s.DELETE_REASON,
          s.CREATED_AT,
          COUNT(a.ARTICLE_ID)   AS ARTICLE_COUNT,
          MAX(a.PUBLISHED_AT)   AS LATEST_ARTICLE_AT
      FROM  CORTEX_TESTING.PUBLIC.NEWS_SOURCES s
      LEFT JOIN CORTEX_TESTING.PUBLIC.NEWS_ARTICLES a
             ON a.SOURCE_ID    = s.SOURCE_ID
            AND a.IS_DUPLICATE = FALSE
      GROUP BY
          s.SOURCE_ID, s.SOURCE_NAME, s.BASE_URL, s.CATEGORY, s.COMPANY,
          s.FETCH_METHOD, s.PLATFORM_TYPE, s.IS_ACTIVE, s.IS_DELETED,
          s.BASE_WEIGHT, s.DECAY_LAMBDA, s.SCRAPE_INTERVAL_MIN, s.LAST_SCRAPED_AT,
          s.ADDED_BY, s.DELETED_BY, s.DELETED_AT, s.DELETE_REASON, s.CREATED_AT
      ORDER BY s.IS_DELETED ASC, s.CATEGORY, s.COMPANY NULLS LAST, s.SOURCE_NAME
    `);

    return Response.json({ sources: result.rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

const VALID_CATEGORIES  = ['industry_news', 'ir', 'media', 'regulatory', 'filings'] as const;
const VALID_METHODS     = ['rss', 'html'] as const;
const VALID_INTERVALS   = [60, 120, 240, 480, 1440] as const;

type Category = typeof VALID_CATEGORIES[number];
type Method   = typeof VALID_METHODS[number];

export async function POST(request: Request): Promise<Response> {
  const userId = request.headers.get('x-user-id') ?? 'anonymous';

  let body: {
    sourceName:   string;
    baseUrl:      string;
    category:     Category;
    company?:     string;
    targetDrugs?: string;
    fetchMethod:  Method;
    rssUrl?:      string;
    listingUrl?:  string;
    intervalMin?: number;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validation
  if (!body.sourceName?.trim())
    return Response.json({ error: 'sourceName is required' }, { status: 400 });
  if (!body.baseUrl?.trim())
    return Response.json({ error: 'baseUrl is required' }, { status: 400 });
  if (!(VALID_CATEGORIES as readonly string[]).includes(body.category))
    return Response.json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` }, { status: 400 });
  if (!(VALID_METHODS as readonly string[]).includes(body.fetchMethod))
    return Response.json({ error: `fetchMethod must be one of: ${VALID_METHODS.join(', ')}` }, { status: 400 });
  if (body.fetchMethod === 'rss' && !body.rssUrl?.trim())
    return Response.json({ error: 'rssUrl is required for RSS sources' }, { status: 400 });
  if (body.fetchMethod === 'html' && !body.listingUrl?.trim())
    return Response.json({ error: 'listingUrl is required for HTML sources' }, { status: 400 });

  const escape    = (s: string) => s.replace(/'/g, "''");
  const sourceId  = body.sourceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

  const intervalMin = VALID_INTERVALS.includes(body.intervalMin as typeof VALID_INTERVALS[number])
    ? body.intervalMin!
    : body.fetchMethod === 'rss' ? 60 : 240;

  // Parse optional drug focus list
  const targetDrugsArr = body.targetDrugs
    ? body.targetDrugs.split(',').map((d) => d.trim()).filter(Boolean)
    : [];
  const drugExtra = targetDrugsArr.length ? { targetDrugs: targetDrugsArr } : {};

  // Build fetch config JSON
  const fetchConfig = body.fetchMethod === 'rss'
    ? JSON.stringify({ rssUrl: body.rssUrl!.trim(), ...drugExtra })
    : JSON.stringify({
        listingUrl: body.listingUrl!.trim(),
        selectors: {
          list:    'article, [class*="news-item"], [class*="press-release"]',
          title:   'h2, h3, h4',
          link:    'a',
          date:    'time, .date, [data-date]',
          summary: 'p',
        },
        ...drugExtra,
      });

  const company = body.company?.trim()
    ? `'${escape(body.company.trim())}'`
    : 'NULL';

  try {
    // Check for duplicate source_id
    const existing = await executeSQL(`
      SELECT SOURCE_ID FROM CORTEX_TESTING.PUBLIC.NEWS_SOURCES
      WHERE SOURCE_ID = '${escape(sourceId)}'
      LIMIT 1
    `);

    if (existing.rows.length > 0) {
      return Response.json(
        { error: `A source with ID "${sourceId}" already exists. Try a slightly different name.` },
        { status: 409 },
      );
    }

    await executeSQL(`
      INSERT INTO CORTEX_TESTING.PUBLIC.NEWS_SOURCES
          (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY,
           FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE,
           IS_ACTIVE, IS_DELETED, BASE_WEIGHT, DECAY_LAMBDA,
           SCRAPE_INTERVAL_MIN, ADDED_BY)
      VALUES (
          '${escape(sourceId)}',
          '${escape(body.sourceName.trim())}',
          '${escape(body.baseUrl.trim())}',
          '${body.category}',
          ${company},
          '${body.fetchMethod}',
          PARSE_JSON('${escape(fetchConfig)}'),
          'generic',
          TRUE,
          FALSE,
          1.0,
          ${body.fetchMethod === 'rss' ? 0.08 : 0.06},
          ${intervalMin},
          '${escape(userId)}'
      )
    `);

    return Response.json({ success: true, sourceId }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
