-- =============================================================================
-- SRIntelligence™ — NEWS_SOURCES Seed Data (corrected syntax)
-- Uses INSERT INTO ... SELECT to allow PARSE_JSON() in values.
-- Run in Snowflake against CORTEX_TESTING / PUBLIC.
-- =============================================================================

USE DATABASE CORTEX_TESTING;
USE WAREHOUSE CORTEX_WH;

-- ── Industry-Wide News ────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'endpoints_news', 'Endpoints News', 'https://endpoints.news', 'industry_news', NULL, 'html',
PARSE_JSON('{"listingUrl":"https://endpoints.news","selectors":{"list":"article","title":"h2","link":"a","date":"time","summary":"p"},"note":"Enterprise API required"}'),
'generic', FALSE, 0.0, 0.08, 0;

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'fierce_pharma', 'Fierce Pharma', 'https://www.fiercepharma.com', 'industry_news', NULL, 'rss',
PARSE_JSON('{"rssUrl":"https://www.fiercepharma.com/rss/xml"}'),
'generic', TRUE, 1.2, 0.08, 60;

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'biopharmadive', 'BioPharma Dive', 'https://www.biopharmadive.com', 'industry_news', NULL, 'rss',
PARSE_JSON('{"rssUrl":"https://www.biopharmadive.com/feeds/news/"}'),
'generic', TRUE, 1.2, 0.08, 60;

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'biospace', 'BioSpace', 'https://www.biospace.com', 'industry_news', NULL, 'html',
PARSE_JSON('{"listingUrl":"https://www.biospace.com/news","selectors":{"list":"article.news-item","title":"h3.news-item__title","link":"a.news-item__link","date":"time.news-item__date","summary":"p.news-item__summary"}}'),
'generic', TRUE, 0.9, 0.08, 120;

-- ── Regulatory & Filings ──────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'fda_press_room', 'FDA Press Room', 'https://www.fda.gov/news-events', 'regulatory', NULL, 'api',
PARSE_JSON('{"endpoint":"https://api.fda.gov/drug/drugsfda.json","params":{"limit":50,"sort":"submissions.submission_status_date:desc"},"approvalEndpoint":"https://api.fda.gov/drug/nda.json"}'),
'fda', TRUE, 1.5, 0.03, 120;

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'sec_edgar', 'SEC EDGAR System', 'https://efts.sec.gov/LATEST/search-index', 'filings', NULL, 'api',
PARSE_JSON('{"endpoint":"https://efts.sec.gov/LATEST/search-index","searchEndpoint":"https://efts.sec.gov/LATEST/search-index?q=%22pharmaceutical%22&dateRange=custom&startdt={startDate}&enddt={endDate}&forms=8-K,10-Q,10-K","submissionsEndpoint":"https://data.sec.gov/submissions/CIK{cik}.json","filingTypes":["8-K","10-Q","10-K"]}'),
'sec', TRUE, 1.4, 0.02, 120;

-- ── Johnson & Johnson ─────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'jnj_ir', 'Johnson & Johnson Investor Relations', 'https://investor.jnj.com', 'ir', 'Johnson & Johnson', 'html',
PARSE_JSON('{"listingUrl":"https://investor.jnj.com/press-releases","selectors":{"list":"div.press-release-item","title":"h3","link":"a","date":"span.date","summary":"p.description"}}'),
'intrado', TRUE, 1.1, 0.05, 240;

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'jnj_media', 'Johnson & Johnson Media Room', 'https://www.jnj.com/newsroom', 'media', 'Johnson & Johnson', 'html',
PARSE_JSON('{"listingUrl":"https://www.jnj.com/newsroom","selectors":{"list":"article.news-card","title":"h3.news-card__title","link":"a.news-card__link","date":"time","summary":"p.news-card__summary"}}'),
'generic', TRUE, 1.0, 0.06, 240;

-- ── Roche ─────────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'roche_ir', 'Roche Investor Relations', 'https://www.roche.com/investors', 'ir', 'Roche', 'html',
PARSE_JSON('{"listingUrl":"https://www.roche.com/investors/updates","selectors":{"list":"div.teaser-item","title":"h3.teaser-item__title","link":"a.teaser-item__link","date":"span.teaser-item__date","summary":"p.teaser-item__text"}}'),
'generic', TRUE, 1.1, 0.05, 240;

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'roche_media', 'Roche Media', 'https://www.roche.com/media', 'media', 'Roche', 'html',
PARSE_JSON('{"listingUrl":"https://www.roche.com/media/releases","selectors":{"list":"div.teaser-item","title":"h3.teaser-item__title","link":"a.teaser-item__link","date":"span.teaser-item__date","summary":"p.teaser-item__text"}}'),
'generic', TRUE, 1.0, 0.06, 240;

