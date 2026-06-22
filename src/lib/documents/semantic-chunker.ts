import Anthropic from "@anthropic-ai/sdk";
import { SemanticChunk } from "./extractors/types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface SemanticBoundary {
  start_idx: number;
  end_idx: number;
  label: string;
  confidence: number;
}

/**
 * Chunk text based on semantic boundaries identified by Claude Haiku
 * Instead of fixed-size windows, we identify topic shifts and section breaks
 *
 * Configuration:
 * - Chunk size: ~1500-2000 tokens (~6000-8000 chars)
 * - Overlap: 200 characters for context preservation
 * - Min chunk: 100 characters
 */
export async function semanticChunk(
  fullText: string,
  documentId: string
): Promise<SemanticChunk[]> {
  if (!fullText || fullText.trim().length === 0) {
    return [];
  }

  try {
    // Call Claude Haiku to identify semantic boundaries
    // Use a sample of the text to avoid token limits
    const textSample = fullText.substring(0, Math.min(12000, fullText.length));

    const message = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Identify semantic boundaries in this document text. Return ONLY a JSON array with no markdown.

Find natural breaking points: paragraph ends, section changes, topic shifts, new headings.

Text to analyze (${textSample.length} chars):
${textSample}${fullText.length > 12000 ? "\n\n[... rest of document ...]" : ""}

Return JSON array: [{"start_idx": 0, "end_idx": 150, "label": "Introduction"}, {"start_idx": 150, "end_idx": 500, "label": "Methods"}, ...]

CRITICAL: Return ONLY the JSON array, no other text or markdown code blocks.`,
        },
      ],
    });

    // Extract and parse the JSON response
    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "[]";
    const boundaries: SemanticBoundary[] = JSON.parse(responseText);

    if (!Array.isArray(boundaries) || boundaries.length === 0) {
      // Fallback: simple paragraph-based chunking
      return fallbackChunk(fullText);
    }

    // Build chunks from boundaries
    const chunks: SemanticChunk[] = [];

    for (let i = 0; i < boundaries.length; i++) {
      const boundary = boundaries[i];
      const nextBoundary = boundaries[i + 1];
      const endIdx = nextBoundary
        ? nextBoundary.start_idx
        : fullText.length;

      // Skip very small chunks
      if (endIdx - boundary.start_idx < 100) {
        continue;
      }

      const chunkText = fullText.substring(boundary.start_idx, endIdx);
      const contextBefore = fullText.substring(
        Math.max(0, boundary.start_idx - 200),
        boundary.start_idx
      );
      const contextAfter = fullText.substring(
        endIdx,
        Math.min(fullText.length, endIdx + 200)
      );

      // Estimate page number (rough heuristic)
      const charsPerPage = 2000;
      const pageNumber = Math.floor(boundary.start_idx / charsPerPage) + 1;

      chunks.push({
        chunkText,
        chunkIndex: chunks.length,
        pageNumber,
        sectionLabel: boundary.label,
        contextBefore: contextBefore.trim(),
        contextAfter: contextAfter.trim(),
      });
    }

    return chunks.length > 0 ? chunks : fallbackChunk(fullText);
  } catch (error) {
    console.warn(
      `Semantic chunking failed: ${error instanceof Error ? error.message : String(error)}, using fallback`
    );
    return fallbackChunk(fullText);
  }
}

/**
 * Fallback chunking when Claude is unavailable or fails
 * Uses simple paragraph-based breaking
 */
function fallbackChunk(fullText: string): SemanticChunk[] {
  const chunks: SemanticChunk[] = [];
  const paragraphs = fullText.split(/\n\n+/);

  let currentChunk = "";
  let chunkStart = 0;
  const charsPerPage = 2000;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();
    if (!para) continue;

    // Add to current chunk if it won't exceed size
    if ((currentChunk + para).length <= 8000) {
      currentChunk += (currentChunk ? "\n\n" : "") + para;
    } else {
      // Save current chunk and start new one
      if (currentChunk.length >= 100) {
        chunks.push({
          chunkText: currentChunk,
          chunkIndex: chunks.length,
          pageNumber: Math.floor(chunkStart / charsPerPage) + 1,
          sectionLabel: null,
          contextBefore: "",
          contextAfter: "",
        });
        chunkStart += currentChunk.length;
      }
      currentChunk = para;
    }
  }

  // Add final chunk
  if (currentChunk.length >= 100) {
    chunks.push({
      chunkText: currentChunk,
      chunkIndex: chunks.length,
      pageNumber: Math.floor(chunkStart / charsPerPage) + 1,
      sectionLabel: null,
      contextBefore: "",
      contextAfter: "",
    });
  }

  return chunks;
}
