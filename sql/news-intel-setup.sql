-- =============================================================================
-- SRIntelligence™ — News Intelligence Module Setup
-- Target:  CORTEX_TESTING database · PUBLIC schema
-- Sections:
--   1. NEWS_SOURCES              — source registry
--   2. NEWS_ARTICLES             — scraped article corpus
--   3. NEWS_ARTICLE_FEEDBACK     — per-user up/down votes
--   4. NEWS_KNOWN_URLS           — fast dedup lookup table
--   5. NEWS_ARTICLES_WEIGHTED    — computed weight view
--   6. Scheduled Tasks           — feedback multiplier refresh + retention cleanup
--   7. Grants                    — app and scraper roles
--   8. NEWS_SOURCES Seed Data    — all 44 configured sources
-- =============================================================================

USE DATABASE CORTEX_TESTING;
USE WAREHOUSE CORTEX_WH;


-- =============================================================================
-- SECTION 1: NEWS_SOURCES
-- Registry of every configured scraping source.
-- FETCH_CONFIG is a JSON variant with keys specific to each fetch method:
--   rss:  { "rssUrl": "..." }
--   api:  { "endpoint": "...", "params": { ... } }
--   html: { "listingUrl": "...", "selectors": { "list": "...", "title": "...",
--            "link": "...", "date": "...", "summary": "..." } }
-- =============================================================================

CREATE TABLE IF NOT EXISTS PUBLIC.NEWS_SOURCES (
    SOURCE_ID               VARCHAR(64)     NOT NULL,
    SOURCE_NAME             VARCHAR(256)    NOT NULL,
    BASE_URL                VARCHAR(512)    NOT NULL,
    CATEGORY                VARCHAR(64)     NOT NULL,   -- 'industry_news' | 'ir' | 'media' | 'regulatory' | 'filings'
    COMPANY                 VARCHAR(128),               -- NULL for industry-wide sources
    FETCH_METHOD            VARCHAR(32)     NOT NULL,   -- 'rss' | 'api' | 'html'
    FETCH_CONFIG            VARIANT         NOT NULL,   -- method-specific JSON config
    PLATFORM_TYPE           VARCHAR(32),                -- 'q4' | 'intrado' | 'fda' | 'sec' | 'generic'
    IS_ACTIVE               BOOLEAN         DEFAULT TRUE,
    BASE_WEIGHT             NUMBER(5,4)     DEFAULT 1.0,
    DECAY_LAMBDA            NUMBER(6,4)     DEFAULT 0.05,   -- per-source decay rate
    SCRAPE_INTERVAL_MIN     INTEGER         DEFAULT 60,
    LAST_SCRAPED_AT         TIMESTAMP_NTZ,
    CREATED_AT              TIMESTAMP_NTZ   DEFAULT CURRENT_TIMESTAMP(),
    CONSTRAINT PK_NEWS_SOURCES PRIMARY KEY (SOURCE_ID)
);

COMMENT ON TABLE PUBLIC.NEWS_SOURCES IS 'Registry of all news and intelligence sources configured for scraping.';


-- =============================================================================
-- SECTION 2: NEWS_ARTICLES
-- Scraped article corpus. PUBLISHED_AT (not SCRAPED_AT) drives weight decay.
-- CONTENT_HASH = SHA256(source_id || ''::'' || canonical_url) is the dedup key.
-- Rows are never overwritten after insert — FEEDBACK_MULTIPLIER is the only
-- column updated post-insert (by the scheduled task in Section 6).
-- =============================================================================

CREATE TABLE IF NOT EXISTS PUBLIC.NEWS_ARTICLES (
    ARTICLE_ID              VARCHAR(128)    DEFAULT UUID_STRING(),
    CONTENT_HASH            VARCHAR(64)     NOT NULL,
    SOURCE_ID               VARCHAR(64)     NOT NULL,

    -- Content
    TITLE                   TEXT            NOT NULL,
    SUMMARY                 TEXT,
    FULL_TEXT               TEXT,
    CANONICAL_URL           VARCHAR(2048)   NOT NULL,
    AUTHOR                  VARCHAR(256),

    -- Timestamps — PUBLISHED_AT is the sole input to weight decay
    PUBLISHED_AT            TIMESTAMP_NTZ   NOT NULL,
    SCRAPED_AT              TIMESTAMP_NTZ   DEFAULT CURRENT_TIMESTAMP(),

    -- Weight parameters
    -- DECAY_LAMBDA copied from NEWS_SOURCES at insert time (immutable after insert)
    -- FEEDBACK_MULTIPLIER updated by scheduled task; range [0.1, 2.0]
    DECAY_LAMBDA            NUMBER(6,4)     DEFAULT 0.05,
    FEEDBACK_SCORE          NUMBER(8,4)     DEFAULT 0,
    FEEDBACK_MULTIPLIER     NUMBER(6,4)     DEFAULT 1.0,

    -- AI-extracted classification (populated at ingest)
    TAGS                    ARRAY,
    COMPANIES_MENTIONED     ARRAY,
    DRUG_NAMES              ARRAY,
    ARTICLE_TYPE            VARCHAR(64),    -- 'approval' | 'earnings' | 'pipeline' | 'M&A' | 'safety' | 'trial' | 'other'

    -- SEC EDGAR specific
    FILING_TYPE             VARCHAR(16),    -- '10-K' | '10-Q' | '8-K' | NULL
    FILING_CIK              VARCHAR(16),

    IS_DUPLICATE            BOOLEAN         DEFAULT FALSE,

    CONSTRAINT PK_NEWS_ARTICLES          PRIMARY KEY (ARTICLE_ID),
    CONSTRAINT UQ_NEWS_ARTICLES_HASH     UNIQUE      (CONTENT_HASH)
);