-- ── Eli Lilly ─────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'lilly_ir', 'Eli Lilly Investor Relations', 'https://investor.lilly.com', 'ir', 'Eli Lilly', 'html',
PARSE_JSON('{"listingUrl":"https://investor.lilly.com/news-releases/news-release-details","selectors":{"list":"div.q4-ir-press-releases__item","title":"h3.q4-ir-press-releases__title","link":"a.q4-ir-press-releases__link","date":"span.q4-ir-press-releases__date","summary":"p.q4-ir-press-releases__body"}}'),
'q4', TRUE, 1.1, 0.05, 240;

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'lilly_media', 'Eli Lilly Newsroom', 'https://www.lilly.com/newsroom', 'media', 'Eli Lilly', 'html',
PARSE_JSON('{"listingUrl":"https://www.lilly.com/newsroom/press-releases","selectors":{"list":"article.press-release","title":"h2.press-release__title","link":"a.press-release__link","date":"time.press-release__date","summary":"p.press-release__summary"}}'),
'generic', TRUE, 1.0, 0.06, 240;

-- ── Merck & Co. ───────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'merck_ir', 'Merck & Co. Investor Relations', 'https://investors.merck.com', 'ir', 'Merck & Co.', 'html',
PARSE_JSON('{"listingUrl":"https://investors.merck.com/news/press-releases","selectors":{"list":"div.press-release-item","title":"h4.press-release-title","link":"a.press-release-link","date":"span.press-release-date","summary":"p.press-release-summary"}}'),
'intrado', TRUE, 1.1, 0.05, 240;

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'merck_media', 'Merck & Co. Newsroom', 'https://www.merck.com/newsroom', 'media', 'Merck & Co.', 'html',
PARSE_JSON('{"listingUrl":"https://www.merck.com/newsroom/news-releases","selectors":{"list":"article.news-release","title":"h3","link":"a","date":"time","summary":"p"}}'),
'generic', TRUE, 1.0, 0.06, 240;

-- ── Pfizer ────────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'pfizer_ir', 'Pfizer Investor Relations', 'https://investors.pfizer.com', 'ir', 'Pfizer', 'html',
PARSE_JSON('{"listingUrl":"https://investors.pfizer.com/newsroom/press-releases","selectors":{"list":"div[data-module=''PressRelease'']","title":"h3.press-release-title","link":"a.press-release-link","date":"span.press-release-date","summary":"p.press-release-summary"}}'),
'intrado', TRUE, 1.1, 0.05, 240;

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'pfizer_media', 'Pfizer News', 'https://www.pfizer.com/news', 'media', 'Pfizer', 'html',
PARSE_JSON('{"listingUrl":"https://www.pfizer.com/news/press-releases","selectors":{"list":"article.news-item","title":"h3.news-item__title","link":"a.news-item__link","date":"span.news-item__date","summary":"p.news-item__excerpt"}}'),
'generic', TRUE, 1.0, 0.06, 240;

-- ── AbbVie ────────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'abbvie_ir', 'AbbVie Investor Relations', 'https://investors.abbvie.com', 'ir', 'AbbVie', 'html',
PARSE_JSON('{"listingUrl":"https://investors.abbvie.com/news-releases/news-releases-details","selectors":{"list":"div.q4-ir-press-releases__item","title":"h3.q4-ir-press-releases__title","link":"a.q4-ir-press-releases__link","date":"span.q4-ir-press-releases__date","summary":"p.q4-ir-press-releases__body"}}'),
'q4', TRUE, 1.1, 0.05, 240;

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'abbvie_media', 'AbbVie News', 'https://news.abbvie.com', 'media', 'AbbVie', 'html',
PARSE_JSON('{"listingUrl":"https://news.abbvie.com/press-releases","selectors":{"list":"article.wd_news_item","title":"h3.wd_news_item__title","link":"a.wd_news_item__link","date":"span.wd_news_item__date","summary":"p.wd_news_item__summary"}}'),
'generic', TRUE, 1.0, 0.06, 240;

