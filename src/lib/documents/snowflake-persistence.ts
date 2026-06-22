import { IngestionState } from "./ingestion-agent";
import { SemanticChunk } from "./extractors/types";

/**
 * Snowflake persistence layer for document ingestion
 * Handles embedding generation, deduplication, and storage
 */

interface SnowflakeClient {
  executeQuery(sql: string, params?: any[]): Promise<{ rows: any[] }>;
}

/**
 * Check if document already exists by content hash
 */
export async function checkDuplicateInSnowflake(
  contentHash: string,
  sf: SnowflakeClient
): Promise<boolean> {
  try {
    const result = await sf.executeQuery(
      `SELECT DOCUMENT_ID FROM PUBLIC.DOCUMENTS
       WHERE CONTENT_HASH = ?
       LIMIT 1`,
      [contentHash]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.warn(`Duplicate check failed: ${error}`);
    return false; // Fail open - allow persistence to continue
  }
}

/**
 * Generate embeddings for chunks using Snowflake Cortex EMBED_TEXT_768
 */
export async function generateChunkEmbeddings(
  chunks: SemanticChunk[],
  sf: SnowflakeClient
): Promise<(number[] | null)[]> {
  const embeddings: (number[] | null)[] = [];

  for (const chunk of chunks) {
    try {
      // Use Snowflake Cortex EMBED_TEXT_768 to generate embeddings
      const result = await sf.executeQuery(
        `SELECT SNOWFLAKE.CORTEX.EMBED_TEXT_768('multilingual-e5-small', ?) as embedding`,
        [chunk.chunkText]
      );

      if (result.rows.length > 0) {
        // Parse the embedding array from result
        const embeddingStr = result.rows[0].embedding;
        const embedding = typeof embeddingStr === "string"
          ? JSON.parse(embeddingStr)
          : embeddingStr;
        embeddings.push(Array.isArray(embedding) ? embedding : null);
      } else {
        embeddings.push(null);
      }
    } catch (error) {
      console.warn(`Embedding generation failed for chunk: ${error}`);
      embeddings.push(null); // Fail open - null embedding, chunk still stored
    }
  }

  return embeddings;
}

/**
 * Persist document metadata to DOCUMENTS table
 */
export async function persistDocument(
  state: IngestionState,
  sf: SnowflakeClient
): Promise<string> {
  const insertQuery = `
    INSERT INTO PUBLIC.DOCUMENTS (
      DOCUMENT_ID, CONTENT_HASH, FILE_NAME, FILE_TYPE, FILE_SIZE_BYTES,
      FULL_TEXT, PAGES_COUNT, TEXT_DENSITY, PARSING_METHOD,
      UPLOAD_USER_ID, STATUS
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    state.documentId,
    state.contentHash,
    state.fileName,
    state.fileType,
    state.buffer.length,
    state.fullText,
    state.chunks.length, // Use chunk count as proxy for pages
    state.textDensity,
    state.parsingMethod,
    state.userId,
    "extracted", // Status after text extraction
  ];

  try {
    await sf.executeQuery(insertQuery, params);
    return state.documentId;
  } catch (error) {
    throw new Error(
      `Failed to persist document: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Persist chunks with embeddings to DOCUMENT_CHUNKS table
 */
export async function persistChunks(
  documentId: string,
  chunks: SemanticChunk[],
  embeddings: (number[] | null)[],
  sf: SnowflakeClient
): Promise<number> {
  let insertedCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = embeddings[i];

    try {
      const insertQuery = `
        INSERT INTO PUBLIC.DOCUMENT_CHUNKS (
          DOCUMENT_ID, CHUNK_TEXT, CHUNK_INDEX, PAGE_NUMBER,
          SECTION_LABEL, CONTEXT_BEFORE, CONTEXT_AFTER,
          EMBEDDING, EMBEDDING_MODEL
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        documentId,
        chunk.chunkText,
        chunk.chunkIndex,
        chunk.pageNumber || 0,
        chunk.sectionLabel || null,
        chunk.contextBefore || null,
        chunk.contextAfter || null,
        embedding ? JSON.stringify(embedding) : null, // Store array as JSON string
        embedding ? "multilingual-e5-small" : null,
      ];

      await sf.executeQuery(insertQuery, params);
      insertedCount++;
    } catch (error) {
      console.warn(
        `Failed to persist chunk ${i}: ${error instanceof Error ? error.message : String(error)}`
      );
      // Continue with next chunk - fail open
    }
  }

  if (insertedCount === 0) {
    throw new Error("No chunks were persisted to database");
  }

  return insertedCount;
}

/**
 * Update document status to 'indexed' after successful ingestion
 */
export async function markDocumentIndexed(
  documentId: string,
  sf: SnowflakeClient
): Promise<void> {
  try {
    await sf.executeQuery(
      `UPDATE PUBLIC.DOCUMENTS
       SET STATUS = 'indexed', INDEXED_AT = CURRENT_TIMESTAMP()
       WHERE DOCUMENT_ID = ?`,
      [documentId]
    );
  } catch (error) {
    console.warn(`Failed to mark document as indexed: ${error}`);
    // Non-critical - continue
  }
}

/**
 * Complete ingestion workflow: persist all data and mark indexed
 */
export async function completeIngestion(
  state: IngestionState,
  sf: SnowflakeClient
): Promise<{
  documentId: string;
  chunksCount: number;
  status: "success" | "partial" | "failed";
  error?: string;
}> {
  try {
    // Check for duplicates
    const isDuplicate = await checkDuplicateInSnowflake(
      state.contentHash,
      sf
    );
    if (isDuplicate) {
      return {
        documentId: state.documentId,
        chunksCount: 0,
        status: "failed",
        error: "Document is a duplicate (same content hash)",
      };
    }

    // Generate embeddings for all chunks
    const embeddings = await generateChunkEmbeddings(state.chunks, sf);

    // Persist document
    const documentId = await persistDocument(state, sf);

    // Persist chunks
    const chunksCount = await persistChunks(documentId, state.chunks, embeddings, sf);

    // Mark as indexed
    await markDocumentIndexed(documentId, sf);

    return {
      documentId,
      chunksCount,
      status: "success",
    };
  } catch (error) {
    return {
      documentId: state.documentId,
      chunksCount: 0,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
