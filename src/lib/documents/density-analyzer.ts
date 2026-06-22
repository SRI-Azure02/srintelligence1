import { Buffer } from "buffer";

export interface TextDensityResult {
  density: number;
  strategy: "pdfmupdf" | "claude_vision";
  confidence: number;
  pageBreakdown?: Array<{
    pageNum: number;
    density: number;
    strategy: "pdfmupdf" | "claude_vision";
  }>;
}

/**
 * Analyzes text density in a PDF to determine parsing strategy.
 * Threshold: 0.02
 * - Density > 0.02: Use PyMuPDF (text-dense, zero API cost)
 * - Density < 0.02: Use Claude Vision (charts, handwriting, images)
 */
export async function analyzeTextDensity(
  buffer: Buffer,
  fileType: "pdf" | "docx" | "pptx"
): Promise<TextDensityResult> {
  // For non-PDFs, default to pdfmupdf equivalent (text extraction)
  if (fileType !== "pdf") {
    const textCount = (buffer.toString().match(/[a-zA-Z0-9]/g) || []).length;
    const density = buffer.length > 0 ? textCount / buffer.length : 0;

    return {
      density,
      strategy: density > 0.02 ? "pdfmupdf" : "claude_vision",
      confidence: 0.8,
    };
  }

  // For PDFs, analyze text density
  // Text density = (count of text characters) / (total bytes)
  // Rough heuristic: PDFs with high text ratio are text-dense
  const textChars = (buffer.toString("utf8", 0, Math.min(100000, buffer.length)).match(
    /[a-zA-Z0-9\s]/g
  ) || []).length;

  const sampleSize = Math.min(100000, buffer.length);
  const density = sampleSize > 0 ? textChars / sampleSize : 0;

  // Threshold: 0.02
  const threshold = 0.02;
  const strategy = density > threshold ? "pdfmupdf" : "claude_vision";

  return {
    density: Math.round(density * 1000) / 1000, // Round to 3 decimals
    strategy,
    confidence: 0.85, // Heuristic is reasonably confident
    pageBreakdown: [
      {
        pageNum: 1,
        density: Math.round(density * 1000) / 1000,
        strategy,
      },
    ],
  };
}

/**
 * Determines if a PDF should be parsed with vision (charts, handwriting, images)
 * or text extraction (dense text).
 */
export function shouldUseVision(density: number): boolean {
  return density < 0.02;
}

/**
 * Determines parsing method name for logging/audit
 */
export function getParsingSterategyName(density: number): string {
  return shouldUseVision(density) ? "claude_vision" : "pdfmupdf";
}