-- ── AstraZeneca ───────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'astrazeneca_ir', 'AstraZeneca Investor Relations', 'https://www.astrazeneca.com/investors', 'ir', 'AstraZeneca', 'html',
PARSE_JSON('{"listingUrl":"https://www.astrazeneca.com/investors/investor-news.html","selectors":{"list":"div.az-news-item","title":"h3.az-news-item__title","link":"a.az-news-item__link","date":"span.az-news-item__date","summary":"p.az-news-item__summary"}}'),
'generic', TRUE, 1.1, 0.05, 240;

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'astrazeneca_media', 'AstraZeneca Media Centre', 'https://www.astrazeneca.com/media-centre', 'media', 'AstraZeneca', 'html',
PARSE_JSON('{"listingUrl":"https://www.astrazeneca.com/media-centre/press-releases.html","selectors":{"list":"div.az-news-item","title":"h3.az-news-item__title","link":"a.az-news-item__link","date":"span.az-news-item__date","summary":"p.az-news-item__summary"}}'),
'generic', TRUE, 1.0, 0.06, 240;

-- ── Novartis ──────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'novartis_ir', 'Novartis Investor Relations', 'https://www.novartis.com/investors', 'ir', 'Novartis', 'html',
PARSE_JSON('{"listingUrl":"https://www.novartis.com/news/media-releases","selectors":{"list":"div.media-release-item","title":"h3.media-release-item__title","link":"a.media-release-item__link","date":"span.media-release-item__date","summary":"p.media-release-item__excerpt"}}'),
'generic', TRUE, 1.1, 0.05, 240;

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'novartis_media', 'Novartis News', 'https://www.novartis.com/news', 'media', 'Novartis', 'html',
PARSE_JSON('{"listingUrl":"https://www.novartis.com/news/media-releases","selectors":{"list":"div.media-release-item","title":"h3.media-release-item__title","link":"a.media-release-item__link","date":"span.media-release-item__date","summary":"p.media-release-item__excerpt"}}'),
'generic', TRUE, 1.0, 0.06, 240;

-- ── Sanofi ────────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'sanofi_ir', 'Sanofi Investor Relations', 'https://www.sanofi.com/en/investors', 'ir', 'Sanofi', 'html',
PARSE_JSON('{"listingUrl":"https://www.sanofi.com/en/investors/reports-and-publications","selectors":{"list":"article.sanofi-press-release","title":"h3","link":"a","date":"time","summary":"p"}}'),
'generic', TRUE, 1.1, 0.05, 240;

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'sanofi_media', 'Sanofi Media Room', 'https://www.sanofi.com/en/media-room', 'media', 'Sanofi', 'html',
PARSE_JSON('{"listingUrl":"https://www.sanofi.com/en/media-room/press-releases","selectors":{"list":"article.sanofi-press-release","title":"h3","link":"a","date":"time","summary":"p"}}'),
'generic', TRUE, 1.0, 0.06, 240;

-- ── Bristol Myers Squibb ──────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'bms_hub', 'Bristol Myers Squibb News Hub', 'https://news.bms.com', 'media', 'Bristol Myers Squibb', 'html',
PARSE_JSON('{"listingUrl":"https://news.bms.com/press-releases","selectors":{"list":"div.press-release-item","title":"h3.press-release-item__title","link":"a.press-release-item__link","date":"span.press-release-item__date","summary":"p.press-release-item__summary"}}'),
'generic', TRUE, 1.0, 0.06, 240;

-- ── Novo Nordisk ──────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'novonordisk_ir', 'Novo Nordisk Investor Relations', 'https://www.novonordisk.com/investors', 'ir', 'Novo Nordisk', 'html',
PARSE_JSON('{"listingUrl":"https://www.novonordisk.com/investors/newsroom.html","selectors":{"list":"article.nn-news-item","title":"h3.nn-news-item__headline","link":"a.nn-news-item__link","date":"time.nn-news-item__date","summary":"p.nn-news-item__teaser"}}'),
'generic', TRUE, 1.1, 0.05, 240;

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'novonordisk_media', 'Novo Nordisk News & Media', 'https://www.novonordisk.com/news-and-media', 'media', 'Novo Nordisk', 'html',
PARSE_JSON('{"listingUrl":"https://www.novonordisk.com/news-and-media/news-and-ir-releases.html","selectors":{"list":"article.nn-news-item","title":"h3.nn-news-item__headline","link":"a.nn-news-item__link","date":"time.nn-news-item__date","summary":"p.nn-news-item__teaser"}}'),
'generic', TRUE, 1.0, 0.06, 240;