COMMENT ON TABLE PUBLIC.NEWS_ARTICLES IS 'Scraped pharma news corpus. Weight decays from PUBLISHED_AT only — never reset by re-scrapes.';

ALTER TABLE PUBLIC.NEWS_ARTICLES
    CLUSTER BY (PUBLISHED_AT, SOURCE_ID, ARTICLE_TYPE);


-- =============================================================================
-- SECTION 3: NEWS_ARTICLE_FEEDBACK
-- Per-user up/down votes on articles.
-- UNIQUE (USER_ID, ARTICLE_ID) prevents duplicate votes.
-- REASON captures structured downvote category; REASON_TEXT captures free text.
-- =============================================================================

CREATE TABLE IF NOT EXISTS PUBLIC.NEWS_ARTICLE_FEEDBACK (
    FEEDBACK_ID     VARCHAR(128)    DEFAULT UUID_STRING(),
    ARTICLE_ID      VARCHAR(128)    NOT NULL,
    USER_ID         VARCHAR(128)    NOT NULL,
    RATING          VARCHAR(8)      NOT NULL,   -- 'up' | 'down'
    REASON          VARCHAR(64),               -- 'not_relevant' | 'outdated' | 'inaccurate' | 'helpful' | 'other'
    REASON_TEXT     TEXT,
    CREATED_AT      TIMESTAMP_NTZ   DEFAULT CURRENT_TIMESTAMP(),

    CONSTRAINT PK_NEWS_ARTICLE_FEEDBACK         PRIMARY KEY (FEEDBACK_ID),
    CONSTRAINT UQ_NEWS_FEEDBACK_USER_ARTICLE    UNIQUE      (USER_ID, ARTICLE_ID)
);

COMMENT ON TABLE PUBLIC.NEWS_ARTICLE_FEEDBACK IS 'Per-user up/down votes on news articles. One vote per user per article enforced by UNIQUE constraint.';

ALTER TABLE PUBLIC.NEWS_ARTICLE_FEEDBACK
    CLUSTER BY (ARTICLE_ID, USER_ID);


-- =============================================================================
-- SECTION 4: NEWS_KNOWN_URLS
-- Lightweight dedup lookup. Scraper checks this table BEFORE fetching full
-- article content — avoiding expensive HTTP + AI extraction on already-seen URLs.
-- Kept in sync with NEWS_ARTICLES by the cleanup task in Section 6.
-- =============================================================================

CREATE TABLE IF NOT EXISTS PUBLIC.NEWS_KNOWN_URLS (
    CONTENT_HASH    VARCHAR(64)     NOT NULL,
    SOURCE_ID       VARCHAR(64)     NOT NULL,
    PUBLISHED_AT    TIMESTAMP_NTZ   NOT NULL,
    CONSTRAINT PK_NEWS_KNOWN_URLS PRIMARY KEY (CONTENT_HASH)
);

COMMENT ON TABLE PUBLIC.NEWS_KNOWN_URLS IS 'Fast dedup lookup table. Scraper filters against this before fetching full content. Synced nightly with NEWS_ARTICLES.';


-- =============================================================================
-- SECTION 5: NEWS_ARTICLES_WEIGHTED  (view)
-- Computes a real-time weight for every non-duplicate article.
-- Formula: source_base_weight × e^(−λ × age_days) × feedback_multiplier
-- age_days is derived from PUBLISHED_AT only — scrape date has no effect.
-- =============================================================================

CREATE OR REPLACE VIEW PUBLIC.NEWS_ARTICLES_WEIGHTED AS
SELECT
    a.ARTICLE_ID,
    a.CONTENT_HASH,
    a.SOURCE_ID,
    a.TITLE,
    a.SUMMARY,
    a.CANONICAL_URL,
    a.AUTHOR,
    a.PUBLISHED_AT,
    a.SCRAPED_AT,
    a.FEEDBACK_SCORE,
    a.FEEDBACK_MULTIPLIER,
    a.TAGS,
    a.COMPANIES_MENTIONED,
    a.DRUG_NAMES,
    a.ARTICLE_TYPE,
    a.FILING_TYPE,
    a.FILING_CIK,
    s.SOURCE_NAME,
    s.COMPANY                                                           AS SOURCE_COMPANY,
    s.CATEGORY                                                          AS SOURCE_CATEGORY,
    s.BASE_WEIGHT                                                       AS SOURCE_BASE_WEIGHT,
    GREATEST(0, DATEDIFF('day', a.PUBLISHED_AT, CURRENT_TIMESTAMP()))   AS AGE_DAYS,
    ROUND(
        s.BASE_WEIGHT
        * EXP(-a.DECAY_LAMBDA * GREATEST(0, DATEDIFF('day', a.PUBLISHED_AT, CURRENT_TIMESTAMP())))
        * a.FEEDBACK_MULTIPLIER
    , 6)                                                                AS COMPUTED_WEIGHT
