import Anthropic from "@anthropic-ai/sdk";
import { RetrievedChunk } from "./hybrid-search";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ValidationResult {
  isValid: boolean;
  relevanceScore: number; // 0-1.0
  coverageScore: number; // 0-1.0
  shouldRetry: boolean; // True if both scores < 0.6
  feedback: string;
}

/**
 * Validator Agent: Verifies retrieved context quality
 * Uses Claude Opus (most capable) to judge relevance and coverage
 *
 * Relevance: Do chunks answer the user's question?
 * Coverage: Do chunks provide complete information?
 *
 * Retry logic: If EITHER score < 0.6, trigger query refinement
 */
export async function validateContext(
  userQuery: string,
  chunks: RetrievedChunk[]
): Promise<ValidationResult> {
  try {
    if (chunks.length === 0) {
      return {
        isValid: false,
        relevanceScore: 0.0,
        coverageScore: 0.0,
        shouldRetry: true,
        feedback: "No documents retrieved. Retry with expanded keywords.",
      };
    }

    const systemPrompt = `You are a retrieval quality validator for pharmaceutical document search.

Rate the retrieved documents on:
1. RELEVANCE (0-1.0): Do chunks directly answer the user's question?
2. COVERAGE (0-1.0): Do chunks provide complete/sufficient information?

Return ONLY a JSON object:
{
  "relevanceScore": 0.0-1.0,
  "coverageScore": 0.0-1.0,
  "feedback": "brief explanation"
}`;

    const chunksText = chunks
      .slice(0, 5)
      .map((c, i) => `[Doc ${i + 1}: ${c.docName} p.${c.pageNumber}]\n${c.chunkText.substring(0, 300)}...`)
      .join("\n\n");

    const message = await anthropic.messages.create({
      model: "claude-3-opus-20250729",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `User query: "${userQuery}"\n\nRetrieved documents:\n${chunksText}`,
        },
      ],
      system: systemPrompt,
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "{}";
    const parsed = JSON.parse(responseText);

    const relevance = Math.min(1.0, Math.max(0, parsed.relevanceScore || 0));
    const coverage = Math.min(1.0, Math.max(0, parsed.coverageScore || 0));

    return {
      isValid: relevance >= 0.6 && coverage >= 0.6,
      relevanceScore: relevance,
      coverageScore: coverage,
      shouldRetry: relevance < 0.6 || coverage < 0.6,
      feedback:
        parsed.feedback || "Validation complete. Consider query refinement.",
    };
  } catch (error) {
    console.warn(`Validation failed: ${error}`);
    // Fail open: accept the results even if validation fails
    return {
      isValid: chunks.length > 0,
      relevanceScore: chunks.length > 0 ? 0.5 : 0.0,
      coverageScore: chunks.length > 0 ? 0.5 : 0.0,
      shouldRetry: chunks.length === 0,
      feedback: "Validation unavailable. Using retrieved documents as-is.",
    };
  }
}

/**
 * Refine query based on validation feedback
 * Suggests alternative search terms when validation fails
 */
export async function refineQuery(
  originalQuery: string,
  feedback: string,
  cycle: number
): Promise<string> {
  try {
    const systemPrompt = `You are a search query refinement expert for pharmaceutical documents.

Given feedback on retrieved documents, suggest an improved query.
Focus on: alternative keywords, broader scope, specific medical terms.

Return ONLY the refined query string, nothing else.`;

    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content: `Original query: "${originalQuery}"\nValidation feedback: ${feedback}\nRefinement attempt: ${cycle}/3\n\nSuggest an improved query:`,
        },
      ],
      system: systemPrompt,
    });

    return message.content[0].type === "text"
      ? message.content[0].text.trim()
      : originalQuery;
  } catch (error) {
    console.warn(`Query refinement failed: ${error}`);
    // Fail open: return original query
    return originalQuery;
  }
}
