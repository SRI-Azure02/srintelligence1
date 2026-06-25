import { Buffer } from "buffer";
import { ExtractedContent, RawDocument } from "./types";

/**
 * Extract text from PDF using PyMuPDF approach
 * Uses unpdf library for serverless-safe PDF text extraction
 *
 * Note: This function uses unpdf dynamically to avoid issues with DOMMatrix
 * in serverless environments (unlike pdf-parse)
 */
export async function extractPdfText(
  document: RawDocument
): Promise<ExtractedContent> {
  if (document.fileType !== "pdf") {
    throw new Error("extractPdfText expects fileType='pdf'");
  }

  try {
    // Dynamically import unpdf to avoid serverless issues
    const { getDocumentProxy, extractText } = await import("unpdf");

    // Get document proxy from buffer
    const pdf = await getDocumentProxy(new Uint8Array(document.buffer));

    // Extract text with merged pages — returns { totalPages, text } when mergePages: true
    const extracted = await extractText(pdf, {
      mergePages: true,
    });
    const text = (extracted as { totalPages: number; text: string }).text ?? (extracted as unknown as string);

    // Validation: ensure we extracted meaningful text
    if (!text || String(text).trim().length < 100) {
      throw new Error(
        "PDF extraction resulted in less than 100 characters of text"
      );
    }

    return {
      fullText: String(text),
      pageCount: pdf.numPages || undefined,
      textDensity: document.textDensity,
      parsingMethod: "pdfmupdf",
      extractedAt: new Date(),
      warnings: [],
    };
  } catch (error) {
    throw new Error(`PDF extraction failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * For sparse PDFs (low text density), fall back to Claude Vision
 * This is handled by the caller (ingestion-agent.ts)
 */
export async function shouldUsePdfVision(textDensity: number): Promise<boolean> {
  return textDensity < 0.02;
}
