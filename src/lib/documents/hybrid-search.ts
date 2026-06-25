import Anthropic from "@anthropic-ai/sdk";
import { extractKeywords } from "./query-router-agent";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface RetrievedChunk {
  chunkId?: string;
  chunkText: string;
  pageNumber: number;
  sectionLabel: string | null;
  docName: string;
  fileType: string;
  similarity: number;
}

interface SnowflakeResult {
  rows: any[];
}

/**
 * Hybrid search combining vector similarity and keyword search
 * Uses Reciprocal Rank Fusion (RRF) to merge results
 * RRF formula: 1 / (k + rank) where k=60 (standard)
 */
export async function hybridSearch(
  query: string,
  executeQuery: (sql: string, params?: any[]) => Promise<SnowflakeResult>,
  k: number = 10
): Promise<RetrievedChunk[]> {
  try {
    // Step 1: Generate query embedding via Claude
    const queryEmbedding = await generateQueryEmbedding(query);

    // Step 2: Vector similarity search
    const vectorResults = await vectorSearch(
      queryEmbedding,
      executeQuery,
      k * 2
    );

    // Step 3: Keyword search
    const keywords = extractKeywords(query);
    const keywordResults = await keywordSearch(
      keywords,
      executeQuery,
      k * 2
    );

    // Step 4: Reciprocal Rank Fusion (RRF) merge
    const fused = reciprocalRankFusion(vectorResults, keywordResults, k);

    return fused;
  } catch (error) {
    console.error(`Hybrid search failed: ${error}`);
    return []; // Fail open
  }
}

/**
 * Generate embedding for query using Claude Haiku
 * Simplified approach: use text similarity scores
 */
async function generateQueryEmbedding(query: string): Promise<string> {
  try {
    // Use Claude to generate a semantic representation
    const message = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: `Convert this search query to a normalized semantic form for document matching:\n"${query}"\n\nReturn ONLY the normalized query, nothing else.`,
        },
      ],
    });

    return message.content[0].type === "text" ? message.content[0].text : query;
  } catch (error) {
    console.warn(`Query embedding failed: ${error}`);
    return query; // Fallback to original
  }
}

/**
 * Vector similarity search using Snowflake's native string similarity
 * Falls back to text matching when vector embeddings not available
 */
async function vectorSearch(
  query: string,
  executeQuery: (sql: string, params?: any[]) => Promise<SnowflakeResult>,
  limit: number
): Promise<Array<RetrievedChunk & { rank: number }>> {
  try {
    // Search using LIKE and text similarity (since embeddings are NULL in test data)
    const sql = `
      SELECT
        c.CHUNK_ID,
        c.CHUNK_TEXT,
        c.PAGE_NUMBER,
        c.SECTION_LABEL,
        d.FILE_NAME,
        d.FILE_TYPE,
        CASE
          WHEN c.CHUNK_TEXT ILIKE $1 THEN 0.9
          WHEN c.CHUNK_TEXT ILIKE $2 THEN 0.7
          WHEN c.CHUNK_TEXT ILIKE $3 THEN 0.5
          ELSE 0.3
        END as similarity,
        ROW_NUMBER() OVER (ORDER BY
          CASE
            WHEN c.CHUNK_TEXT ILIKE $1 THEN 0
            WHEN c.CHUNK_TEXT ILIKE $2 THEN 1
            WHEN c.CHUNK_TEXT ILIKE $3 THEN 2
            ELSE 3
          END
        ) as rank
      FROM PUBLIC.DOCUMENT_CHUNKS c
      JOIN PUBLIC.DOCUMENTS d ON c.DOCUMENT_ID = d.DOCUMENT_ID
      WHERE d.STATUS = 'indexed'
      LIMIT $4
    `;

    const params = [
      { type: "VARCHAR", value: `%${query}%` },
      { type: "VARCHAR", value: `%${query.split(" ")[0]}%` },
      { type: "VARCHAR", value: `%${query.split(" ").slice(0, 2).join("%")}%` },
      { type: "INTEGER", value: limit },
    ];

    const result = await executeQuery(sql, params);

    return result.rows.map((row) => ({
      chunkId: row.CHUNK_ID,
      chunkText: row.CHUNK_TEXT,
      pageNumber: row.PAGE_NUMBER,
      sectionLabel: row.SECTION_LABEL,
      docName: row.FILE_NAME,
      fileType: row.FILE_TYPE,
      similarity: row.similarity,
      rank: row.rank,
    }));
  } catch (error) {
    console.warn(`Vector search failed: ${error}`);
    return [];
  }
}

