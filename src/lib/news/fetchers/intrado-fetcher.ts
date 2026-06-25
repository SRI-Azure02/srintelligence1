/**
 * Intrado (Notified) IR platform fetcher.
 *
 * Sites using Intrado: Pfizer (investors.pfizer.com), JNJ (investor.jnj.com),
 * Merck & Co. (investors.merck.com).
 *
 * Intrado IR pages embed press releases inside elements with
 * data-module="PressRelease" or class "nir-widget". They also expose a
 * JSON feed at a predictable path: /news-releases/_ajax?format=json
 * This fetcher tries the JSON API path first, then falls back to HTML.
 */

import * as cheerio from 'cheerio';
import { resolveUrl, parseDateText } from './html-fetcher';
import type { RawArticle, HtmlFetchConfig } from '../types';

const USER_AGENT = 'SRIntelligence/1.0 (pharma news aggregator; contact@srinsights.com)';

export async function fetchIntrado(
  sourceId: string,
  config: HtmlFetchConfig,
  baseUrl: string,
): Promise<RawArticle[]> {
  // ── Path 1: Try Intrado JSON feed ──────────────────────────────────────────
  try {
    const jsonArticles = await fetchIntradoJSON(sourceId, config.listingUrl, baseUrl);
    if (jsonArticles.length > 0) return jsonArticles;
  } catch {
    // fall through to HTML scrape
  }

  // ── Path 2: HTML scrape ────────────────────────────────────────────────────
  const res = await fetch(config.listingUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Intrado fetch failed for ${sourceId}: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  return extractFromIntradoHTML(sourceId, html, config, baseUrl);
}

async function fetchIntradoJSON(
  sourceId: string,
  listingUrl: string,
  baseUrl: string,
): Promise<RawArticle[]> {
  // Intrado exposes a lightweight JSON endpoint used by its own widgets
  const jsonUrl = listingUrl.replace(/\/?$/, '') + '/_ajax?format=json&pageSize=50';
  const res = await fetch(jsonUrl, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`Intrado JSON ${res.status}`);
  if (!res.headers.get('content-type')?.includes('json')) throw new Error('Not JSON');

  const json = await res.json() as IntradoFeed;
  const items = json?.releases ?? json?.items ?? json?.data ?? [];

  return items.flatMap((item) => {
    const title = String(item.title ?? item.headline ?? '').trim();
    if (!title) return [];

    const url = resolveUrl(String(item.url ?? item.link ?? ''), baseUrl);
    if (!url) return [];

    const date = parseDateText(String(item.date ?? item.publishedDate ?? item.releaseDate ?? ''));
    if (!date) return [];

    return [{
      sourceId,
      title,
      summary:      String(item.summary ?? item.excerpt ?? '').slice(0, 1200) || null,
      fullText:     null,
      canonicalUrl: url,
      author:       null,
      publishedAt:  date,
    }] satisfies RawArticle[];
  });
}

function extractFromIntradoHTML(
  sourceId: string,
  html: string,
  config: HtmlFetchConfig,
  baseUrl: string,
): RawArticle[] {
  const $ = cheerio.load(html);
  const { selectors } = config;
  const articles: RawArticle[] = [];

  // Intrado fallback selectors (in priority order)
  const listSel    = selectors.list    || '[data-module="PressRelease"], .nir-widget--press-release-list li, .press-release-item';
  const titleSel   = selectors.title   || 'h3, h2, .title';
  const linkSel    = selectors.link    || 'a';
  const dateSel    = selectors.date    || 'time, .date, [data-date]';
  const summarySel = selectors.summary || 'p, .summary';

  $(listSel).each((_, el) => {
    const $el = $(el);

    const title = $el.find(titleSel).first().text().trim();
    if (!title) return;

    const rawLink     = $el.find(linkSel).first().attr('href') ?? '';
    const canonicalUrl = resolveUrl(rawLink, baseUrl);
    if (!canonicalUrl) return;

    const dateText = $el.find(dateSel).first().attr('datetime')
      || $el.find('[data-date]').first().attr('data-date')
      || $el.find(dateSel).first().text().trim();
    const publishedAt = parseDateText(dateText);
    if (!publishedAt) return;

    const summary = $el.find(summarySel).first().text().trim().slice(0, 1200) || null;

    articles.push({ sourceId, title, summary, fullText: null, canonicalUrl, author: null, publishedAt });
  });

  return articles;
}

// ── Intrado JSON feed types (minimal) ─────────────────────────────────────────

interface IntradoRelease {
  title?:        string;
  headline?:     string;
  url?:          string;
  link?:         string;
  date?:         string;
  publishedDate?: string;
  releaseDate?:  string;
  summary?:      string;
  excerpt?:      string;
}

interface IntradoFeed {
  releases?: IntradoRelease[];
  items?:    IntradoRelease[];
  data?:     IntradoRelease[];
}
