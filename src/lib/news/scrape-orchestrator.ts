/**
 * Scrape orchestrator.
 *
 * Flow per source:
 *   1. Fetch raw articles via the appropriate fetcher
 *   2. Compute CONTENT_HASH for each candidate URL
 *   3. Batch-check NEWS_KNOWN_URLS — filter to new-only (fast narrow table)
 *   4. Extract tags / companies / drug names via Claude Haiku (batch prompt)
 *   5. INSERT new rows into NEWS_ARTICLES + NEWS_KNOWN_URLS
 *   6. UPDATE NEWS_SOURCES.LAST_SCRAPED_AT
 *
 * The UNIQUE constraint on NEWS_ARTICLES.CONTENT_HASH is the final safety net
 * against races — the orchestrator pre-filters but never relies solely on it.
 */

import Anthropic from '@anthropic-ai/sdk';
import { executeSQL } from '../snowflake/sql-api';
import { computeContentHash } from './content-hash';
import { fetchRSS }      from './fetchers/rss-fetcher';
import { fetchAPI }      from './fetchers/api-fetcher';
import { fetchHTML }     from './fetchers/html-fetcher';
import { fetchQ4 }       from './fetchers/q4-fetcher';
import { fetchIntrado }  from './fetchers/intrado-fetcher';
import { fetchNewsroom } from './fetchers/newsroom-fetcher';
import type { SourceConfig, RawArticle, ScrapeResult, HtmlFetchConfig, ApiFetchConfig, RssFetchConfig } from './types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Public entry point ────────────────────────────────────────────────────────

const CONCURRENCY = 6; // concurrent source scrapes