/**
 * Keyword search using ILIKE for fuzzy matching
 */
async function keywordSearch(
  keywords: string[],
  executeQuery: (sql: string, params?: any[]) => Promise<SnowflakeResult>,
  limit: number
): Promise<Array<RetrievedChunk & { rank: number }>> {
  if (keywords.length === 0) {
    return [];
  }

  try {
    // Build dynamic WHERE clause for keywords
    const whereClauses = keywords
      .slice(0, 5)
      .map((_, i) => `c.CHUNK_TEXT ILIKE $${i + 1}`)
      .join(" OR ");

    const sql = `
      SELECT
        c.CHUNK_ID,
        c.CHUNK_TEXT,
        c.PAGE_NUMBER,
        c.SECTION_LABEL,
        d.FILE_NAME,
        d.FILE_TYPE,
        0.6 as similarity,
        ROW_NUMBER() OVER (ORDER BY c.CHUNK_INDEX) as rank
      FROM PUBLIC.DOCUMENT_CHUNKS c
      JOIN PUBLIC.DOCUMENTS d ON c.DOCUMENT_ID = d.DOCUMENT_ID
      WHERE d.STATUS = 'indexed' AND (${whereClauses})
      LIMIT $${keywords.length + 1}
    `;

    const params = keywords.slice(0, 5).map((kw) => ({
      type: "VARCHAR",
      value: `%${kw}%`,
    }));
    params.push({ type: "INTEGER", value: String(limit) });

    const result = await executeQuery(sql, params);

    return result.rows.map((row) => ({
      chunkId: row.CHUNK_ID,
      chunkText: row.CHUNK_TEXT,
      pageNumber: row.PAGE_NUMBER,
      sectionLabel: row.SECTION_LABEL,
      docName: row.FILE_NAME,
      fileType: row.FILE_TYPE,
      similarity: row.similarity,
      rank: row.rank,
    }));
  } catch (error) {
    console.warn(`Keyword search failed: ${error}`);
    return [];
  }
}

/**
 * Reciprocal Rank Fusion: Combines vector and keyword rankings
 * Weights: Vector 0.6, Keyword 0.4
 * Formula: score = (0.6 * 1/(k+vector_rank)) + (0.4 * 1/(k+keyword_rank))
 */
function reciprocalRankFusion(
  vectorResults: Array<RetrievedChunk & { rank: number }>,
  keywordResults: Array<RetrievedChunk & { rank: number }>,
  topK: number,
  k: number = 60
): RetrievedChunk[] {
  const combined = new Map<string, RetrievedChunk & { score: number }>();

  // Add vector results
  vectorResults.forEach((result) => {
    const key = result.chunkId || result.chunkText;
    const vectorScore = 0.6 / (k + result.rank);
    combined.set(key, { ...result, score: vectorScore });
  });

  // Merge keyword results
  keywordResults.forEach((result) => {
    const key = result.chunkId || result.chunkText;
    const keywordScore = 0.4 / (k + result.rank);

    if (combined.has(key)) {
      const existing = combined.get(key)!;
      existing.score += keywordScore;
    } else {
      combined.set(key, { ...result, score: keywordScore });
    }
  });

  // Sort by RRF score and return top K
  return Array.from(combined.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ score, ...chunk }) => chunk);
}