FROM PUBLIC.NEWS_ARTICLES a
JOIN PUBLIC.NEWS_SOURCES   s ON a.SOURCE_ID = s.SOURCE_ID
WHERE a.IS_DUPLICATE = FALSE
  AND s.IS_ACTIVE    = TRUE;

COMMENT ON VIEW PUBLIC.NEWS_ARTICLES_WEIGHTED IS 'Real-time weighted view of news articles. COMPUTED_WEIGHT decays from PUBLISHED_AT via exponential decay, adjusted by feedback.';


-- =============================================================================
-- SECTION 6: Scheduled Tasks
-- Task A: Refresh FEEDBACK_MULTIPLIER on NEWS_ARTICLES every 10 minutes.
--          Cap range: [0.1, 2.0]. Moves ±0.1 per net vote unit.
-- Task B: Nightly retention cleanup — purge articles older than 3 years
--          and orphaned hashes from NEWS_KNOWN_URLS.
-- =============================================================================

CREATE OR REPLACE TASK CORTEX_TESTING.PUBLIC.UPDATE_ARTICLE_FEEDBACK_MULTIPLIERS
    WAREHOUSE = CORTEX_WH
    SCHEDULE  = '10 MINUTE'
    COMMENT   = 'Refreshes FEEDBACK_MULTIPLIER on NEWS_ARTICLES based on net vote counts in NEWS_ARTICLE_FEEDBACK.'
AS
UPDATE PUBLIC.NEWS_ARTICLES a
SET
    FEEDBACK_SCORE      = agg.net_score,
    FEEDBACK_MULTIPLIER = CASE
        WHEN agg.net_score > 0  THEN LEAST(2.0,   1.0 + (agg.net_score * 0.1))
        WHEN agg.net_score < 0  THEN GREATEST(0.1, 1.0 + (agg.net_score * 0.1))
        ELSE 1.0
    END
FROM (
    SELECT   ARTICLE_ID,
             SUM(CASE RATING WHEN 'up' THEN 1 ELSE -1 END) AS net_score
    FROM     PUBLIC.NEWS_ARTICLE_FEEDBACK
    GROUP BY ARTICLE_ID
) agg
WHERE a.ARTICLE_ID = agg.ARTICLE_ID;

ALTER TASK CORTEX_TESTING.PUBLIC.UPDATE_ARTICLE_FEEDBACK_MULTIPLIERS RESUME;


CREATE OR REPLACE TASK CORTEX_TESTING.PUBLIC.CLEANUP_OLD_NEWS_ARTICLES
    WAREHOUSE = CORTEX_WH
    SCHEDULE  = '1440 MINUTE'
    COMMENT   = 'Purges articles older than 3 years and removes orphaned hashes from NEWS_KNOWN_URLS.'
AS
BEGIN
    DELETE FROM PUBLIC.NEWS_ARTICLES
    WHERE PUBLISHED_AT < DATEADD('year', -3, CURRENT_TIMESTAMP());

    DELETE FROM PUBLIC.NEWS_KNOWN_URLS
    WHERE CONTENT_HASH NOT IN (SELECT CONTENT_HASH FROM PUBLIC.NEWS_ARTICLES);
END;

ALTER TASK CORTEX_TESTING.PUBLIC.CLEANUP_OLD_NEWS_ARTICLES RESUME;


-- =============================================================================
-- SECTION 7: Grants
-- SRINTELLIGENCE_APP_ROLE     — read articles + submit feedback
-- SRINTELLIGENCE_SCRAPER_ROLE — insert articles + update source metadata
-- =============================================================================

GRANT SELECT          ON PUBLIC.NEWS_SOURCES              TO ROLE SRINTELLIGENCE_APP_ROLE;
GRANT SELECT          ON PUBLIC.NEWS_ARTICLES             TO ROLE SRINTELLIGENCE_APP_ROLE;
GRANT SELECT          ON PUBLIC.NEWS_KNOWN_URLS           TO ROLE SRINTELLIGENCE_APP_ROLE;
GRANT SELECT          ON PUBLIC.NEWS_ARTICLES_WEIGHTED    TO ROLE SRINTELLIGENCE_APP_ROLE;
GRANT SELECT, INSERT  ON PUBLIC.NEWS_ARTICLE_FEEDBACK     TO ROLE SRINTELLIGENCE_APP_ROLE;

