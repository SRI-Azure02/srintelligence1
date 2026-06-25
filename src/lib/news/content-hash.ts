import { createHash } from 'crypto';

/**
 * Deterministic dedup key: SHA-256 of "sourceId::canonicalUrl".
 * Matches the formula used in NEWS_KNOWN_URLS and the UNIQUE constraint
 * on NEWS_ARTICLES.CONTENT_HASH.
 */
export function computeContentHash(sourceId: string, canonicalUrl: string): string {
  return createHash('sha256')
    .update(`${sourceId}::${canonicalUrl.trim()}`)
    .digest('hex');
}
