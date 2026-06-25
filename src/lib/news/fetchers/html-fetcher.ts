/**
 * Generic HTML fetcher.
 * Uses CSS selectors from FETCH_CONFIG to extract articles from any listing page.
 * Used for: BioSpace, and as the base for Q4/Intrado/newsroom fetchers.
 */

import * as cheerio from 'cheerio';
import type { RawArticle, HtmlFetchConfig } from '../types';

const USER_AGENT = 'SRIntelligence/1.0 (pharma news aggregator; contact@srinsights.com)';

export async function fetchHTML(
  sourceId: string,
  config: HtmlFetchConfig,
  baseUrl: string,
): Promise<RawArticle[]> {
  const res = await fetch(config.listingUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`HTML fetch failed for ${sourceId}: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  return parseListingPage(sourceId, html, config, baseUrl);
}

export function parseListingPage(
  sourceId: string,
  html: string,
  config: HtmlFetchConfig,
  baseUrl: string,
): RawArticle[] {
  const $ = cheerio.load(html);
  const { selectors } = config;
  const articles: RawArticle[] = [];

  $(selectors.list).each((_, el) => {
    const $el = $(el);

    const title = $el.find(selectors.title).first().text().trim();
    if (!title) return;

    const rawLink = $el.find(selectors.link).first().attr('href')
      ?? $el.find('a').first().attr('href')
      ?? '';
    const canonicalUrl = resolveUrl(rawLink, baseUrl);
    if (!canonicalUrl) return;

    const dateText = $el.find(selectors.date).first().text().trim()
      || $el.find(selectors.date).first().attr('datetime')
      || '';
    const publishedAt = parseDateText(dateText);
    if (!publishedAt) return;

    const summary = selectors.summary
      ? $el.find(selectors.summary).first().text().trim().slice(0, 1200) || null
      : null;

    articles.push({
      sourceId,
      title,
      summary,
      fullText:     null,
      canonicalUrl,
      author:       null,
      publishedAt,
    });
  });

  return articles;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function resolveUrl(href: string, baseUrl: string): string | null {
  if (!href) return null;
  href = href.trim();
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  if (href.startsWith('//')) return `https:${href}`;
  if (href.startsWith('/')) {
    try {
      const base = new URL(baseUrl);
      return `${base.protocol}//${base.host}${href}`;
    } catch {
      return null;
    }
  }
  return null;
}

export function parseDateText(text: string): Date | null {
  if (!text) return null;

  // Try native Date parse first (handles ISO 8601, RFC 2822, many locale formats)
  const direct = new Date(text);
  if (!isNaN(direct.getTime())) return direct;

  // Handle relative dates like "2 hours ago", "3 days ago"
  const relative = /(\d+)\s+(minute|hour|day|week|month)s?\s+ago/i.exec(text);
  if (relative) {
    const amount = parseInt(relative[1], 10);
    const unit   = relative[2].toLowerCase();
    const d      = new Date();
    if (unit === 'minute') d.setMinutes(d.getMinutes() - amount);
    if (unit === 'hour')   d.setHours(d.getHours() - amount);
    if (unit === 'day')    d.setDate(d.getDate() - amount);
    if (unit === 'week')   d.setDate(d.getDate() - amount * 7);
    if (unit === 'month')  d.setMonth(d.getMonth() - amount);
    return d;
  }

  return null;
}
