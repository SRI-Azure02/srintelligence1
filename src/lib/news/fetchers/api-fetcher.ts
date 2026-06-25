/**
 * API fetcher — handles two structured data sources:
 *
 *   FDA  — openFDA drug approval and safety endpoints (free, no key required)
 *   SEC  — EDGAR full-text search API (free, no key required)
 *
 * Both return RawArticle[] using PUBLISHED_AT from the source's own timestamps.
 */

import type { RawArticle, ApiFetchConfig } from '../types';

const USER_AGENT = 'SRIntelligence/1.0 (pharma news aggregator; contact@srinsights.com)';
const FDA_PRESS_RSS = 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml';

// ── Public entry point ────────────────────────────────────────────────────────

export async function fetchAPI(
  sourceId: string,
  config: ApiFetchConfig,
  platformType: string | null,
): Promise<RawArticle[]> {
  if (platformType === 'fda') return fetchFDA(sourceId);
  if (platformType === 'sec') return fetchSEC(sourceId, config);
  throw new Error(`api-fetcher: unknown platformType "${platformType}" for source ${sourceId}`);
}

// ── FDA ───────────────────────────────────────────────────────────────────────
// Primary signal: FDA press-release RSS (official, timestamped, free).
// Supplemented by openFDA drug approvals for structured approval data.

async function fetchFDA(sourceId: string): Promise<RawArticle[]> {
  const [pressArticles, approvalArticles] = await Promise.allSettled([
    fetchFDAPressRSS(sourceId),
    fetchFDAApprovals(sourceId),
  ]);

  const articles: RawArticle[] = [];

  if (pressArticles.status === 'fulfilled') articles.push(...pressArticles.value);
  if (approvalArticles.status === 'fulfilled') articles.push(...approvalArticles.value);

  // Dedup by URL within this batch
  const seen = new Set<string>();
  return articles.filter((a) => {
    if (seen.has(a.canonicalUrl)) return false;
    seen.add(a.canonicalUrl);
    return true;
  });
}

async function fetchFDAPressRSS(sourceId: string): Promise<RawArticle[]> {
  const { XMLParser } = await import('fast-xml-parser');
  const parser = new XMLParser({
    ignoreAttributes:    false,
    attributeNamePrefix: '@_',
    isArray:             (name) => name === 'item',
  });

  const res = await fetch(FDA_PRESS_RSS, {
    headers: { 'User-Agent': USER_AGENT },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`FDA RSS failed: ${res.status}`);

  const xml     = await res.text();
  const parsed  = parser.parse(xml);
  const items: unknown[] = parsed?.rss?.channel?.item ?? [];

  return items.flatMap((item) => {
    const i    = item as Record<string, unknown>;
    const url  = typeof i.link === 'string' ? i.link.trim() : '';
    const date = i.pubDate ? new Date(String(i.pubDate)) : null;
    const title = stripHtml(String(i.title ?? '')).trim();

    if (!url || !title || !date || isNaN(date.getTime())) return [];

    return [{
      sourceId,
      title,
      summary:      stripHtml(String(i.description ?? '')).slice(0, 1200) || null,
      fullText:     null,
      canonicalUrl: url,
      author:       null,
      publishedAt:  date,
    }];
  });
}

async function fetchFDAApprovals(sourceId: string): Promise<RawArticle[]> {
  // openFDA NDA approvals — returns the 50 most recent approval actions
  const url = 'https://api.fda.gov/drug/drugsfda.json?limit=50&sort=submissions.submission_status_date:desc';
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    cache: 'no-store',
  });
  if (!res.ok) return []; // non-fatal — press RSS is the primary signal

  const json = await res.json() as { results?: FDADrug[] };
  const results = json.results ?? [];

  return results.flatMap((drug) => {
    const submissions = drug.submissions ?? [];
    return submissions.flatMap((sub) => {
      if (sub.submission_status !== 'AP') return []; // AP = Approved

      const dateStr = sub.submission_status_date ?? '';
      const date    = dateStr ? parseYYYYMMDD(dateStr) : null;
      if (!date) return [];

      const brandNames = (drug.products ?? [])
        .map((p) => p.brand_name)
        .filter(Boolean)
        .join(', ');
      const appNum = drug.application_number ?? 'Unknown';

      return [{
        sourceId,
        title:        `FDA Approval: ${brandNames || appNum} (${sub.submission_type ?? ''} ${sub.submission_number ?? ''})`.trim(),
        summary:      `Application ${appNum} received FDA approval status. Sponsor: ${drug.sponsor_name ?? 'Unknown'}.`,
        fullText:     null,
        canonicalUrl: `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${appNum.replace(/\D/g, '')}`,
        author:       null,
        publishedAt:  date,
        filingType:   sub.submission_type ?? null,
        filingCik:    null,
      }] satisfies RawArticle[];
    });
  });
}

