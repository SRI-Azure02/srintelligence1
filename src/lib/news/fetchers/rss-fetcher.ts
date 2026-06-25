import { XMLParser } from 'fast-xml-parser';
import type { RawArticle, RssFetchConfig } from '../types';

const USER_AGENT = 'SRIntelligence/1.0 (pharma news aggregator; contact@srinsights.com)';

const parser = new XMLParser({
  ignoreAttributes:    false,
  attributeNamePrefix: '@_',
  textNodeName:        '#text',
  isArray: (name) => ['item', 'entry'].includes(name),
});

export async function fetchRSS(
  sourceId: string,
  config: RssFetchConfig,
): Promise<RawArticle[]> {
  const res = await fetch(config.rssUrl, {
    headers: { 'User-Agent': USER_AGENT },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`RSS fetch failed for ${sourceId}: ${res.status} ${res.statusText}`);
  }

  const xml  = await res.text();
  const feed = parser.parse(xml);

  // Support RSS 2.0 (rss.channel.item[]) and Atom (feed.entry[])
  const channel = feed?.rss?.channel ?? feed?.feed ?? null;
  if (!channel) throw new Error(`Unrecognized feed format for ${sourceId}`);

  const items: unknown[] = channel.item ?? channel.entry ?? [];

  const articles: RawArticle[] = [];

  for (const item of items) {
    const i = item as Record<string, unknown>;

    const url  = extractUrl(i);
    const date = extractDate(i);

    if (!url || !date) continue;

    const title = stripHtml(coerceString(i.title)).trim();
    if (!title) continue;

    articles.push({
      sourceId,
      title,
      summary:      stripHtml(coerceString(i.description ?? i.summary ?? i.content)).slice(0, 1200) || null,
      fullText:     null,
      canonicalUrl: url,
      author:       coerceString(i.author ?? i['dc:creator']) || null,
      publishedAt:  date,
    });
  }

  return articles;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractUrl(i: Record<string, unknown>): string | null {
  // RSS 2.0: <link> or <guid isPermaLink="true">
  // Atom:    <link href="..."/>
  const raw = i.link ?? i.id ?? i.guid;
  if (!raw) return null;

  if (typeof raw === 'string') return raw.trim() || null;

  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const href = obj['@_href'] ?? obj['#text'];
    return href ? String(href).trim() : null;
  }

  return null;
}

function extractDate(i: Record<string, unknown>): Date | null {
  const raw = i.pubDate ?? i.published ?? i.updated ?? i['dc:date'];
  if (!raw) return null;
  // Normalize "3:11pm" → "3:11 PM" so V8 can parse it
  const normalized = String(raw).replace(/(\d{1,2}:\d{2})(am|pm)\b/gi, (_, t, p) => `${t} ${p.toUpperCase()}`);
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

function coerceString(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    // Handle <title><a href="...">text</a></title> — Fierce Pharma / Drupal pattern
    if (obj.a && typeof obj.a === 'object') {
      const a = obj.a as Record<string, unknown>;
      return String(a['#text'] ?? '').trim();
    }
    return String(obj['#text'] ?? obj['@_src'] ?? '');
  }
  return String(val);
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