GRANT SELECT, INSERT  ON PUBLIC.NEWS_ARTICLES             TO ROLE SRINTELLIGENCE_SCRAPER_ROLE;
GRANT SELECT, INSERT  ON PUBLIC.NEWS_KNOWN_URLS           TO ROLE SRINTELLIGENCE_SCRAPER_ROLE;
GRANT SELECT, UPDATE  ON PUBLIC.NEWS_SOURCES              TO ROLE SRINTELLIGENCE_SCRAPER_ROLE;
GRANT SELECT, INSERT  ON PUBLIC.NEWS_ARTICLE_FEEDBACK     TO ROLE SRINTELLIGENCE_SCRAPER_ROLE;


-- =============================================================================
-- SECTION 8: NEWS_SOURCES Seed Data  (44 sources)
--
-- BASE_WEIGHT guide:
--   1.5 = primary regulatory/official (FDA)
--   1.4 = mandatory financial disclosure (SEC)
--   1.2 = vetted industry journalism
--   1.1 = corporate IR (self-reported but material)
--   1.0 = corporate media rooms
--   0.9 = broad biotech aggregators
--   0.0 = paywalled / inactive placeholder
--
-- DECAY_LAMBDA guide:
--   0.02 = very slow decay (SEC filings — material for years)
--   0.03 = slow decay (FDA approvals — reference for months)
--   0.05 = standard (corporate IR — quarterly cadence)
--   0.06 = moderate (corporate media rooms)
--   0.08 = fast (industry news — daily refresh cycle)
--
-- SCRAPE_INTERVAL_MIN guide:
--   60   = RSS feeds (low server load)
--   120  = APIs (rate-limit friendly)
--   240  = corporate HTML pages (polite crawl rate)
--   0    = inactive / paywalled
-- =============================================================================

