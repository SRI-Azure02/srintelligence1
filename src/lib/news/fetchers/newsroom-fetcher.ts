/**
 * Generic corporate newsroom fetcher.
 *
 * Used for all corporate media rooms and IR pages that don't run on Q4 or Intrado.
 * Wraps the generic HTML fetcher but adds two extra strategies when the
 * configured selectors return zero results:
 *
 *   1. JSON-LD structured data (<script type="application/ld+json">) — many
 *      modern corporate sites embed Article/NewsArticle schema markup.
 *   2. Open Graph meta tags — used as a last-resort for single-article pages
 *      linked from a listing page.
 *
 * Covers: Roche, Novartis, Sanofi, AstraZeneca, GSK, BMS, Novo Nordisk,
 *         Bayer, Merck KGaA, Takeda, Teva, CSL, Boehringer Ingelheim,
 *         JNJ Media, Pfizer Media, Lilly Media, Merck Media, AbbVie Media,
 *         Amgen Media, Gilead Media.
 */

import * as cheerio from 'cheerio';
import { resolveUrl, parseDateText, parseListingPage } from './html-fetcher';
import type { RawArticle, HtmlFetchConfig } from '../types';

const USER_AGENT = 'SRIntelligence/1.0 (pharma news aggregator; contact@srinsights.com)';

export async function fetchNewsroom(
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
    throw new Error(`Newsroom fetch failed for ${sourceId}: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();

  // ── Strategy 1: Configured CSS selectors ────────────────────────────────────
  const fromSelectors = parseListingPage(sourceId, html, config, baseUrl);
  if (fromSelectors.length > 0) return fromSelectors;

  // ── Strategy 2: JSON-LD structured data ─────────────────────────────────────
  const fromJsonLd = extractFromJsonLD(sourceId, html, baseUrl);
  if (fromJsonLd.length > 0) return fromJsonLd;

  // ── Strategy 3: Common newsroom patterns (heuristic fallback) ───────────────
  return extractFromHeuristics(sourceId, html, baseUrl);
}

function extractFromJsonLD(
  sourceId: string,
  html: string,
  baseUrl: string,
): RawArticle[] {
  const $ = cheerio.load(html);
  const articles: RawArticle[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw  = $(el).html() ?? '';
      const data = JSON.parse(raw);

      // May be a single object or an array
      const items: unknown[] = Array.isArray(data) ? data : [data];

      for (const item of items) {
        const i = item as Record<string, unknown>;
        const type = String(i['@type'] ?? '');

        // Accept Article, NewsArticle, BlogPosting, PressRelease
        if (!/(article|newsarticle|blogposting|pressrelease)/i.test(type)) continue;

        const title = String(i.headline ?? i.name ?? '').trim();
        if (!title) continue;

        const rawUrl = String(i.url ?? i.mainEntityOfPage ?? '').trim();
        const url    = resolveUrl(rawUrl, baseUrl);
        if (!url) continue;

        const rawDate = String(i.datePublished ?? i.dateCreated ?? '').trim();
        const date    = parseDateText(rawDate);
        if (!date) continue;

        const summary = String(
          i.description ?? i.abstract ?? ''
        ).slice(0, 1200) || null;

        const author = extractAuthorName(i.author);

        articles.push({
          sourceId,
          title,
          summary,
          fullText:     null,
          canonicalUrl: url,
          author,
          publishedAt:  date,
        });
      }
    } catch {
      // malformed JSON-LD — skip this block
    }
  });

  return articles;
}

function extractFromHeuristics(
  sourceId: string,
  html: string,
  baseUrl: string,
): RawArticle[] {
  const $ = cheerio.load(html);
  const articles: RawArticle[] = [];

  // Common newsroom list patterns across major pharma sites
  const listPatterns = [
    'article',
    '[class*="news-item"]',
    '[class*="press-release"]',
    '[class*="media-release"]',
    '[class*="news-card"]',
    '[class*="news-listing"] li',
    '[class*="newsroom"] li',
    '.entry',
  ].join(', ');

  $(listPatterns).each((_, el) => {
    const $el = $(el);

    // Skip navigation/header/footer elements
    if ($el.parents('nav, header, footer, aside').length) return;

    const $link  = $el.find('a[href]').first();
    const rawUrl = $link.attr('href') ?? '';
    const url    = resolveUrl(rawUrl, baseUrl);
    if (!url) return;

    // Title: prefer heading text, fall back to link text
    const title = ($el.find('h1, h2, h3, h4').first().text()
      || $link.text()).trim();
    if (!title || title.length < 10) return;

    // Date: look for <time>, data-date, or text matching common date patterns
    const $time = $el.find('time').first();
    const dateText = $time.attr('datetime')
      || $time.text().trim()
      || $el.find('[data-date], [data-published], .date, .published').first().text().trim()
      || extractDateFromText($el.text());
    const date = parseDateText(dateText);
    if (!date) return;

    const summary = $el.find('p').first().text().trim().slice(0, 1200) || null;

    articles.push({
      sourceId,
      title,
      summary,
      fullText:     null,
      canonicalUrl: url,
      author:       null,
      publishedAt:  date,
    });
  });

  // Dedup by URL within this batch
  const seen = new Set<string>();
  return articles.filter((a) => {
    if (seen.has(a.canonicalUrl)) return false;
    seen.add(a.canonicalUrl);
    return true;
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractAuthorName(author: unknown): string | null {
  if (!author) return null;
  if (typeof author === 'string') return author.trim() || null;
  if (typeof author === 'object') {
    const a = author as Record<string, unknown>;
    return String(a.name ?? '').trim() || null;
  }
  return null;
}

// Looks for a date-like string inside arbitrary text (last resort)
const DATE_RE = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b/i;

function extractDateFromText(text: string): string {
  return DATE_RE.exec(text)?.[0] ?? '';
}
