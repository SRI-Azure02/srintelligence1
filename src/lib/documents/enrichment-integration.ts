import { buildDocumentContext, buildDocumentContextBlock } from "./chat-integration";

/**
 * Extended enrichMessage options with document retrieval
 */
export interface EnrichmentOptions {
  priorSQL?: string;
  semanticView?: string;
  enableDocuments?: boolean;
  executeQuery?: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
}

/**
 * Extend enrichMessage() to inject document context
 * This integrates the retrieval pipeline into agent prompt enrichment
 *
 * Usage:
 * const enriched = await enrichMessageWithDocuments(
 *   userMessage,
 *   intent,
 *   { enableDocuments: true, executeQuery: snowflakeClient.executeQuery }
 * );
 */
export async function enrichMessageWithDocuments(
  message: string,
  intent: string,
  opts: EnrichmentOptions = {}
): Promise<string> {
  const parts: string[] = [];

  // 1. Add existing enrichment context (prior SQL, semantic view, etc.)
  if (opts.priorSQL) {
    parts.push("PRIOR QUERY CONTEXT:");
    parts.push(opts.priorSQL);
    parts.push("");
  }

  // 2. Add document context if enabled and query executor available
  let documentContext = "";
  if (opts.enableDocuments && opts.executeQuery) {
    try {
      const context = await buildDocumentContext(message, opts.executeQuery);
      documentContext = buildDocumentContextBlock(context);

      if (documentContext) {
        parts.push(documentContext);
        parts.push("");
      }
    } catch (error) {
      // Fail open: document retrieval errors never block enrichment
      console.warn(
        `Document enrichment failed (continuing without): ${error}`
      );
    }
  }

  // 3. Add intent-specific context
  parts.push(`INTENT: ${intent}`);
  parts.push(`USER MESSAGE: ${message}`);

  // 4. Build final enriched prompt
  const enriched = parts.filter((p) => p.trim()).join("\n\n");

  return enriched;
}

/**
 * Check if document context should be enabled for an intent
 * Certain intents benefit more from document retrieval
 */
export function shouldEnableDocuments(intent: string): boolean {
  const documentIntents = [
    "analysis",
    "research",
    "investigation",
    "search",
    "lookup",
    "safety",
    "compliance",
    "regulatory",
    "clinical",
  ];

  return documentIntents.some((di) => intent.toLowerCase().includes(di));
}

/**
 * Build a context-aware enrichment with auto-detection
 */
export async function autoEnrichMessage(
  message: string,
  intent: string,
  opts: EnrichmentOptions = {}
): Promise<{ enriched: string; hasDocuments: boolean }> {
  const enableDocs =
    opts.enableDocuments !== false &&
    !!opts.executeQuery &&
    shouldEnableDocuments(intent);

  const enriched = await enrichMessageWithDocuments(message, intent, {
    ...opts,
    enableDocuments: enableDocs,
  });

  return {
    enriched,
    hasDocuments: enableDocs,
  };
}