-- ── GSK ───────────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'gsk_ir', 'GSK Investor Relations', 'https://www.gsk.com/en-gb/investors', 'ir', 'GSK', 'html',
PARSE_JSON('{"listingUrl":"https://www.gsk.com/en-gb/investors/results-and-reports","selectors":{"list":"div.gsk-news-card","title":"h3.gsk-news-card__title","link":"a.gsk-news-card__link","date":"span.gsk-news-card__date","summary":"p.gsk-news-card__description"}}'),
'generic', TRUE, 1.1, 0.05, 240;

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'gsk_media', 'GSK Media', 'https://www.gsk.com/en-gb/media', 'media', 'GSK', 'html',
PARSE_JSON('{"listingUrl":"https://www.gsk.com/en-gb/media/press-releases","selectors":{"list":"div.gsk-news-card","title":"h3.gsk-news-card__title","link":"a.gsk-news-card__link","date":"span.gsk-news-card__date","summary":"p.gsk-news-card__description"}}'),
'generic', TRUE, 1.0, 0.06, 240;

-- ── Amgen ─────────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'amgen_ir', 'Amgen Investor Relations', 'https://investors.amgen.com', 'ir', 'Amgen', 'html',
PARSE_JSON('{"listingUrl":"https://investors.amgen.com/news-releases/news-releases-details","selectors":{"list":"div.q4-ir-press-releases__item","title":"h3.q4-ir-press-releases__title","link":"a.q4-ir-press-releases__link","date":"span.q4-ir-press-releases__date","summary":"p.q4-ir-press-releases__body"}}'),
'q4', TRUE, 1.1, 0.05, 240;

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'amgen_media', 'Amgen Newsroom', 'https://www.amgen.com/newsroom', 'media', 'Amgen', 'html',
PARSE_JSON('{"listingUrl":"https://www.amgen.com/newsroom/press-releases","selectors":{"list":"article.news-article","title":"h3.news-article__title","link":"a.news-article__link","date":"span.news-article__date","summary":"p.news-article__excerpt"}}'),
'generic', TRUE, 1.0, 0.06, 240;

-- ── Boehringer Ingelheim ──────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'boehringer_media', 'Boehringer Ingelheim Media', 'https://www.boehringer-ingelheim.com/media', 'media', 'Boehringer Ingelheim', 'html',
PARSE_JSON('{"listingUrl":"https://www.boehringer-ingelheim.com/media/news-releases","selectors":{"list":"article.bi-news-item","title":"h3.bi-news-item__title","link":"a.bi-news-item__link","date":"time.bi-news-item__date","summary":"p.bi-news-item__teaser"}}'),
'generic', TRUE, 1.0, 0.06, 240;

-- ── Takeda ────────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'takeda_ir', 'Takeda Investor Relations', 'https://www.takeda.com/investors', 'ir', 'Takeda', 'html',
PARSE_JSON('{"listingUrl":"https://www.takeda.com/investors/news","selectors":{"list":"div.news-listing__item","title":"h3.news-listing__title","link":"a.news-listing__link","date":"span.news-listing__date","summary":"p.news-listing__summary"}}'),
'generic', TRUE, 1.1, 0.05, 240;

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'takeda_media', 'Takeda Newsroom', 'https://www.takeda.com/newsroom', 'media', 'Takeda', 'html',
PARSE_JSON('{"listingUrl":"https://www.takeda.com/newsroom/newsroom-releases","selectors":{"list":"div.news-listing__item","title":"h3.news-listing__title","link":"a.news-listing__link","date":"span.news-listing__date","summary":"p.news-listing__summary"}}'),
'generic', TRUE, 1.0, 0.06, 240;

-- ── Gilead Sciences ───────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'gilead_ir', 'Gilead Sciences Investor Relations', 'https://investors.gilead.com', 'ir', 'Gilead Sciences', 'html',
PARSE_JSON('{"listingUrl":"https://investors.gilead.com/news-releases/news-releases-details","selectors":{"list":"div.q4-ir-press-releases__item","title":"h3.q4-ir-press-releases__title","link":"a.q4-ir-press-releases__link","date":"span.q4-ir-press-releases__date","summary":"p.q4-ir-press-releases__body"}}'),
'q4', TRUE, 1.1, 0.05, 240;

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'gilead_media', 'Gilead Sciences News', 'https://www.gilead.com/news-and-press', 'media', 'Gilead Sciences', 'html',
PARSE_JSON('{"listingUrl":"https://www.gilead.com/news-and-press/press-room/press-releases","selectors":{"list":"div.press-release-list__item","title":"h3.press-release-list__title","link":"a.press-release-list__link","date":"span.press-release-list__date","summary":"p.press-release-list__excerpt"}}'),
'generic', TRUE, 1.0, 0.06, 240;

