import { Buffer } from "buffer";
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

  try {
    // Dynamically import pptx-parse
    const pptxParser = await import("pptx-parse");

    // Parse PPTX from buffer
    const prs = await pptxParser.default.toJson(document.buffer);

    // Extract text from all slides
    const textParts: string[] = [];

    if (prs.slides && Array.isArray(prs.slides)) {
      for (let i = 0; i < prs.slides.length; i++) {
        const slide = prs.slides[i];
        textParts.push(`\n--- Slide ${i + 1} ---\n`);

        // Extract text from shapes on slide
        if (slide.shapes && Array.isArray(slide.shapes)) {
          for (const shape of slide.shapes) {
            if (shape.text) {
              textParts.push(shape.text);
            }
          }
        }
      }
    }

    const text = textParts.join("\n").trim();

    // Validation: ensure we extracted meaningful text
    if (!text || text.length < 100) {
      throw new Error(
        "PPTX extraction resulted in less than 100 characters of text"
      );
    }

    return {
      fullText: text,
      pageCount: prs.slides?.length || undefined,
      textDensity: document.textDensity,
      parsingMethod: "pdfmupdf",
      extractedAt: new Date(),
      warnings: [],
    };
  } catch (error) {
    throw new Error(
      `PPTX extraction failed: ${error instanceof Error ? error.message : String(error)}`
    );
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
