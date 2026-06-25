import Anthropic from "@anthropic-ai/sdk";
import { StateGraph, Annotation } from "@langchain/langgraph";
import crypto from "crypto";
import { Buffer } from "buffer";
import { analyzeTextDensity } from "./density-analyzer";
import { extractPdfText } from "./extractors/pdf-extractor";
import { extractDocxText } from "./extractors/docx-extractor";
import { extractPptxText } from "./extractors/pptx-extractor";
import { semanticChunk } from "./semantic-chunker";
import {
  RawDocument,
  ExtractedContent,
  SemanticChunk,
} from "./extractors/types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const IngestionAnnotation = Annotation.Root({
  documentId: Annotation<string>({ reducer: (_, y) => y, default: () => "" }),
  buffer: Annotation<Buffer>({ reducer: (_, y) => y, default: () => Buffer.alloc(0) }),
  fileType: Annotation<"pdf" | "docx" | "pptx">({ reducer: (_, y) => y, default: () => "pdf" }),
  fileName: Annotation<string>({ reducer: (_, y) => y, default: () => "" }),
  userId: Annotation<string>({ reducer: (_, y) => y, default: () => "" }),
  textDensity: Annotation<number>({ reducer: (_, y) => y, default: () => 0 }),
  parsingMethod: Annotation<"pdfmupdf" | "claude_vision">({ reducer: (_, y) => y, default: () => "pdfmupdf" }),
  fullText: Annotation<string>({ reducer: (_, y) => y, default: () => "" }),
  contentHash: Annotation<string>({ reducer: (_, y) => y, default: () => "" }),
  isDuplicate: Annotation<boolean>({ reducer: (_, y) => y, default: () => false }),
  chunks: Annotation<SemanticChunk[]>({ reducer: (_, y) => y, default: () => [] }),
  embeddings: Annotation<(number[] | null)[]>({ reducer: (_, y) => y, default: () => [] }),
  status: Annotation<"pending" | "extracted" | "chunked" | "embedded" | "persisted" | "failed">({ reducer: (_, y) => y, default: () => "pending" }),
  error: Annotation<string | null>({ reducer: (_, y) => y, default: () => null }),
  errorDetails: Annotation<string | undefined>({ reducer: (_, y) => y, default: () => undefined }),
});

export type IngestionState = typeof IngestionAnnotation.State;

/**
 * Step 1: Analyze text density to determine extraction method
 */
async function analyzeDensity(state: IngestionState): Promise<IngestionState> {
  try {
    const result = await analyzeTextDensity(state.buffer, state.fileType);
    return {
      ...state,
      textDensity: result.density,
      parsingMethod: result.strategy,
    };
  } catch (error) {
    return {
      ...state,
      status: "failed",
      error: "Density analysis failed",
      errorDetails: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Step 2: Extract text using appropriate method (PyMuPDF or Claude Vision)
 */
async function extractText(state: IngestionState): Promise<IngestionState> {
  if (state.status === "failed") return state;

  try {
    const rawDoc: RawDocument = {
      fileType: state.fileType,
      fileName: state.fileName,
      buffer: state.buffer,
      textDensity: state.textDensity,
      parsingMethod: state.parsingMethod,
    };

    let extracted: ExtractedContent;

    if (state.fileType === "pdf") {
      extracted = await extractPdfText(rawDoc);
    } else if (state.fileType === "docx") {
      extracted = await extractDocxText(rawDoc);
    } else if (state.fileType === "pptx") {
      extracted = await extractPptxText(rawDoc);
    } else {
      throw new Error(`Unsupported file type: ${state.fileType}`);
    }

    // Validate extraction
    if (!extracted.fullText || extracted.fullText.trim().length < 100) {
      throw new Error("Extracted text is too short or empty");
    }

    return {
      ...state,
      fullText: extracted.fullText,
      status: "extracted",
    };
  } catch (error) {
    return {
      ...state,
      status: "failed",
      error: "Text extraction failed",
      errorDetails: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Step 3: Perform semantic chunking
 */
async function performSemanticChunking(
  state: IngestionState
): Promise<IngestionState> {
  if (state.status === "failed") return state;

  try {
    const chunks = await semanticChunk(state.fullText, state.documentId);

    if (chunks.length === 0) {
      throw new Error("No chunks produced by semantic chunker");
    }

    return {
      ...state,
      chunks,
      status: "chunked",
    };
  } catch (error) {
    return {
      ...state,
      status: "failed",
      error: "Semantic chunking failed",
      errorDetails: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Step 4: Check for duplicates using SHA256 content hash
 */
async function checkDuplicate(state: IngestionState): Promise<IngestionState> {
  if (state.status === "failed") return state;

  try {
    const contentHash = crypto
      .createHash("sha256")
      .update(state.fullText)
      .digest("hex");

    // In Phase 2, we're just calculating the hash here.
    // Phase 3 will add database checks.
    return {
      ...state,
      contentHash,
      isDuplicate: false, // Will be checked against DB in persistence
    };
  } catch (error) {
    return {
      ...state,
      status: "failed",
      error: "Deduplication check failed",
      errorDetails: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Step 5: Generate embeddings using Snowflake Cortex EMBED_TEXT_768
 * (Placeholder - actual implementation will use Snowflake SQL API)
 */
async function generateEmbeddings(
  state: IngestionState
): Promise<IngestionState> {
  if (state.status === "failed") return state;

  try {
    // Phase 2 placeholder: embeddings will be generated during persistence
    // via Snowflake's EMBED_TEXT_768 function
    const embeddings: (number[] | null)[] = state.chunks.map(() => null);

    return {
      ...state,
      embeddings,
      status: "embedded",
    };
  } catch (error) {
    return {
      ...state,
      status: "failed",
      error: "Embedding generation failed",
      errorDetails: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Create the LangGraph state machine for ingestion
 */
export async function createIngestionGraph() {
  return new StateGraph(IngestionAnnotation)
    .addNode("analyze_density", analyzeDensity)
    .addNode("extract_text", extractText)
    .addNode("semantic_chunk", performSemanticChunking)
    .addNode("check_duplicate", checkDuplicate)
    .addNode("generate_embeddings", generateEmbeddings)
    .addEdge("__start__", "analyze_density")
    .addEdge("analyze_density", "extract_text")
    .addEdge("extract_text", "semantic_chunk")
    .addEdge("semantic_chunk", "check_duplicate")
    .addEdge("check_duplicate", "generate_embeddings")
    .compile();
}

/**
 * Initialize ingestion state for a document
 */
export function createInitialState(
  buffer: Buffer,
  fileType: "pdf" | "docx" | "pptx",
  fileName: string,
  userId: string
): IngestionState {
  return {
    documentId: crypto.randomUUID(),
    buffer,
    fileType,
    fileName,
    userId,
    textDensity: 0,
    parsingMethod: "pdfmupdf",
    fullText: "",
    contentHash: "",
    isDuplicate: false,
    chunks: [],
    embeddings: [],
    status: "pending",
    error: null,
    errorDetails: undefined,
  };
}