-- ── Industry-Wide News ────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES
    (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
VALUES
(
    'endpoints_news',
    'Endpoints News',
    'https://endpoints.news',
    'industry_news', NULL, 'html',
    PARSE_JSON('{"listingUrl":"https://endpoints.news","selectors":{"list":"article","title":"h2","link":"a","date":"time","summary":"p"},"note":"Enterprise API required — IS_ACTIVE=false until credentials provided"}'),
    'generic', FALSE, 0.0, 0.08, 0
),
(
    'fierce_pharma',
    'Fierce Pharma',
    'https://www.fiercepharma.com',
    'industry_news', NULL, 'rss',
    PARSE_JSON('{"rssUrl":"https://www.fiercepharma.com/rss/xml"}'),
    'generic', TRUE, 1.2, 0.08, 60
),
(
    'biopharmadive',
    'BioPharma Dive',
    'https://www.biopharmadive.com',
    'industry_news', NULL, 'rss',
    PARSE_JSON('{"rssUrl":"https://www.biopharmadive.com/feeds/news/"}'),
    'generic', TRUE, 1.2, 0.08, 60
),
(
    'biospace',
    'BioSpace',
    'https://www.biospace.com',
    'industry_news', NULL, 'html',
    PARSE_JSON('{"listingUrl":"https://www.biospace.com/news","selectors":{"list":"article.news-item","title":"h3.news-item__title","link":"a.news-item__link","date":"time.news-item__date","summary":"p.news-item__summary"}}'),
    'generic', TRUE, 0.9, 0.08, 120
);

-- ── Regulatory & Filings ──────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES
    (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
VALUES
(
    'fda_press_room',
    'FDA Press Room',
    'https://www.fda.gov/news-events',
    'regulatory', NULL, 'api',
    PARSE_JSON('{"endpoint":"https://api.fda.gov/drug/drugsfda.json","params":{"limit":50,"sort":"submissions.submission_status_date:desc"},"approvalEndpoint":"https://api.fda.gov/drug/nda.json"}'),
    'fda', TRUE, 1.5, 0.03, 120
),
(
    'sec_edgar',
    'SEC EDGAR System',
    'https://efts.sec.gov/LATEST/search-index',
    'filings', NULL, 'api',
    PARSE_JSON('{"endpoint":"https://efts.sec.gov/LATEST/search-index","searchEndpoint":"https://efts.sec.gov/LATEST/search-index?q=%22pharmaceutical%22&dateRange=custom&startdt={startDate}&enddt={endDate}&forms=8-K,10-Q,10-K","submissionsEndpoint":"https://data.sec.gov/submissions/CIK{cik}.json","filingTypes":["8-K","10-Q","10-K"]}'),
    'sec', TRUE, 1.4, 0.02, 120
);

-- ── Johnson & Johnson ─────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES
    (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
VALUES
(
    'jnj_ir',
    'Johnson & Johnson Investor Relations',
    'https://investor.jnj.com',
    'ir', 'Johnson & Johnson', 'html',
    PARSE_JSON('{"listingUrl":"https://investor.jnj.com/press-releases","selectors":{"list":"div.press-release-item","title":"h3","link":"a","date":"span.date","summary":"p.description"}}'),
    'intrado', TRUE, 1.1, 0.05, 240
),
(
    'jnj_media',
    'Johnson & Johnson Media Room',
    'https://www.jnj.com/newsroom',
    'media', 'Johnson & Johnson', 'html',
    PARSE_JSON('{"listingUrl":"https://www.jnj.com/newsroom","selectors":{"list":"article.news-card","title":"h3.news-card__title","link":"a.news-card__link","date":"time","summary":"p.news-card__summary"}}'),
    'generic', TRUE, 1.0, 0.06, 240
);

-- ── Roche ─────────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES
    (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
VALUES
(
    'roche_ir',
    'Roche Investor Relations',
    'https://www.roche.com/investors',
    'ir', 'Roche', 'html',
    PARSE_JSON('{"listingUrl":"https://www.roche.com/investors/updates","selectors":{"list":"div.teaser-item","title":"h3.teaser-item__title","link":"a.teaser-item__link","date":"span.teaser-item__date","summary":"p.teaser-item__text"}}'),
    'generic', TRUE, 1.1, 0.05, 240
),
(
    'roche_media',
    'Roche Media',
    'https://www.roche.com/media',
    'media', 'Roche', 'html',
    PARSE_JSON('{"listingUrl":"https://www.roche.com/media/releases","selectors":{"list":"div.teaser-item","title":"h3.teaser-item__title","link":"a.teaser-item__link","date":"span.teaser-item__date","summary":"p.teaser-item__text"}}'),
    'generic', TRUE, 1.0, 0.06, 240
);

-- ── Eli Lilly ─────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES
    (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
VALUES
(
    'lilly_ir',
    'Eli Lilly Investor Relations',
    'https://investor.lilly.com',
    'ir', 'Eli Lilly', 'html',
    PARSE_JSON('{"listingUrl":"https://investor.lilly.com/news-releases/news-release-details","selectors":{"list":"div.q4-ir-press-releases__item","title":"h3.q4-ir-press-releases__title","link":"a.q4-ir-press-releases__link","date":"span.q4-ir-press-releases__date","summary":"p.q4-ir-press-releases__body"}}'),
    'q4', TRUE, 1.1, 0.05, 240
),
(
    'lilly_media',
    'Eli Lilly Newsroom',
    'https://www.lilly.com/newsroom',
    'media', 'Eli Lilly', 'html',
    PARSE_JSON('{"listingUrl":"https://www.lilly.com/newsroom/press-releases","selectors":{"list":"article.press-release","title":"h2.press-release__title","link":"a.press-release__link","date":"time.press-release__date","summary":"p.press-release__summary"}}'),
    'generic', TRUE, 1.0, 0.06, 240
);

-- ── Merck & Co. ───────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES
    (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
VALUES
(
    'merck_ir',
    'Merck & Co. Investor Relations',
    'https://investors.merck.com',
    'ir', 'Merck & Co.', 'html',
    PARSE_JSON('{"listingUrl":"https://investors.merck.com/news/press-releases","selectors":{"list":"div.press-release-item","title":"h4.press-release-title","link":"a.press-release-link","date":"span.press-release-date","summary":"p.press-release-summary"}}'),
    'intrado', TRUE, 1.1, 0.05, 240
),
(
    'merck_media',
    'Merck & Co. Newsroom',
    'https://www.merck.com/newsroom',
    'media', 'Merck & Co.', 'html',
    PARSE_JSON('{"listingUrl":"https://www.merck.com/newsroom/news-releases","selectors":{"list":"article.news-release","title":"h3","link":"a","date":"time","summary":"p"}}'),
    'generic', TRUE, 1.0, 0.06, 240
);

-- ── Pfizer ────────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES
    (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
VALUES
(
    'pfizer_ir',
    'Pfizer Investor Relations',
    'https://investors.pfizer.com',
    'ir', 'Pfizer', 'html',
    PARSE_JSON('{"listingUrl":"https://investors.pfizer.com/newsroom/press-releases","selectors":{"list":"div[data-module=''PressRelease'']","title":"h3.press-release-title","link":"a.press-release-link","date":"span.press-release-date","summary":"p.press-release-summary"}}'),
    'intrado', TRUE, 1.1, 0.05, 240
),
(
    'pfizer_media',
    'Pfizer News',
    'https://www.pfizer.com/news',
    'media', 'Pfizer', 'html',
    PARSE_JSON('{"listingUrl":"https://www.pfizer.com/news/press-releases","selectors":{"list":"article.news-item","title":"h3.news-item__title","link":"a.news-item__link","date":"span.news-item__date","summary":"p.news-item__excerpt"}}'),
    'generic', TRUE, 1.0, 0.06, 240
);

-- ── AbbVie ────────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES
    (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
VALUES
(
    'abbvie_ir',
    'AbbVie Investor Relations',
    'https://investors.abbvie.com',
    'ir', 'AbbVie', 'html',
    PARSE_JSON('{"listingUrl":"https://investors.abbvie.com/news-releases/news-releases-details","selectors":{"list":"div.q4-ir-press-releases__item","title":"h3.q4-ir-press-releases__title","link":"a.q4-ir-press-releases__link","date":"span.q4-ir-press-releases__date","summary":"p.q4-ir-press-releases__body"}}'),
    'q4', TRUE, 1.1, 0.05, 240
),
(
    'abbvie_media',
    'AbbVie News',
    'https://news.abbvie.com',
    'media', 'AbbVie', 'html',
    PARSE_JSON('{"listingUrl":"https://news.abbvie.com/press-releases","selectors":{"list":"article.wd_news_item","title":"h3.wd_news_item__title","link":"a.wd_news_item__link","date":"span.wd_news_item__date","summary":"p.wd_news_item__summary"}}'),
    'generic', TRUE, 1.0, 0.06, 240
);

-- ── AstraZeneca ───────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES
    (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
VALUES
(
    'astrazeneca_ir',
    'AstraZeneca Investor Relations',
    'https://www.astrazeneca.com/investors',
    'ir', 'AstraZeneca', 'html',
    PARSE_JSON('{"listingUrl":"https://www.astrazeneca.com/investors/investor-news.html","selectors":{"list":"div.az-news-item","title":"h3.az-news-item__title","link":"a.az-news-item__link","date":"span.az-news-item__date","summary":"p.az-news-item__summary"}}'),
    'generic', TRUE, 1.1, 0.05, 240
),
(
    'astrazeneca_media',
    'AstraZeneca Media Centre',
    'https://www.astrazeneca.com/media-centre',
    'media', 'AstraZeneca', 'html',
    PARSE_JSON('{"listingUrl":"https://www.astrazeneca.com/media-centre/press-releases.html","selectors":{"list":"div.az-news-item","title":"h3.az-news-item__title","link":"a.az-news-item__link","date":"span.az-news-item__date","summary":"p.az-news-item__summary"}}'),
    'generic', TRUE, 1.0, 0.06, 240
);

-- ── Novartis ──────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES
    (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
VALUES
(
    'novartis_ir',
    'Novartis Investor Relations',
    'https://www.novartis.com/investors',
    'ir', 'Novartis', 'html',
    PARSE_JSON('{"listingUrl":"https://www.novartis.com/news/media-releases","selectors":{"list":"div.media-release-item","title":"h3.media-release-item__title","link":"a.media-release-item__link","date":"span.media-release-item__date","summary":"p.media-release-item__excerpt"}}'),
    'generic', TRUE, 1.1, 0.05, 240
),
(
    'novartis_media',
    'Novartis News',
    'https://www.novartis.com/news',
    'media', 'Novartis', 'html',
    PARSE_JSON('{"listingUrl":"https://www.novartis.com/news/media-releases","selectors":{"list":"div.media-release-item","title":"h3.media-release-item__title","link":"a.media-release-item__link","date":"span.media-release-item__date","summary":"p.media-release-item__excerpt"}}'),
    'generic', TRUE, 1.0, 0.06, 240
);

-- ── Sanofi ────────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES
    (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
VALUES
(
    'sanofi_ir',
    'Sanofi Investor Relations',
    'https://www.sanofi.com/en/investors',
    'ir', 'Sanofi', 'html',
    PARSE_JSON('{"listingUrl":"https://www.sanofi.com/en/investors/reports-and-publications","selectors":{"list":"article.sanofi-press-release","title":"h3","link":"a","date":"time","summary":"p"}}'),
    'generic', TRUE, 1.1, 0.05, 240
),
(
    'sanofi_media',
    'Sanofi Media Room',
    'https://www.sanofi.com/en/media-room',
    'media', 'Sanofi', 'html',
    PARSE_JSON('{"listingUrl":"https://www.sanofi.com/en/media-room/press-releases","selectors":{"list":"article.sanofi-press-release","title":"h3","link":"a","date":"time","summary":"p"}}'),
    'generic', TRUE, 1.0, 0.06, 240
);

-- ── Bristol Myers Squibb ──────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES
    (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
VALUES
(
    'bms_hub',
    'Bristol Myers Squibb News Hub',
    'https://news.bms.com',
    'media', 'Bristol Myers Squibb', 'html',
    PARSE_JSON('{"listingUrl":"https://news.bms.com/press-releases","selectors":{"list":"div.press-release-item","title":"h3.press-release-item__title","link":"a.press-release-item__link","date":"span.press-release-item__date","summary":"p.press-release-item__summary"}}'),
    'generic', TRUE, 1.0, 0.06, 240
);

-- ── Novo Nordisk ──────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES
    (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
VALUES
(
    'novonordisk_ir',
    'Novo Nordisk Investor Relations',
    'https://www.novonordisk.com/investors',
    'ir', 'Novo Nordisk', 'html',
    PARSE_JSON('{"listingUrl":"https://www.novonordisk.com/investors/newsroom.html","selectors":{"list":"article.nn-news-item","title":"h3.nn-news-item__headline","link":"a.nn-news-item__link","date":"time.nn-news-item__date","summary":"p.nn-news-item__teaser"}}'),
    'generic', TRUE, 1.1, 0.05, 240
),
(
    'novonordisk_media',
    'Novo Nordisk News & Media',
    'https://www.novonordisk.com/news-and-media',
    'media', 'Novo Nordisk', 'html',
    PARSE_JSON('{"listingUrl":"https://www.novonordisk.com/news-and-media/news-and-ir-releases.html","selectors":{"list":"article.nn-news-item","title":"h3.nn-news-item__headline","link":"a.nn-news-item__link","date":"time.nn-news-item__date","summary":"p.nn-news-item__teaser"}}'),
    'generic', TRUE, 1.0, 0.06, 240
);

-- ── GSK ───────────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES
    (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
VALUES
(
    'gsk_ir',
    'GSK Investor Relations',
    'https://www.gsk.com/en-gb/investors',
    'ir', 'GSK', 'html',
    PARSE_JSON('{"listingUrl":"https://www.gsk.com/en-gb/investors/results-and-reports","selectors":{"list":"div.gsk-news-card","title":"h3.gsk-news-card__title","link":"a.gsk-news-card__link","date":"span.gsk-news-card__date","summary":"p.gsk-news-card__description"}}'),
    'generic', TRUE, 1.1, 0.05, 240
),
(
    'gsk_media',
    'GSK Media',
    'https://www.gsk.com/en-gb/media',
    'media', 'GSK', 'html',
    PARSE_JSON('{"listingUrl":"https://www.gsk.com/en-gb/media/press-releases","selectors":{"list":"div.gsk-news-card","title":"h3.gsk-news-card__title","link":"a.gsk-news-card__link","date":"span.gsk-news-card__date","summary":"p.gsk-news-card__description"}}'),
    'generic', TRUE, 1.0, 0.06, 240
);

-- ── Amgen ─────────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES
    (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
VALUES
(
    'amgen_ir',
    'Amgen Investor Relations',
    'https://investors.amgen.com',
    'ir', 'Amgen', 'html',
    PARSE_JSON('{"listingUrl":"https://investors.amgen.com/news-releases/news-releases-details","selectors":{"list":"div.q4-ir-press-releases__item","title":"h3.q4-ir-press-releases__title","link":"a.q4-ir-press-releases__link","date":"span.q4-ir-press-releases__date","summary":"p.q4-ir-press-releases__body"}}'),
    'q4', TRUE, 1.1, 0.05, 240
),
(
    'amgen_media',
    'Amgen Newsroom',
    'https://www.amgen.com/newsroom',
    'media', 'Amgen', 'html',
    PARSE_JSON('{"listingUrl":"https://www.amgen.com/newsroom/press-releases","selectors":{"list":"article.news-article","title":"h3.news-article__title","link":"a.news-article__link","date":"span.news-article__date","summary":"p.news-article__excerpt"}}'),
    'generic', TRUE, 1.0, 0.06, 240
);

-- ── Boehringer Ingelheim ──────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES
    (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
VALUES
(
    'boehringer_media',
    'Boehringer Ingelheim Media',
    'https://www.boehringer-ingelheim.com/media',
    'media', 'Boehringer Ingelheim', 'html',
    PARSE_JSON('{"listingUrl":"https://www.boehringer-ingelheim.com/media/news-releases","selectors":{"list":"article.bi-news-item","title":"h3.bi-news-item__title","link":"a.bi-news-item__link","date":"time.bi-news-item__date","summary":"p.bi-news-item__teaser"}}'),
    'generic', TRUE, 1.0, 0.06, 240
);

-- ── Takeda ────────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES
    (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
VALUES
(
    'takeda_ir',
    'Takeda Investor Relations',
    'https://www.takeda.com/investors',
    'ir', 'Takeda', 'html',
    PARSE_JSON('{"listingUrl":"https://www.takeda.com/investors/news","selectors":{"list":"div.news-listing__item","title":"h3.news-listing__title","link":"a.news-listing__link","date":"span.news-listing__date","summary":"p.news-listing__summary"}}'),
    'generic', TRUE, 1.1, 0.05, 240
),
(
    'takeda_media',
    'Takeda Newsroom',
    'https://www.takeda.com/newsroom',
    'media', 'Takeda', 'html',
    PARSE_JSON('{"listingUrl":"https://www.takeda.com/newsroom/newsroom-releases","selectors":{"list":"div.news-listing__item","title":"h3.news-listing__title","link":"a.news-listing__link","date":"span.news-listing__date","summary":"p.news-listing__summary"}}'),
    'generic', TRUE, 1.0, 0.06, 240
);

-- ── Gilead Sciences ───────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES
    (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
VALUES
(
    'gilead_ir',
    'Gilead Sciences Investor Relations',
    'https://investors.gilead.com',
    'ir', 'Gilead Sciences', 'html',
    PARSE_JSON('{"listingUrl":"https://investors.gilead.com/news-releases/news-releases-details","selectors":{"list":"div.q4-ir-press-releases__item","title":"h3.q4-ir-press-releases__title","link":"a.q4-ir-press-releases__link","date":"span.q4-ir-press-releases__date","summary":"p.q4-ir-press-releases__body"}}'),
    'q4', TRUE, 1.1, 0.05, 240
),
(
    'gilead_media',
    'Gilead Sciences News',
    'https://www.gilead.com/news-and-press',
    'media', 'Gilead Sciences', 'html',
    PARSE_JSON('{"listingUrl":"https://www.gilead.com/news-and-press/press-room/press-releases","selectors":{"list":"div.press-release-list__item","title":"h3.press-release-list__title","link":"a.press-release-list__link","date":"span.press-release-list__date","summary":"p.press-release-list__excerpt"}}'),
    'generic', TRUE, 1.0, 0.06, 240
);

-- ── Bayer ─────────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES
    (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
VALUES
(
    'bayer_ir',
    'Bayer Investor Relations',
    'https://www.bayer.com/en/investors',
    'ir', 'Bayer', 'html',
    PARSE_JSON('{"listingUrl":"https://www.bayer.com/en/investors/news","selectors":{"list":"article.news-teaser","title":"h3.news-teaser__headline","link":"a.news-teaser__link","date":"time.news-teaser__date","summary":"p.news-teaser__text"}}'),
    'generic', TRUE, 1.1, 0.05, 240
),
(
    'bayer_media',
    'Bayer Newsroom',
    'https://www.bayer.com/en/newsroom',
    'media', 'Bayer', 'html',
    PARSE_JSON('{"listingUrl":"https://www.bayer.com/en/media/press-releases","selectors":{"list":"article.news-teaser","title":"h3.news-teaser__headline","link":"a.news-teaser__link","date":"time.news-teaser__date","summary":"p.news-teaser__text"}}'),
    'generic', TRUE, 1.0, 0.06, 240
);

-- ── Merck KGaA ────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES
    (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
VALUES
(
    'merck_kgaa_ir',
    'Merck KGaA Investor Relations',
    'https://www.merckgroup.com/en/investors',
    'ir', 'Merck KGaA', 'html',
    PARSE_JSON('{"listingUrl":"https://www.merckgroup.com/en/investors/news-and-publications.html","selectors":{"list":"div.mk-news-item","title":"h3.mk-news-item__title","link":"a.mk-news-item__link","date":"span.mk-news-item__date","summary":"p.mk-news-item__text"}}'),
    'generic', TRUE, 1.1, 0.05, 240
),
(
    'merck_kgaa_media',
    'Merck KGaA News',
    'https://www.merckgroup.com/en/news',
    'media', 'Merck KGaA', 'html',
    PARSE_JSON('{"listingUrl":"https://www.merckgroup.com/en/news/media-releases.html","selectors":{"list":"div.mk-news-item","title":"h3.mk-news-item__title","link":"a.mk-news-item__link","date":"span.mk-news-item__date","summary":"p.mk-news-item__text"}}'),
    'generic', TRUE, 1.0, 0.06, 240
);

-- ── Teva Pharma ───────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES
    (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
VALUES
(
    'teva_ir',
    'Teva Pharma Investor Relations',
    'https://ir.tevapharm.com',
    'ir', 'Teva Pharma', 'html',
    PARSE_JSON('{"listingUrl":"https://ir.tevapharm.com/news-releases/news-releases-details","selectors":{"list":"div.press-release-item","title":"h3.press-release-title","link":"a.press-release-link","date":"span.press-release-date","summary":"p.press-release-summary"}}'),
    'generic', TRUE, 1.1, 0.05, 240
),
(
    'teva_media',
    'Teva Pharma News & Media',
    'https://www.tevapharm.com/news-and-media',
    'media', 'Teva Pharma', 'html',
    PARSE_JSON('{"listingUrl":"https://www.tevapharm.com/news-and-media/news","selectors":{"list":"article.news-item","title":"h3.news-item__title","link":"a.news-item__link","date":"span.news-item__date","summary":"p.news-item__excerpt"}}'),
    'generic', TRUE, 1.0, 0.06, 240
);

-- ── CSL ───────────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES
    (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
VALUES
(
    'csl_ir',
    'CSL Investor Relations',
    'https://www.csl.com/investors',
    'ir', 'CSL', 'html',
    PARSE_JSON('{"listingUrl":"https://www.csl.com/investors/news-announcements","selectors":{"list":"div.csl-announcement","title":"h3.csl-announcement__title","link":"a.csl-announcement__link","date":"span.csl-announcement__date","summary":"p.csl-announcement__summary"}}'),
    'generic', TRUE, 1.1, 0.05, 240
),
(
    'csl_media',
    'CSL News',
    'https://www.csl.com/news',
    'media', 'CSL', 'html',
    PARSE_JSON('{"listingUrl":"https://www.csl.com/news/media-releases","selectors":{"list":"div.csl-announcement","title":"h3.csl-announcement__title","link":"a.csl-announcement__link","date":"span.csl-announcement__date","summary":"p.csl-announcement__summary"}}'),
    'generic', TRUE, 1.0, 0.06, 240
);


-- =============================================================================
-- Verify seed data
-- =============================================================================

SELECT
    COUNT(*)                                            AS total_sources,
    SUM(CASE IS_ACTIVE WHEN TRUE THEN 1 ELSE 0 END)    AS active_sources,
    SUM(CASE IS_ACTIVE WHEN FALSE THEN 1 ELSE 0 END)   AS inactive_sources,
    COUNT(DISTINCT FETCH_METHOD)                        AS distinct_fetch_methods,
    COUNT(DISTINCT PLATFORM_TYPE)                       AS distinct_platform_types
FROM PUBLIC.NEWS_SOURCES;