export async function orchestrateScrape(
  sources:   SourceConfig[],
  runSource: 'cron' | 'manual' = 'cron',
): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = new Array(sources.length);
  let idx = 0;

  const worker = async () => {
    while (idx < sources.length) {
      const i      = idx++;
      const source = sources[i];
      const startedAt = Date.now();
      const result    = await scrapeSource(source);
      results[i]      = result;
      logScrapeRun(source.sourceId, result, Date.now() - startedAt, runSource).catch(() => {});
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
}

async function logScrapeRun(
  sourceId:   string,
  result:     ScrapeResult,
  durationMs: number,
  runSource:  'cron' | 'manual',
): Promise<void> {
  const escape     = (s: string) => s.replace(/'/g, "''");
  const errorsJson = JSON.stringify(result.errors);
  await executeSQL(`
    INSERT INTO CORTEX_TESTING.PUBLIC.NEWS_SCRAPE_LOGS
        (SOURCE_ID, DURATION_MS, FETCHED, INSERTED, SKIPPED, ERROR_COUNT, ERRORS, RUN_SOURCE)
    VALUES (
        '${escape(sourceId)}',
        ${durationMs},
        ${result.fetched},
        ${result.inserted},
        ${result.skipped},
        ${result.errors.length},
        PARSE_JSON('${escape(errorsJson)}'),
        '${runSource}'
    )
  `);
}

// ── Per-source scrape ─────────────────────────────────────────────────────────

async function scrapeSource(source: SourceConfig): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    sourceId: source.sourceId,
    fetched:  0,
    inserted: 0,
    skipped:  0,
    errors:   [],
  };

  // Step 1 — fetch raw articles
  let raw: RawArticle[] = [];
  try {
    raw = await fetchFromSource(source);
    result.fetched = raw.length;
  } catch (err) {
    result.errors.push(`fetch: ${err instanceof Error ? err.message : String(err)}`);
    await markScraped(source.sourceId);
    return result;
  }

  if (raw.length === 0) {
    await markScraped(source.sourceId);
    return result;
  }

  // Step 2 — compute hashes
  const withHashes = raw.map((a) => ({
    ...a,
    contentHash: computeContentHash(source.sourceId, a.canonicalUrl),
  }));

  // Step 3 — filter against NEWS_KNOWN_URLS
  const knownHashes = await loadKnownHashes(
    source.sourceId,
    withHashes.map((a) => a.contentHash),
  );

  const newArticles = withHashes.filter((a) => !knownHashes.has(a.contentHash));
  result.skipped = withHashes.length - newArticles.length;

  if (newArticles.length === 0) {
    await markScraped(source.sourceId);
    return result;
  }

  // Step 4 — AI classification (batch, Haiku for cost efficiency)
  let classified: ClassifiedArticle[] = newArticles.map((a) => ({
    ...a,
    tags:               [],
    companiesMentioned: [],
    drugNames:          [],
    articleType:        'other' as const,
  }));

  try {
    classified = await classifyBatch(newArticles, source);
  } catch (err) {
    // Classification failure is non-fatal — insert with empty tags
    result.errors.push(`classify: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 5 — insert into Snowflake
  for (const article of classified) {
    try {
      await insertArticle(article, source);
      result.inserted++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Swallow UNIQUE constraint violations (race condition safety net)
      if (!msg.includes('UNIQUE') && !msg.includes('duplicate')) {
        result.errors.push(`insert ${article.canonicalUrl}: ${msg}`);
      } else {
        result.skipped++;
      }
    }
  }

  // Step 6 — mark scraped
  await markScraped(source.sourceId);
  return result;
}

// ── Fetcher dispatch ──────────────────────────────────────────────────────────

async function fetchFromSource(source: SourceConfig): Promise<RawArticle[]> {
  const { fetchMethod, platformType, fetchConfig, baseUrl, sourceId } = source;

  if (fetchMethod === 'rss') {
    return fetchRSS(sourceId, fetchConfig as RssFetchConfig);
  }

  if (fetchMethod === 'api') {
    return fetchAPI(sourceId, fetchConfig as ApiFetchConfig, platformType);
  }

  // HTML — route by platform type
  const htmlConfig = fetchConfig as HtmlFetchConfig;

  if (platformType === 'q4')      return fetchQ4(sourceId, htmlConfig, baseUrl);
  if (platformType === 'intrado') return fetchIntrado(sourceId, htmlConfig, baseUrl);
  return fetchNewsroom(sourceId, htmlConfig, baseUrl);
}

// ── Dedup check ───────────────────────────────────────────────────────────────

async function loadKnownHashes(
  sourceId: string,
  hashes: string[],
): Promise<Set<string>> {
  if (hashes.length === 0) return new Set();

  const list = hashes.map((h) => `'${h}'`).join(', ');
  const result = await executeSQL(`
    SELECT CONTENT_HASH
    FROM   CORTEX_TESTING.PUBLIC.NEWS_KNOWN_URLS
    WHERE  SOURCE_ID     = '${sourceId}'
      AND  CONTENT_HASH  IN (${list})
  `);

  return new Set(result.rows.map((r) => r.CONTENT_HASH as string));
}

// ── AI classification ─────────────────────────────────────────────────────────

interface ClassifiedArticle extends RawArticle {
  contentHash:        string;
  tags:               string[];
  companiesMentioned: string[];
  drugNames:          string[];
  articleType:        ArticleType;
}

type ArticleType = 'approval' | 'earnings' | 'pipeline' | 'M&A' | 'safety' | 'trial' | 'other';

const ARTICLE_TYPES: ArticleType[] = ['approval', 'earnings', 'pipeline', 'M&A', 'safety', 'trial', 'other'];

async function classifyBatch(
  articles: (RawArticle & { contentHash: string })[],
  source: SourceConfig,
): Promise<ClassifiedArticle[]> {
  // Build a compact numbered list for the prompt
  const numbered = articles
    .map((a, i) => `[${i}] TITLE: ${a.title}\nSUMMARY: ${a.summary ?? '(none)'}`)
    .join('\n\n');

  // If the source has targetDrugs configured, hint the classifier
  const cfg = source.fetchConfig as unknown as Record<string, unknown>;
  const targetDrugs: string[] = Array.isArray(cfg.targetDrugs) ? cfg.targetDrugs as string[] : [];
  const drugHint = targetDrugs.length
    ? `\nNote: this source focuses on ${targetDrugs.join(', ')} — pay extra attention to mentions of these drugs.\n`
    : '';

  const prompt = `You are a pharmaceutical intelligence classifier. For each numbered article below, extract:
- tags: up to 5 relevant topic tags (e.g. "FDA approval", "GLP-1", "oncology", "Phase 3", "earnings")
- companies: pharma/biotech company names mentioned
- drugs: drug or brand names mentioned (generic and brand names)
- type: one of: approval | earnings | pipeline | M&A | safety | trial | other
${drugHint}
Respond with a JSON array (one object per article, same order as input):
[{"tags":[],"companies":[],"drugs":[],"type":"other"}, ...]

Articles:
${numbered}`;

  const message = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages:   [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].type === 'text' ? message.content[0].text : '';
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON array in classification response');

  const parsed = JSON.parse(jsonMatch[0]) as Array<{
    tags?:      string[];
    companies?: string[];
    drugs?:     string[];
    type?:      string;
  }>;

  return articles.map((a, i) => {
    const c = parsed[i] ?? {};
    return {
      ...a,
      tags:               Array.isArray(c.tags)      ? c.tags.slice(0, 5)      : [],
      companiesMentioned: Array.isArray(c.companies) ? c.companies.slice(0, 10) : [],
      drugNames:          Array.isArray(c.drugs)     ? c.drugs.slice(0, 10)    : [],
      articleType:        (ARTICLE_TYPES as string[]).includes(c.type ?? '')
        ? (c.type as ArticleType)
        : 'other',
    };
  });
}

// ── Snowflake insert ──────────────────────────────────────────────────────────

async function insertArticle(
  a: ClassifiedArticle,
  source: SourceConfig,
): Promise<void> {
  const escape = (s: string) => s.replace(/'/g, "''");
  const toArray = (arr: string[]) =>
    arr.length ? `ARRAY_CONSTRUCT(${arr.map((v) => `'${escape(v)}'`).join(', ')})` : 'ARRAY_CONSTRUCT()';

  const publishedIso = a.publishedAt.toISOString();
  const title        = escape(a.title);
  const summary      = a.summary  ? `'${escape(a.summary)}'`  : 'NULL';
  const fullText     = a.fullText ? `'${escape(a.fullText)}'` : 'NULL';
  const url          = escape(a.canonicalUrl);
  const author       = a.author   ? `'${escape(a.author)}'`   : 'NULL';
  const filingType   = a.filingType ? `'${escape(a.filingType)}'` : 'NULL';
  const filingCik    = a.filingCik  ? `'${escape(a.filingCik)}'`  : 'NULL';

  await executeSQL(`
    INSERT INTO CORTEX_TESTING.PUBLIC.NEWS_ARTICLES
        (CONTENT_HASH, SOURCE_ID, TITLE, SUMMARY, FULL_TEXT, CANONICAL_URL,
         AUTHOR, PUBLISHED_AT, DECAY_LAMBDA,
         TAGS, COMPANIES_MENTIONED, DRUG_NAMES, ARTICLE_TYPE,
         FILING_TYPE, FILING_CIK)
    SELECT
        '${a.contentHash}',
        '${a.sourceId}',
        '${title}',
        ${summary},
        ${fullText},
        '${url}',
        ${author},
        '${publishedIso}'::TIMESTAMP_NTZ,
        ${source.decayLambda},
        ${toArray(a.tags)},
        ${toArray(a.companiesMentioned)},
        ${toArray(a.drugNames)},
        '${a.articleType}',
        ${filingType},
        ${filingCik}
    WHERE NOT EXISTS (
        SELECT 1 FROM CORTEX_TESTING.PUBLIC.NEWS_ARTICLES
        WHERE CONTENT_HASH = '${a.contentHash}'
    )
  `);

  await executeSQL(`
    INSERT INTO CORTEX_TESTING.PUBLIC.NEWS_KNOWN_URLS
        (CONTENT_HASH, SOURCE_ID, PUBLISHED_AT)
    SELECT '${a.contentHash}', '${a.sourceId}', '${publishedIso}'::TIMESTAMP_NTZ
    WHERE NOT EXISTS (
        SELECT 1 FROM CORTEX_TESTING.PUBLIC.NEWS_KNOWN_URLS
        WHERE CONTENT_HASH = '${a.contentHash}'
    )
  `);
}

// ── Update LAST_SCRAPED_AT ────────────────────────────────────────────────────

async function markScraped(sourceId: string): Promise<void> {
  await executeSQL(`
    UPDATE CORTEX_TESTING.PUBLIC.NEWS_SOURCES
    SET    LAST_SCRAPED_AT = CURRENT_TIMESTAMP()
    WHERE  SOURCE_ID = '${sourceId}'
  `);
}
