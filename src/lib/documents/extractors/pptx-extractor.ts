import { Buffer } from "buffer";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { ExtractedContent, RawDocument } from "./types";

/**
 * Extract text from PPTX using pptx-parse library
 * PPTX files are ZIP archives containing XML, so we parse the slides
 */
export async function extractPptxText(
  document: RawDocument
): Promise<ExtractedContent> {
  if (document.fileType !== "pptx") {
    throw new Error("extractPptxText expects fileType='pptx'");
  }

  const tmpFile = path.join(os.tmpdir(), `pptx-${Date.now()}.pptx`);
  try {
    // pptx-text-parser expects a filepath, so write buffer to a temp file
    fs.writeFileSync(tmpFile, document.buffer);
    const { default: extractPptxFile } = await import("pptx-text-parser");
    const text = await extractPptxFile(tmpFile);

    // Validation: ensure we extracted meaningful text
    if (!text || text.length < 100) {
      throw new Error(
        "PPTX extraction resulted in less than 100 characters of text"
      );
    }

    return {
      fullText: text.trim(),
      pageCount: undefined,
      textDensity: document.textDensity,
      parsingMethod: "pdfmupdf",
      extractedAt: new Date(),
      warnings: [],
    };
  } catch (error) {
    throw new Error(
      `PPTX extraction failed: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

/**
 * For PPTX files with low text density (primarily visual slides),
 * fall back to Claude Vision.
 * This is handled by the caller (ingestion-agent.ts)
 */
export async function shouldUsePptxVision(textDensity: number): Promise<boolean> {
  return textDensity < 0.02;
}
