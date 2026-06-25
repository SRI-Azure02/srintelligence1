// ── Fetch config shapes (stored as VARIANT in NEWS_SOURCES.FETCH_CONFIG) ──────

export interface RssFetchConfig {
  rssUrl: string;
}

export interface ApiFetchConfig {
  endpoint:             string;
  params?:              Record<string, unknown>;
  approvalEndpoint?:    string;
  searchEndpoint?:      string;
  submissionsEndpoint?: string;
  filingTypes?:         string[];
}

export interface HtmlFetchConfig {
  listingUrl: string;
  selectors: {
    list:     string;
    title:    string;
    link:     string;
    date:     string;
    summary?: string;
  };
  note?: string;
}

// ── Source loaded from NEWS_SOURCES table ────────────────────────────────────

export interface SourceConfig {
  sourceId:          string;
  sourceName:        string;
  baseUrl:           string;
  category:          'industry_news' | 'ir' | 'media' | 'regulatory' | 'filings';
  company:           string | null;
  fetchMethod:       'rss' | 'api' | 'html';
  fetchConfig:       RssFetchConfig | ApiFetchConfig | HtmlFetchConfig;
  platformType:      'q4' | 'intrado' | 'fda' | 'sec' | 'generic' | null;
  isActive:          boolean;
  baseWeight:        number;
  decayLambda:       number;
  scrapeIntervalMin: number;
  lastScrapedAt:     Date | null;
}

// ── Raw article produced by any fetcher ──────────────────────────────────────

export interface RawArticle {
  sourceId:     string;
  title:        string;
  summary:      string | null;
  fullText:     string | null;
  canonicalUrl: string;
  author:       string | null;
  publishedAt:  Date;
  filingType?:  string | null;
  filingCik?:   string | null;
}

// ── Per-source scrape result reported back by the orchestrator ────────────────

export interface ScrapeResult {
  sourceId: string;
  fetched:  number;
  inserted: number;
  skipped:  number;
  errors:   string[];
}
