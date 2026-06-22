import { Buffer } from "buffer";
import { ExtractedContent, RawDocument } from "./types";

/**
 * Extract text from DOCX using mammoth library
 * Mammoth converts .docx (Office Open XML) to HTML/text
 */
export async function extractDocxText(
  document: RawDocument
): Promise<ExtractedContent> {
  if (document.fileType !== "docx") {
    throw new Error("extractDocxText expects fileType='docx'");
  }

  try {
    // Dynamically import mammoth
    const mammoth = await import("mammoth");

    // Extract text and HTML from buffer
    const result = await mammoth.extractRawText({ buffer: document.buffer });

    const text = result.value;

    // Validation: ensure we extracted meaningful text
    if (!text || text.trim().length < 100) {
      throw new Error(
        "DOCX extraction resulted in less than 100 characters of text"
      );
    }

    return {
      fullText: text,
      pageCount: undefined, // DOCX doesn't have traditional pages
      textDensity: document.textDensity,
      parsingMethod: "pdfmupdf",
      extractedAt: new Date(),
      warnings: result.messages.length > 0 ? result.messages.map((m: any) => m.message) : [],
    };
  } catch (error) {
    throw new Error(
      `DOCX extraction failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * For DOCX files with low text density (e.g., primarily images/handwriting),
 * fall back to Claude Vision.
 * This is handled by the caller (ingestion-agent.ts)
 */
export async function shouldUseDocxVision(textDensity: number): Promise<boolean> {
  return textDensity < 0.02;
}
