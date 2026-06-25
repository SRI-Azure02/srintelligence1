import { NextRequest, NextResponse } from 'next/server';
import { generateStoryReport, type StoryReportDocumentChunk } from '@/src/lib/llm/anthropic';
import { executeSQL } from '@/src/lib/snowflake/sql-api';
import { extractKeywords } from '@/src/lib/documents/query-router-agent';

// ── Phase C: Document retrieval helpers ───────────────────────────────────────

export function buildDocumentSearchSQL(keywords: string[]): string {
  const validKw = keywords
    .filter((k) => k.length >= 3)
    .slice(0, 5)
    .map((k) => k.replace(/'/g, "''"));
  if (validKw.length === 0) return '';

  const conditions = validKw.map((kw) => `c.CHUNK_TEXT ILIKE '%${kw}%'`).join('\n     OR ');

  return `
    SELECT c.CHUNK_TEXT, c.PAGE_NUMBER, c.SECTION_LABEL,
           d.FILE_NAME, d.FILE_TYPE, d.THERAPY_AREA, d.BRAND
    FROM CORTEX_TESTING.PUBLIC.DOCUMENT_CHUNKS c
    JOIN CORTEX_TESTING.PUBLIC.DOCUMENTS d ON c.DOCUMENT_ID = d.DOCUMENT_ID
    WHERE d.STATUS = 'indexed'
      AND NVL(d.IS_DELETED, FALSE) = FALSE
      AND (${conditions})
    LIMIT 5
  `.trim();
}

export function mapDocumentRows(rows: Record<string, unknown>[]): StoryReportDocumentChunk[] {
  return rows.map((row) => ({
    docName:      String(row.FILE_NAME ?? ''),
    fileType:     String(row.FILE_TYPE ?? 'pdf'),
    pageNumber:   Number(row.PAGE_NUMBER ?? 0),
    sectionLabel: row.SECTION_LABEL != null ? String(row.SECTION_LABEL) : null,
    chunkText:    String(row.CHUNK_TEXT ?? '').slice(0, 400),
    therapyArea:  row.THERAPY_AREA != null ? String(row.THERAPY_AREA) : null,
    brand:        row.BRAND != null ? String(row.BRAND) : null,
  }));
}

export function buildDocumentsContextBlock(chunks: StoryReportDocumentChunk[]): string {
  if (chunks.length === 0) return '';
  const lines = chunks.map((c, i) => {
    const cite = c.sectionLabel
      ? `[doc: ${c.docName}, p.${c.pageNumber}, ${c.sectionLabel}]`
      : `[doc: ${c.docName}, p.${c.pageNumber}]`;
    return `[${i + 1}] Cite using: ${cite}\n${c.chunkText.slice(0, 300)}`;
  });
  return lines.join('\n\n');
}

async function fetchRelevantDocuments(
  threadTitle: string,
  userQuestions: string[],
): Promise<StoryReportDocumentChunk[]> {
  try {
    const combined = [threadTitle, ...userQuestions].join(' ');
    const keywords = extractKeywords(combined);
    const sql = buildDocumentSearchSQL(keywords);
    if (!sql) return [];
    const result = await executeSQL(sql);
    return mapDocumentRows(result.rows as Record<string, unknown>[]);
  } catch {
    return [];
  }
}

interface IncomingMessage {
  role: string;
  content?: string;
  agentActivity?: { routedTo?: string };
  mTreeNarrative?: string;
  causalNarrative?: string;
  clusterNarrative?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      threadTitle: string;
      messages: IncomingMessage[];
    };

    const { threadTitle, messages } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
    }

    // Collect all agent narratives, including specialised narrative fields
    const agentResults = messages
      .filter((m) => m.role === 'agent')
      .map((m) => {
        const narrative = [
          m.content,
          m.mTreeNarrative,
          m.causalNarrative,
          m.clusterNarrative,
        ]
          .filter(Boolean)
          .join('\n\n')
          .trim();

        return {
          agentName: m.agentActivity?.routedTo ?? 'SRI Analytics Engine',
          narrative,
        };
      })
      .filter((r) => r.narrative.length > 30); // skip trivial / empty messages

    if (agentResults.length === 0) {
      return NextResponse.json(
        { error: 'No agent analysis results found to generate a report from.' },
        { status: 400 },
      );
    }

    const userQuestions = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content ?? '')
      .filter(Boolean);

    const documentChunks = await fetchRelevantDocuments(threadTitle, userQuestions);

    const report = await generateStoryReport({ threadTitle, agentResults, documentChunks });
    return NextResponse.json({ report });
  } catch (err) {
    console.error('[StoryReport] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Report generation failed' },
      { status: 500 },
    );
  }
}