-- ── Bayer ─────────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'bayer_ir', 'Bayer Investor Relations', 'https://www.bayer.com/en/investors', 'ir', 'Bayer', 'html',
PARSE_JSON('{"listingUrl":"https://www.bayer.com/en/investors/news","selectors":{"list":"article.news-teaser","title":"h3.news-teaser__headline","link":"a.news-teaser__link","date":"time.news-teaser__date","summary":"p.news-teaser__text"}}'),
'generic', TRUE, 1.1, 0.05, 240;

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'bayer_media', 'Bayer Newsroom', 'https://www.bayer.com/en/newsroom', 'media', 'Bayer', 'html',
PARSE_JSON('{"listingUrl":"https://www.bayer.com/en/media/press-releases","selectors":{"list":"article.news-teaser","title":"h3.news-teaser__headline","link":"a.news-teaser__link","date":"time.news-teaser__date","summary":"p.news-teaser__text"}}'),
'generic', TRUE, 1.0, 0.06, 240;

-- ── Merck KGaA ────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'merck_kgaa_ir', 'Merck KGaA Investor Relations', 'https://www.merckgroup.com/en/investors', 'ir', 'Merck KGaA', 'html',
PARSE_JSON('{"listingUrl":"https://www.merckgroup.com/en/investors/news-and-publications.html","selectors":{"list":"div.mk-news-item","title":"h3.mk-news-item__title","link":"a.mk-news-item__link","date":"span.mk-news-item__date","summary":"p.mk-news-item__text"}}'),
'generic', TRUE, 1.1, 0.05, 240;

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'merck_kgaa_media', 'Merck KGaA News', 'https://www.merckgroup.com/en/news', 'media', 'Merck KGaA', 'html',
PARSE_JSON('{"listingUrl":"https://www.merckgroup.com/en/news/media-releases.html","selectors":{"list":"div.mk-news-item","title":"h3.mk-news-item__title","link":"a.mk-news-item__link","date":"span.mk-news-item__date","summary":"p.mk-news-item__text"}}'),
'generic', TRUE, 1.0, 0.06, 240;

-- ── Teva Pharma ───────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'teva_ir', 'Teva Pharma Investor Relations', 'https://ir.tevapharm.com', 'ir', 'Teva Pharma', 'html',
PARSE_JSON('{"listingUrl":"https://ir.tevapharm.com/news-releases/news-releases-details","selectors":{"list":"div.press-release-item","title":"h3.press-release-title","link":"a.press-release-link","date":"span.press-release-date","summary":"p.press-release-summary"}}'),
'generic', TRUE, 1.1, 0.05, 240;

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'teva_media', 'Teva Pharma News & Media', 'https://www.tevapharm.com/news-and-media', 'media', 'Teva Pharma', 'html',
PARSE_JSON('{"listingUrl":"https://www.tevapharm.com/news-and-media/news","selectors":{"list":"article.news-item","title":"h3.news-item__title","link":"a.news-item__link","date":"span.news-item__date","summary":"p.news-item__excerpt"}}'),
'generic', TRUE, 1.0, 0.06, 240;

-- ── CSL ───────────────────────────────────────────────────────────────────────

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'csl_ir', 'CSL Investor Relations', 'https://www.csl.com/investors', 'ir', 'CSL', 'html',
PARSE_JSON('{"listingUrl":"https://www.csl.com/investors/news-announcements","selectors":{"list":"div.csl-announcement","title":"h3.csl-announcement__title","link":"a.csl-announcement__link","date":"span.csl-announcement__date","summary":"p.csl-announcement__summary"}}'),
'generic', TRUE, 1.1, 0.05, 240;

INSERT INTO PUBLIC.NEWS_SOURCES (SOURCE_ID, SOURCE_NAME, BASE_URL, CATEGORY, COMPANY, FETCH_METHOD, FETCH_CONFIG, PLATFORM_TYPE, IS_ACTIVE, BASE_WEIGHT, DECAY_LAMBDA, SCRAPE_INTERVAL_MIN)
SELECT 'csl_media', 'CSL News', 'https://www.csl.com/news', 'media', 'CSL', 'html',
PARSE_JSON('{"listingUrl":"https://www.csl.com/news/media-releases","selectors":{"list":"div.csl-announcement","title":"h3.csl-announcement__title","link":"a.csl-announcement__link","date":"span.csl-announcement__date","summary":"p.csl-announcement__summary"}}'),
'generic', TRUE, 1.0, 0.06, 240;

-- ── Verify ────────────────────────────────────────────────────────────────────

SELECT
    COUNT(*)                                                             AS total_sources,
    SUM(CASE WHEN IS_ACTIVE = TRUE AND IS_DELETED = FALSE THEN 1 ELSE 0 END) AS scrape_eligible
FROM CORTEX_TESTING.PUBLIC.NEWS_SOURCES;
