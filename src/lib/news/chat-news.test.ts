/**
 * Phase B — Wire news into chat: 40 tests
 *
 * Groups:
 *   1. extractNewsEntities             (8)
 *   2. buildNewsWhereClause            (5)
 *   3. buildNewsFetchSQL               (5)
 *   4. mapNewsRows                     (8)
 *   5. buildNewsContextBlock           (7)
 *   6. fetchChatNews integration       (7)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractNewsEntities,
  buildNewsWhereClause,
  buildNewsFetchSQL,
  mapNewsRows,
  buildNewsContextBlock,
  fetchChatNews,
  type ChatNewsItem,
} from './chat-news';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<ChatNewsItem> = {}): ChatNewsItem {
  return {
    title: 'Pfizer Reports Strong Q2 Results',
    url: 'https://example.com/pfizer-q2',
    source: 'Pfizer Newsroom',
    publishedAt: '2025-07-15T12:00:00Z',
    summary: 'Pfizer announced strong second-quarter results driven by oncology.',
    drugNames: ['Paxlovid', 'Ibrance'],
    weight: 0.85,
    ...overrides,
  };
}

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    TITLE: 'AstraZeneca Wins FDA Approval',
    CANONICAL_URL: 'https://example.com/az-fda',
    SOURCE_NAME: 'AstraZeneca Media',
    PUBLISHED_AT: '2025-06-01T09:00:00Z',
    SUMMARY: 'AstraZeneca received FDA approval for tagrisso in early-stage NSCLC.',
    DRUG_NAMES: ['Tagrisso'],
    COMPUTED_WEIGHT: 0.92,
    ...overrides,
  };
}

const noopExec = vi.fn().mockResolvedValue({ rows: [] });

beforeEach(() => { vi.clearAllMocks(); });

// ── Group 1: extractNewsEntities ───────────────────────────────────────────────

describe('extractNewsEntities', () => {
  it('extracts company name ending in Pharma', () => {
    const entities = extractNewsEntities('Looking at Novartis Pharma pipeline trends');
    expect(entities.some((e) => e.includes('Novartis'))).toBe(true);
  });

  it('extracts company name ending in Corp', () => {
    const entities = extractNewsEntities('Pfizer Corp had strong earnings');
    expect(entities.some((e) => e.includes('Pfizer'))).toBe(true);
  });

  it('extracts company name ending in Therapeutics', () => {
    const entities = extractNewsEntities('Blueprint Medicines Therapeutics announced a trial');
    expect(entities.some((e) => /Medicines|Blueprint|Therapeutics/.test(e))).toBe(true);
  });

  it('extracts mAb-suffix drug names', () => {
    const entities = extractNewsEntities('How is Pembrolizumab performing in oncology?');
    expect(entities.some((e) => e.toLowerCase().includes('pembrolizumab'))).toBe(true);
  });

  it('extracts nib-suffix drug names', () => {
    const entities = extractNewsEntities('Show me data for Palbociclib this year');
    expect(entities.some((e) => e.toLowerCase().includes('palbociclib'))).toBe(true);
  });

  it('returns empty array for a message with no recognisable entities', () => {
    const entities = extractNewsEntities('what is the overall market trend?');
    expect(entities).toHaveLength(0);
  });

  it('deduplicates repeated entity mentions', () => {
    const entities = extractNewsEntities('Pfizer Corp and Pfizer Corp again');
    const pfizer = entities.filter((e) => e.includes('Pfizer'));
    expect(pfizer).toHaveLength(1);
  });

  it('caps result at 5 entities', () => {
    const msg = [
      'Pfizer Corp', 'Novartis Pharma', 'Roche Bio', 'Merck Inc',
      'AbbVie Therapeutics', 'Johnson Health',
    ].join(' vs ');
    const entities = extractNewsEntities(msg);
    expect(entities.length).toBeLessThanOrEqual(5);
  });
});

// ── Group 2: buildNewsWhereClause ──────────────────────────────────────────────

describe('buildNewsWhereClause', () => {
  it('returns empty string for no entities', () => {
    expect(buildNewsWhereClause([])).toBe('');
  });

  it('returns AND clause for one entity', () => {
    const clause = buildNewsWhereClause(['Pfizer']);
    expect(clause).toContain('AND');
    expect(clause).toContain('Pfizer');
    expect(clause).toContain('ILIKE');
  });

  it('joins multiple entities with OR', () => {
    const clause = buildNewsWhereClause(['Pfizer', 'Roche']);
    expect(clause).toContain('OR');
    expect(clause).toContain('Pfizer');
    expect(clause).toContain('Roche');
  });

  it('escapes single quotes in entity names', () => {
    const clause = buildNewsWhereClause(["D'Arcy Pharma"]);
    expect(clause).toContain("''");
  });

  it('wraps all conditions in a single AND (...) group', () => {
    const clause = buildNewsWhereClause(['A', 'B', 'C']);
    expect(clause).toMatch(/^AND \(/);
    expect(clause).toMatch(/\)$/);
  });
});

// ── Group 3: buildNewsFetchSQL ─────────────────────────────────────────────────

describe('buildNewsFetchSQL', () => {
  it('references the correct table', () => {
    const sql = buildNewsFetchSQL('');
    expect(sql).toContain('NEWS_ARTICLES_WEIGHTED');
  });

  it('filters IS_DUPLICATE = FALSE', () => {
    const sql = buildNewsFetchSQL('');
    expect(sql).toContain('IS_DUPLICATE');
    expect(sql).toContain('FALSE');
  });

  it('orders by COMPUTED_WEIGHT DESC', () => {
    const sql = buildNewsFetchSQL('');
    expect(sql).toContain('COMPUTED_WEIGHT DESC');
  });

  it('limits to MAX_ITEMS rows', () => {
    const sql = buildNewsFetchSQL('');
    expect(sql).toContain('LIMIT 5');
  });

  it('injects the entity clause when provided', () => {
    const clause = "AND (SOURCE_COMPANY ILIKE '%Pfizer%')";
    const sql = buildNewsFetchSQL(clause);
    expect(sql).toContain(clause);
  });
});

// ── Group 4: mapNewsRows ───────────────────────────────────────────────────────

describe('mapNewsRows', () => {
  it('maps TITLE field', () => {
    const items = mapNewsRows([makeRow()]);
    expect(items[0].title).toBe('AstraZeneca Wins FDA Approval');
  });

  it('maps CANONICAL_URL to url', () => {
    const items = mapNewsRows([makeRow()]);
    expect(items[0].url).toBe('https://example.com/az-fda');
  });

  it('maps SOURCE_NAME to source', () => {
    const items = mapNewsRows([makeRow()]);
    expect(items[0].source).toBe('AstraZeneca Media');
  });

  it('maps COMPUTED_WEIGHT to weight as number', () => {
    const items = mapNewsRows([makeRow({ COMPUTED_WEIGHT: '0.75' })]);
    expect(items[0].weight).toBe(0.75);
  });

  it('parses DRUG_NAMES when it arrives as JSON string (Rule 7)', () => {
    const items = mapNewsRows([makeRow({ DRUG_NAMES: '["Tagrisso","Imfinzi"]' })]);
    expect(items[0].drugNames).toEqual(['Tagrisso', 'Imfinzi']);
  });

  it('accepts DRUG_NAMES as an already-parsed array', () => {
    const items = mapNewsRows([makeRow({ DRUG_NAMES: ['Tagrisso'] })]);
    expect(items[0].drugNames).toEqual(['Tagrisso']);
  });

  it('returns empty drugNames for null DRUG_NAMES', () => {
    const items = mapNewsRows([makeRow({ DRUG_NAMES: null })]);
    expect(items[0].drugNames).toEqual([]);
  });

  it('returns null summary when SUMMARY is absent', () => {
    const items = mapNewsRows([makeRow({ SUMMARY: null })]);
    expect(items[0].summary).toBeNull();
  });
});

// ── Group 5: buildNewsContextBlock ─────────────────────────────────────────────

describe('buildNewsContextBlock', () => {
  it('returns empty string for no items', () => {
    expect(buildNewsContextBlock([])).toBe('');
  });

  it('contains opening header', () => {
    const block = buildNewsContextBlock([makeItem()]);
    expect(block).toContain('RECENT PHARMA NEWS');
  });

  it('contains closing footer', () => {
    const block = buildNewsContextBlock([makeItem()]);
    expect(block).toContain('END RECENT PHARMA NEWS');
  });

  it('includes article title', () => {
    const block = buildNewsContextBlock([makeItem({ title: 'Unique Title XYZ' })]);
    expect(block).toContain('Unique Title XYZ');
  });

  it('includes [News N] citation label', () => {
    const block = buildNewsContextBlock([makeItem()]);
    expect(block).toContain('[News 1]');
  });

  it('truncates long summaries to 200 chars with ellipsis', () => {
    const longSummary = 'A'.repeat(300);
    const block = buildNewsContextBlock([makeItem({ summary: longSummary })]);
    expect(block).toContain('…');
    // Verify the raw 300-char string is NOT present
    expect(block).not.toContain('A'.repeat(201));
  });

  it('includes citation instruction for agents', () => {
    const block = buildNewsContextBlock([makeItem()]);
    expect(block).toContain('[News N] citations');
  });
});

// ── Group 6: fetchChatNews integration ────────────────────────────────────────

describe('fetchChatNews', () => {
  it('returns empty string when executeQuery returns no rows', async () => {
    const exec = vi.fn().mockResolvedValue({ rows: [] });
    const result = await fetchChatNews('general market trends', exec);
    expect(result).toBe('');
  });

  it('returns non-empty block when rows are returned', async () => {
    const exec = vi.fn().mockResolvedValue({ rows: [makeRow()] });
    const result = await fetchChatNews('What is Pfizer doing?', exec);
    expect(result).toContain('RECENT PHARMA NEWS');
  });

  it('calls executeQuery with a SQL string', async () => {
    const exec = vi.fn().mockResolvedValue({ rows: [] });
    await fetchChatNews('some message', exec);
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('SELECT'));
  });

  it('retries without entity clause when first query returns empty and clause was set', async () => {
    // First call (with entity clause) → empty; second call (no clause) → rows
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [makeRow()] });
    const result = await fetchChatNews('Pfizer Corp pipeline update', exec);
    expect(exec).toHaveBeenCalledTimes(2);
    expect(result).toContain('RECENT PHARMA NEWS');
  });

  it('does NOT retry when no entity clause was built (only one call)', async () => {
    const exec = vi.fn().mockResolvedValue({ rows: [] });
    await fetchChatNews('general trends with no named companies', exec);
    // No entity clause → no retry
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('returns empty string on executeQuery error (fail-open)', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('Snowflake timeout'));
    const result = await fetchChatNews('anything', exec);
    expect(result).toBe('');
  });

  it('does not throw when executeQuery errors', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('network error'));
    await expect(fetchChatNews('anything', exec)).resolves.not.toThrow();
  });
});
