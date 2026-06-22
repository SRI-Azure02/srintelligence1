/**
 * Document extraction and chunking types
 */

export interface RawDocument {
  fileType: "pdf" | "docx" | "pptx";
  fileName: string;
  buffer: Buffer;
  textDensity: number;
  parsingMethod: "pdfmupdf" | "claude_vision";
}

export interface ExtractedContent {
  fullText: string;
  pageCount?: number;
  textDensity: number;
  parsingMethod: "pdfmupdf" | "claude_vision";
  extractedAt: Date;
  warnings?: string[];
}

export interface SemanticChunk {
  chunkText: string;
  chunkIndex: number;
  pageNumber: number | null;
  sectionLabel: string | null;
  contextBefore?: string; // 200-char context for overlap
  contextAfter?: string;
}

export interface DocumentChunk extends SemanticChunk {
  documentId?: string;
  embedding?: number[];
  embeddingModel?: string;
}

export interface RetrievedChunk {
  chunkId?: string;
  chunkText: string;
  pageNumber: number | null;
  sectionLabel: string | null;
  docName: string;
  fileType: string;
  similarity: number;
  contextBefore?: string;
  contextAfter?: string;
}

/**
 * Validation result for retrieved context
 */
export interface ValidationResult {
  isValid: boolean;
  relevanceScore: number; // 0-1.0
  coverageScore: number; // 0-1.0
  feedback: string;
  shouldRetry: boolean;
}

/**
 * Query routing result from Claude
 */
export interface QueryRoutingResult {
  originalQuery: string;
  finalQuery: string;
  corrections: Array<{
    type: "negation" | "type_conversion" | "keyword_expansion";
    original: string;
    corrected: string;
  }>;
}

/**
 * Generator response with citations
 */
export interface GeneratedResponse {
  answer: string;
  citations: Array<{
    source: string;
    pageNumber: number;
    section?: string;
    confidence: number;
  }>;
  confidence: number;
}
