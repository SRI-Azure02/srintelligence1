import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface QueryRouterResult {
  originalQuery: string;
  finalQuery: string;
  corrections: Array<{
    type: "negation_fix" | "type_conversion" | "keyword_expansion" | "none";
    description: string;
  }>;
}

/**
 * Query Router: Improves user queries for better document retrieval
 * Applies three transformations:
 * 1. Negation fix: Converts "NOT X" → positive phrasing
 * 2. Type conversion: Passive voice → active voice
 * 3. Keyword expansion: Adds pharmaceutical/biotech domain terms
 */
export async function routeQuery(userQuery: string): Promise<QueryRouterResult> {
  try {
    const systemPrompt = `You are a pharmaceutical search query optimizer. Improve user queries for document retrieval.

Apply these transformations:
1. NEGATION FIX: Convert negative queries to positive.
   "Find drugs WITHOUT side effects" → "Find drugs with minimal side effects"

2. TYPE CONVERSION: Convert passive to active voice.
   "Side effects that are reported" → "What side effects are reported"

3. KEYWORD EXPANSION: Add domain-specific pharmaceutical terms.
   "Drug interactions" → "Drug interactions, contraindications, CYP450 inhibition, adverse events"

Return ONLY a JSON object with no markdown:
{
  "finalQuery": "improved query string",
  "corrections": [
    {"type": "negation_fix|type_conversion|keyword_expansion|none", "description": "what was changed"}
  ]
}`;

    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `Optimize this search query:\n\n"${userQuery}"`,
        },
      ],
      system: systemPrompt,
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "{}";
    const parsed = JSON.parse(responseText);

    return {
      originalQuery: userQuery,
      finalQuery: parsed.finalQuery || userQuery,
      corrections: parsed.corrections || [
        { type: "none", description: "Query already optimized" },
      ],
    };
  } catch (error) {
    // Fail open: return original query if routing fails
    console.warn(`Query routing failed: ${error}`);
    return {
      originalQuery: userQuery,
      finalQuery: userQuery,
      corrections: [
        { type: "none", description: "Routing unavailable, using original" },
      ],
    };
  }
}

/**
 * Extract keywords from query for hybrid search
 */
export function extractKeywords(query: string): string[] {
  const stopwords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "and",
    "or",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "from",
    "as",
    "be",
    "been",
    "being",
  ]);

  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length >= 2 && !stopwords.has(word))
    .slice(0, 10); // Limit to top 10 keywords
}
