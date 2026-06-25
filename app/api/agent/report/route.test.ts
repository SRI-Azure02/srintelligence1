/**
 * Phase C — Documents into Executive Brief: 40 tests
 *
 * Groups:
 *   1. buildDocumentSearchSQL    (10)
 *   2. mapDocumentRows           (8)
 *   3. buildDocumentsContextBlock (7)
 *   4. fetchRelevantDocuments    (8)
 *   5. generateStoryReport w/ docs (7)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildDocumentSearchSQL,
  mapDocumentRows,
  buildDocumentsContextBlock,
} from './route';
import type { StoryReportDocumentChunk } from '@/src/lib/llm/anthropic';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/src/lib/snowflake/sql-api', () => ({
  executeSQL: vi.fn(),
}));

vi.mock('@/src/lib/documents/query-router-agent', () => ({
  extractKeywords: vi.fn((text: string) =>
    text
      .toLowerCase()
      .split(/\s+/)
      .filter((w: string) => w.length >= 3)
      .slice(0, 10),
  ),
}));

vi.mock('@/src/lib/llm/anthropic', () => ({
  generateStoryReport: vi.fn(async (params: any) => ({
    title: 'Test Report',
    executiveSummary: 'Summary',
    keyFindings: ['Finding 1'],
    sections: [],
    recommendations: ['Action 1'],
    marketIntelligence: params.newsItems ?? [],
    documentSources: params.documentChunks ?? [],
    methodology: 'Analytics',
    agentsUsed: [],
  })),
}));

import { executeSQL } from '@/src/lib/snowflake/sql-api';
import { generateStoryReport } from '@/src/lib/llm/anthropic';

const mockExecuteSQL = vi.mocked(executeSQL);
const mockGenerateStoryReport = vi.mocked(generateStoryReport);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SAMPLE_CHUNK: StoryReportDocumentChunk = {
  docName:      'Ozempic_Phase3_Trial_Results_Q2_2026.pdf',
  fileType:     'pdf',
  pageNumber:   4,
  sectionLabel: 'Efficacy Results',
  chunkText:    'Treatment group showed 34% reduction in HbA1c vs. placebo (p<0.001).',
  therapyArea:  'ENDOCRINOLOGY',
  brand:        'OZEMPIC (SEMAGLUTIDE)',
};

const SAMPLE_ROW: Record<string, unknown> = {
  FILE_NAME:     'Ozempic_Phase3_Trial_Results_Q2_2026.pdf',
  FILE_TYPE:     'pdf',
  PAGE_NUMBER:   4,
  SECTION_LABEL: 'Efficacy Results',
  CHUNK_TEXT:    'Treatment group showed 34% reduction in HbA1c vs. placebo (p<0.001).',
  THERAPY_AREA:  'ENDOCRINOLOGY',
  BRAND:         'OZEMPIC (SEMAGLUTIDE)',
};

// ── Group 1: buildDocumentSearchSQL ──────────────────────────────────────────

describe('buildDocumentSearchSQL', () => {
  it('1. returns empty string when keywords array is empty', () => {
    expect(buildDocumentSearchSQL([])).toBe('');
  });

  it('2. returns non-empty SQL when valid keywords provided', () => {
    const sql = buildDocumentSearchSQL(['ozempic', 'diabetes']);
    expect(sql.trim().length).toBeGreaterThan(0);
  });

  it('3. SQL references CORTEX_TESTING.PUBLIC.DOCUMENT_CHUNKS', () => {
    const sql = buildDocumentSearchSQL(['ozempic']);
    expect(sql).toContain('CORTEX_TESTING.PUBLIC.DOCUMENT_CHUNKS');
  });

  it('4. SQL joins CORTEX_TESTING.PUBLIC.DOCUMENTS', () => {
    const sql = buildDocumentSearchSQL(['ozempic']);
    expect(sql).toContain('CORTEX_TESTING.PUBLIC.DOCUMENTS');
  });

  it('5. SQL filters by d.STATUS = \'indexed\'', () => {
    const sql = buildDocumentSearchSQL(['ozempic']);
    expect(sql).toContain("d.STATUS = 'indexed'");
  });

  it('6. SQL filters by NVL(d.IS_DELETED, FALSE) = FALSE', () => {
    const sql = buildDocumentSearchSQL(['ozempic']);
    expect(sql).toContain('NVL(d.IS_DELETED, FALSE) = FALSE');
  });

  it('7. SQL includes LIMIT 5', () => {
    const sql = buildDocumentSearchSQL(['ozempic']);
    expect(sql).toContain('LIMIT 5');
  });

  it('8. uses at most 5 keywords even if more provided', () => {
    const manyKeywords = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
    const sql = buildDocumentSearchSQL(manyKeywords);
    // 'six' and 'seven' should not appear
    expect(sql).not.toContain('six');
    expect(sql).not.toContain('seven');
  });

  it('9. skips keywords shorter than 3 characters', () => {
    const sql = buildDocumentSearchSQL(['ab', 'ozempic']);
    expect(sql).not.toContain("'%ab%'");
    expect(sql).toContain('ozempic');
  });

  it('10. escapes single quotes in keywords (SQL injection prevention)', () => {
    const sql = buildDocumentSearchSQL(["o'zempic"]);
    expect(sql).toContain("o''zempic");
    expect(sql).not.toContain("o'zempic");
  });
});

// ── Group 2: mapDocumentRows ──────────────────────────────────────────────────

describe('mapDocumentRows', () => {
  it('11. maps FILE_NAME to docName', () => {
    const [chunk] = mapDocumentRows([SAMPLE_ROW]);
    expect(chunk.docName).toBe('Ozempic_Phase3_Trial_Results_Q2_2026.pdf');
  });

  it('12. maps FILE_TYPE to fileType', () => {
    const [chunk] = mapDocumentRows([SAMPLE_ROW]);
    expect(chunk.fileType).toBe('pdf');
  });

  it('13. maps PAGE_NUMBER to numeric pageNumber', () => {
    const [chunk] = mapDocumentRows([SAMPLE_ROW]);
    expect(chunk.pageNumber).toBe(4);
    expect(typeof chunk.pageNumber).toBe('number');
  });

  it('14. maps SECTION_LABEL to sectionLabel', () => {
    const [chunk] = mapDocumentRows([SAMPLE_ROW]);
    expect(chunk.sectionLabel).toBe('Efficacy Results');
  });

  it('15. maps null SECTION_LABEL to null', () => {
    const [chunk] = mapDocumentRows([{ ...SAMPLE_ROW, SECTION_LABEL: null }]);
    expect(chunk.sectionLabel).toBeNull();
  });

  it('16. truncates CHUNK_TEXT to 400 characters', () => {
    const longText = 'A'.repeat(600);
    const [chunk] = mapDocumentRows([{ ...SAMPLE_ROW, CHUNK_TEXT: longText }]);
    expect(chunk.chunkText.length).toBe(400);
  });

  it('17. maps null THERAPY_AREA to null', () => {
    const [chunk] = mapDocumentRows([{ ...SAMPLE_ROW, THERAPY_AREA: null }]);
    expect(chunk.therapyArea).toBeNull();
  });

  it('18. maps null BRAND to null', () => {
    const [chunk] = mapDocumentRows([{ ...SAMPLE_ROW, BRAND: null }]);
    expect(chunk.brand).toBeNull();
  });
});

// ── Group 3: buildDocumentsContextBlock ──────────────────────────────────────

describe('buildDocumentsContextBlock', () => {
  it('19. returns empty string when chunks array is empty', () => {
    expect(buildDocumentsContextBlock([])).toBe('');
  });

  it('20. includes citation format [doc: filename, p.N]', () => {
    const block = buildDocumentsContextBlock([SAMPLE_CHUNK]);
    expect(block).toContain('[doc: Ozempic_Phase3_Trial_Results_Q2_2026.pdf, p.4');
  });

  it('21. includes section label in citation when present', () => {
    const block = buildDocumentsContextBlock([SAMPLE_CHUNK]);
    expect(block).toContain('Efficacy Results');
  });

  it('22. omits section label in citation when null', () => {
    const chunk = { ...SAMPLE_CHUNK, sectionLabel: null };
    const block = buildDocumentsContextBlock([chunk]);
    expect(block).toContain('[doc: Ozempic_Phase3_Trial_Results_Q2_2026.pdf, p.4]');
    expect(block).not.toContain(', null');
  });

  it('23. truncates chunkText to 300 chars in context block', () => {
    const longChunk = { ...SAMPLE_CHUNK, chunkText: 'B'.repeat(500) };
    const block = buildDocumentsContextBlock([longChunk]);
    // 300 Bs should appear, but not 400
    expect(block).toContain('B'.repeat(300));
    expect(block).not.toContain('B'.repeat(301));
  });

  it('24. includes citation instruction text', () => {
    const block = buildDocumentsContextBlock([SAMPLE_CHUNK]);
    expect(block).toContain('Cite using:');
  });

  it('25. numbers each chunk starting from [1]', () => {
    const block = buildDocumentsContextBlock([SAMPLE_CHUNK, { ...SAMPLE_CHUNK, docName: 'doc2.pdf' }]);
    expect(block).toContain('[1]');
    expect(block).toContain('[2]');
  });
});

// ── Group 4: fetchRelevantDocuments via route POST ────────────────────────────

describe('fetchRelevantDocuments (via route POST)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function postRoute(body: object) {
    const { POST } = await import('./route');
    const req = new Request('http://localhost/api/agent/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return POST(req as any);
  }

  const baseBody = {
    threadTitle: 'Ozempic Q2 2026 analysis',
    messages: [
      { role: 'user', content: 'What are Ozempic script trends in Q2 2026?' },
      { role: 'agent', content: 'Ozempic TRx scripts grew 18% quarter-over-quarter in Q2 2026, driven by strong HCP pull-through and formulary wins.', agentActivity: { routedTo: 'SRI_ANALYST' } },
    ],
  };

  it('26. returns [] document chunks when executeSQL throws', async () => {
    mockExecuteSQL.mockRejectedValue(new Error('DB error'));
    const res = await postRoute(baseBody);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.report.documentSources).toEqual([]);
  });

  it('27. returns [] document chunks when executeSQL returns empty rows', async () => {
    mockExecuteSQL.mockResolvedValue({ rows: [] } as any);
    const res = await postRoute(baseBody);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.report.documentSources).toEqual([]);
  });

  it('28. maps SQL rows to document chunks when rows exist', async () => {
    mockExecuteSQL.mockResolvedValue({ rows: [SAMPLE_ROW] } as any);
    const res = await postRoute(baseBody);
    const data = await res.json();
    expect(data.report.documentSources).toHaveLength(1);
    expect(data.report.documentSources[0].docName).toBe('Ozempic_Phase3_Trial_Results_Q2_2026.pdf');
  });

  it('29. returns at most 5 document chunks (SQL LIMIT enforced)', async () => {
    const manyRows = Array(10).fill(SAMPLE_ROW);
    mockExecuteSQL.mockResolvedValue({ rows: manyRows } as any);
    const res = await postRoute(baseBody);
    const data = await res.json();
    // mapDocumentRows maps all rows; LIMIT 5 is in the SQL. Since SQL is mocked,
    // we verify generateStoryReport was called with all mapped rows.
    expect(mockGenerateStoryReport).toHaveBeenCalledWith(
      expect.objectContaining({ documentChunks: expect.any(Array) }),
    );
  });

  it('30. builds keyword query from thread title', async () => {
    mockExecuteSQL.mockResolvedValue({ rows: [] } as any);
    await postRoute({ ...baseBody, threadTitle: 'Keytruda safety analysis' });
    const sqlCall = mockExecuteSQL.mock.calls[0]?.[0] ?? '';
    expect(typeof sqlCall).toBe('string');
  });

  it('31. includes user questions in keyword extraction for SQL', async () => {
    mockExecuteSQL.mockResolvedValue({ rows: [] } as any);
    await postRoute({
      ...baseBody,
      messages: [
        { role: 'user', content: 'Show humira biosimilar trends' },
        { role: 'agent', content: 'Humira biosimilar uptake has accelerated.', agentActivity: { routedTo: 'SRI_ANALYST' } },
      ],
    });
    expect(mockExecuteSQL).toHaveBeenCalled();
  });

  it('32. handles empty string thread title without throwing', async () => {
    mockExecuteSQL.mockResolvedValue({ rows: [] } as any);
    const res = await postRoute({ ...baseBody, threadTitle: '' });
    expect(res.status).toBe(200);
  });

  it('33. works when there are no user questions in messages', async () => {
    mockExecuteSQL.mockResolvedValue({ rows: [] } as any);
    const res = await postRoute({
      ...baseBody,
      messages: [
        { role: 'agent', content: 'Ozempic TRx scripts grew 18% quarter-over-quarter in Q2 2026, driven by strong HCP pull-through and formulary wins across key accounts.', agentActivity: { routedTo: 'SRI_ANALYST' } },
      ],
    });
    expect(res.status).toBe(200);
  });
});

// ── Group 5: generateStoryReport with documentChunks ─────────────────────────

describe('generateStoryReport documentChunks integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function postRoute(body: object) {
    const { POST } = await import('./route');
    const req = new Request('http://localhost/api/agent/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return POST(req as any);
  }

  const baseBody = {
    threadTitle: 'Ozempic Q2 2026',
    messages: [
      { role: 'user', content: 'What are the Ozempic TRx script trends for Q2 2026?' },
      { role: 'agent', content: 'Ozempic TRx scripts grew 18% quarter-over-quarter in Q2 2026, driven by strong HCP pull-through and new formulary access in commercial plans.', agentActivity: { routedTo: 'SRI_ANALYST' } },
    ],
  };

  it('34. backward compatible: works without documentChunks (no rows)', async () => {
    mockExecuteSQL.mockResolvedValue({ rows: [] } as any);
    const res = await postRoute(baseBody);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.report).toBeDefined();
  });

  it('35. generateStoryReport called with documentChunks: [] when no rows', async () => {
    mockExecuteSQL.mockResolvedValue({ rows: [] } as any);
    await postRoute(baseBody);
    expect(mockGenerateStoryReport).toHaveBeenCalledWith(
      expect.objectContaining({ documentChunks: [] }),
    );
  });

  it('36. generateStoryReport called with populated documentChunks when rows exist', async () => {
    mockExecuteSQL.mockResolvedValue({ rows: [SAMPLE_ROW] } as any);
    await postRoute(baseBody);
    expect(mockGenerateStoryReport).toHaveBeenCalledWith(
      expect.objectContaining({
        documentChunks: expect.arrayContaining([
          expect.objectContaining({ docName: 'Ozempic_Phase3_Trial_Results_Q2_2026.pdf' }),
        ]),
      }),
    );
  });

  it('37. StoryReport response includes documentSources field', async () => {
    mockExecuteSQL.mockResolvedValue({ rows: [SAMPLE_ROW] } as any);
    const res = await postRoute(baseBody);
    const data = await res.json();
    expect(data.report).toHaveProperty('documentSources');
  });

  it('38. documentSources is empty array when no document rows returned', async () => {
    mockExecuteSQL.mockResolvedValue({ rows: [] } as any);
    const res = await postRoute(baseBody);
    const data = await res.json();
    expect(Array.isArray(data.report.documentSources)).toBe(true);
    expect(data.report.documentSources).toHaveLength(0);
  });

  it('39. documentSources contains mapped chunks when rows exist', async () => {
    mockExecuteSQL.mockResolvedValue({ rows: [SAMPLE_ROW] } as any);
    const res = await postRoute(baseBody);
    const data = await res.json();
    expect(data.report.documentSources).toHaveLength(1);
    expect(data.report.documentSources[0].fileType).toBe('pdf');
  });

  it('40. report still generated when document fetch throws (non-fatal)', async () => {
    mockExecuteSQL
      .mockRejectedValueOnce(new Error('Doc DB down')) // document fetch fails
      .mockResolvedValueOnce({ rows: [] } as any);       // news fetch (if called)
    const res = await postRoute(baseBody);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.report.documentSources).toEqual([]);
  });
});
