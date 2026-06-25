/**
 * Q4 Inc. IR platform fetcher.
 *
 * Sites using Q4: Eli Lilly (investor.lilly.com), AbbVie (investors.abbvie.com),
 * Amgen (investors.amgen.com), Gilead (investors.gilead.com).
 *
 * Q4 pages embed press releases in a consistent structure — either server-rendered
 * HTML with class "q4-ir-press-releases__item", or a JSON payload in a
 * <script id="__NEXT_DATA__"> block (when the site uses Q4's Next.js shell).
 * This fetcher tries the JSON path first (faster, more reliable) and falls back
 * to HTML scraping.
 */

import * as cheerio from 'cheerio';
import { resolveUrl, parseDateText } from './html-fetcher';
import type { RawArticle, HtmlFetchConfig } from '../types';

const USER_AGENT = 'SRIntelligence/1.0 (pharma news aggregator; contact@srinsights.com)';

export async function fetchQ4(
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
    throw new Error(`Q4 fetch failed for ${sourceId}: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();

  // ── Path 1: __NEXT_DATA__ JSON payload ──────────────────────────────────────
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const articles = extractFromNextData(sourceId, nextData, baseUrl);
      if (articles.length > 0) return articles;
    } catch {
      // fall through to HTML scrape
    }
  }

  // ── Path 2: Server-rendered Q4 HTML ─────────────────────────────────────────
  return extractFromQ4HTML(sourceId, html, config, baseUrl);
}

function extractFromNextData(
  sourceId: string,
  nextData: Record<string, unknown>,
  baseUrl: string,
): RawArticle[] {
  // Q4's Next.js shell stores press releases under:
  // pageProps.pressReleases[] or pageProps.items[] or pageProps.data.items[]
  const pageProps = (nextData as { props?: { pageProps?: Record<string, unknown> } })
    ?.props?.pageProps ?? {};

  const candidates: unknown[] =
    (pageProps.pressReleases as unknown[]) ??
    (pageProps.items         as unknown[]) ??
    ((pageProps.data as Record<string, unknown>)?.items as unknown[]) ??
    [];

  return candidates.flatMap((item) => {
    const i = item as Record<string, unknown>;

    const title = String(i.title ?? i.headline ?? '').trim();
    if (!title) return [];

    const path = String(i.url ?? i.href ?? i.slug ?? '').trim();
    const url  = resolveUrl(path, baseUrl);
    if (!url) return [];

    const rawDate = String(i.date ?? i.publishDate ?? i.releaseDate ?? '').trim();
    const date    = parseDateText(rawDate);
    if (!date) return [];

    return [{
      sourceId,
      title,
      summary:      String(i.summary ?? i.excerpt ?? i.body ?? '').slice(0, 1200) || null,
      fullText:     null,
      canonicalUrl: url,
      author:       null,
      publishedAt:  date,
    }] satisfies RawArticle[];
  });
}

function extractFromQ4HTML(
  sourceId: string,
  html: string,
  config: HtmlFetchConfig,
  baseUrl: string,
): RawArticle[] {
  const $          = cheerio.load(html);
  const { selectors } = config;
  const articles: RawArticle[] = [];

  // Q4 server-rendered fallback selectors (in priority order)
  const listSel    = selectors.list    || '.q4-ir-press-releases__item, .pressReleaseItem, li.press-release';
  const titleSel   = selectors.title   || '.q4-ir-press-releases__title, h3, h2';
  const linkSel    = selectors.link    || 'a';
  const dateSel    = selectors.date    || '.q4-ir-press-releases__date, .date, time';
  const summarySel = selectors.summary || '.q4-ir-press-releases__body, p';

  $(listSel).each((_, el) => {
    const $el = $(el);

    const title = $el.find(titleSel).first().text().trim();
    if (!title) return;

    const rawLink     = $el.find(linkSel).first().attr('href') ?? '';
    const canonicalUrl = resolveUrl(rawLink, baseUrl);
    if (!canonicalUrl) return;

    const dateText  = $el.find(dateSel).first().attr('datetime')
      || $el.find(dateSel).first().text().trim();
    const publishedAt = parseDateText(dateText);
    if (!publishedAt) return;

    const summary = $el.find(summarySel).first().text().trim().slice(0, 1200) || null;

    articles.push({ sourceId, title, summary, fullText: null, canonicalUrl, author: null, publishedAt });
  });

  return articles;
}
