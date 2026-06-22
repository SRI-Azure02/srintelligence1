import { RetrievedChunk } from "./hybrid-search";
import { executeRetrieval } from "./retrieval-orchestrator";

/**
 * Document-enriched chat context
 * Injected into agent prompts to provide document-grounded answers
 */
export interface DocumentContext {
  hasDocuments: boolean;
  chunks: RetrievedChunk[];
  citationFormat: string; // "[doc: filename, p.N]"
  instructions: string;
}

/**
 * Build document context for injection into agent prompts
 * Formats retrieved chunks with proper citations
 */
export async function buildDocumentContext(
  userMessage: string,
  executeQuery: (sql: string, params?: any[]) => Promise<{ rows: any[] }>
): Promise<DocumentContext> {
  try {
    // Execute hybrid retrieval with 3-cycle optimization
    const result = await executeRetrieval(userMessage, executeQuery);

    if (result.chunks.length === 0) {
      return {
        hasDocuments: false,
        chunks: [],
        citationFormat: "",
        instructions: "",
      };
    }

    // Format chunks with proper citations
    const formattedChunks = result.chunks.map((chunk) => ({
      ...chunk,
      citationFormat: `[doc: ${chunk.docName}, p.${chunk.pageNumber}${
        chunk.sectionLabel ? ", " + chunk.sectionLabel : ""
      }]`,
    }));

    // Build system instructions for agent
    const instructions = buildDocumentInstructions(
      formattedChunks,
      result.validation
    );

    return {
      hasDocuments: true,
      chunks: result.chunks,
      citationFormat: formattedChunks
        .map((c) => c.citationFormat)
        .join("\n"),
      instructions,
    };
  } catch (error) {
    // Fail open: return empty context, never block chat
    console.warn(`Document context build failed: ${error}`);
    return {
      hasDocuments: false,
      chunks: [],
      citationFormat: "",
      instructions: "",
    };
  }
}

/**
 * Build system instructions for agent to use document context
 */
function buildDocumentInstructions(
  chunks: Array<RetrievedChunk & { citationFormat: string }>,
  validation: any
): string {
  if (chunks.length === 0) {
    return "";
  }

  const parts: string[] = [
    "DOCUMENT CONTEXT AVAILABLE:",
    `${chunks.length} relevant document chunks retrieved from uploaded pharmaceutical documents.`,
    "",
    "CITATION REQUIREMENT:",
    "When answering based on these documents, ALWAYS cite the source in this format:",
    "[doc: filename, p.PAGE_NUMBER, section]",
    "",
    "RETRIEVED DOCUMENTS:",
  ];

  // Add document summaries with citations
  chunks.forEach((chunk, idx) => {
    parts.push(`\n[${idx + 1}] ${chunk.citationFormat}`);
    parts.push(`Document: ${chunk.docName} (${chunk.fileType})`);
    parts.push(`Section: ${chunk.sectionLabel || "N/A"}`);
    parts.push(`Content: ${chunk.chunkText.substring(0, 300)}...`);
  });

  // Add validation confidence if available
  if (validation && (validation.relevanceScore || validation.coverageScore)) {
    parts.push("");
    parts.push("VALIDATION CONFIDENCE:");
    parts.push(
      `Relevance: ${(validation.relevanceScore * 100).toFixed(0)}% | ` +
        `Coverage: ${(validation.coverageScore * 100).toFixed(0)}%`
    );
  }

  parts.push("");
  parts.push("INSTRUCTIONS:");
  parts.push(
    "1. Prioritize information from these documents when answering questions"
  );
  parts.push("2. Always cite the exact page number and section");
  parts.push("3. If asked about content not in these documents, state explicitly");
  parts.push("4. If documents don't cover the query, use your general knowledge");
  parts.push("5. Never make up citations - only cite documents provided");

  return parts.join("\n");
}

/**
 * Extract citations from agent response
 * Validates that cited documents match retrieved chunks
 */
export function extractCitations(
  response: string,
  retrievedChunks: RetrievedChunk[]
): Array<{
  citation: string;
  filename: string;
  page: number;
  isValid: boolean;
}> {
  const citationRegex = /\[doc:\s*([^,]+),\s*p\.(\d+)(?:,\s*([^\]]+))?\]/g;
  const citations: Array<{
    citation: string;
    filename: string;
    page: number;
    isValid: boolean;
  }> = [];

  let match;
  while ((match = citationRegex.exec(response)) !== null) {
    const filename = match[1].trim();
    const page = parseInt(match[2], 10);
    const section = match[3]?.trim();

    // Validate citation against retrieved chunks
    const isValid = retrievedChunks.some(
      (chunk) =>
        chunk.docName.toLowerCase().includes(filename.toLowerCase()) &&
        chunk.pageNumber === page
    );

    citations.push({
      citation: match[0],
      filename,
      page,
      isValid,
    });
  }

  return citations;
}

/**
 * Validate agent response for proper citations
 * Returns feedback if citations are missing or invalid
 */
export function validateResponseCitations(
  response: string,
  retrievedChunks: RetrievedChunk[]
): {
  isValid: boolean;
  missingCitations: number;
  invalidCitations: number;
  feedback: string;
} {
  if (retrievedChunks.length === 0) {
    return {
      isValid: true,
      missingCitations: 0,
      invalidCitations: 0,
      feedback: "No documents provided, citations not required.",
    };
  }

  const citations = extractCitations(response, retrievedChunks);
  const invalidCitations = citations.filter((c) => !c.isValid).length;

  // Heuristic: If response references documents, should have citations
  const hasDocReferences = /document|paper|study|research|found|showed/i.test(
    response
  );
  const missingCitations = hasDocReferences && citations.length === 0 ? 1 : 0;

  const isValid = invalidCitations === 0 && missingCitations === 0;

  const feedback = [
    isValid ? "✓ Citations valid" : "✗ Citation issues detected",
    invalidCitations > 0
      ? `Invalid citations: ${invalidCitations}`
      : "All citations valid",
    missingCitations > 0
      ? "Missing citations for document references"
      : "Citations complete",
  ]
    .filter((f) => f && !f.startsWith("✓"))
    .join(" | ");

  return {
    isValid,
    missingCitations,
    invalidCitations,
    feedback: feedback || "Citations valid",
  };
}

/**
 * Prepare document context string for enrichMessage() injection
 */
export function buildDocumentContextBlock(
  context: DocumentContext
): string {
  if (!context.hasDocuments) {
    return "";
  }

  const parts = [
    "=== DOCUMENT CONTEXT ===",
    context.instructions,
    "=== END DOCUMENT CONTEXT ===",
  ];

  return parts.join("\n\n");
}