// ── SEC EDGAR ─────────────────────────────────────────────────────────────────
// Uses the EDGAR full-text search API (EFTS) — free, no key required.
// Fetches 8-K, 10-Q, and 10-K filings from pharma companies in the past 7 days.

const SEC_PHARMA_QUERY = '"pharmaceutical" OR "oncology" OR "FDA approval" OR "clinical trial" OR "drug"';
const SEC_FILING_TYPES = ['8-K', '10-Q', '10-K'];

async function fetchSEC(sourceId: string, _config: ApiFetchConfig): Promise<RawArticle[]> {
  const sevenDaysAgo = offsetDate(-7);
  const today        = offsetDate(0);

  const params = new URLSearchParams({
    q:                   SEC_PHARMA_QUERY,
    forms:               SEC_FILING_TYPES.join(','),
    dateRange:           'custom',
    startdt:             sevenDaysAgo,
    enddt:               today,
    '_source':           'period_of_report,file_date,entity_name,form_type,file_num,ciks',
  });

  const url = `https://efts.sec.gov/LATEST/search-index?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`SEC EDGAR API failed: ${res.status}`);

  const json = await res.json() as { hits?: { hits?: SECHit[] } };
  const hits: SECHit[] = json?.hits?.hits ?? [];

  return hits.flatMap((hit) => {
    const src       = hit._source;
    const fileDate  = src.file_date ? new Date(src.file_date) : null;
    if (!fileDate || isNaN(fileDate.getTime())) return [];

    const accession = hit._id?.replace(/\//g, '-') ?? '';
    const cik       = src.ciks?.[0] ?? '';
    const formType  = src.form_type ?? '';
    const entity    = src.entity_name ?? 'Unknown Company';

    return [{
      sourceId,
      title:        `SEC ${formType}: ${entity}`,
      summary:      `${entity} filed a ${formType} with the SEC. Period of report: ${src.period_of_report ?? 'N/A'}.`,
      fullText:     null,
      canonicalUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${formType}&dateb=&owner=include&count=10`,
      author:       entity,
      publishedAt:  fileDate,
      filingType:   formType || null,
      filingCik:    cik || null,
    }] satisfies RawArticle[];
  });
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function parseYYYYMMDD(s: string): Date | null {
  if (s.length !== 8) return null;
  const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
  return isNaN(d.getTime()) ? null : d;
}

function offsetDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── openFDA types (minimal) ───────────────────────────────────────────────────

interface FDADrug {
  application_number?: string;
  sponsor_name?:       string;
  products?:           { brand_name?: string }[];
  submissions?:        FDASubmission[];
}

interface FDASubmission {
  submission_type?:          string;
  submission_number?:        string;
  submission_status?:        string;
  submission_status_date?:   string;
}

// ── SEC EDGAR types (minimal) ─────────────────────────────────────────────────

interface SECHit {
  _id:      string;
  _source:  {
    entity_name?:      string;
    file_date?:        string;
    form_type?:        string;
    period_of_report?: string;
    file_num?:         string;
    ciks?:             string[];
  };
}
