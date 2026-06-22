import { describe, it, expect } from "vitest";
import { Buffer } from "buffer";
import {
  analyzeTextDensity,
  shouldUseVision,
  getParsingSterategyName,
} from "./density-analyzer";

describe("analyzeTextDensity", () => {
  it("should classify high-density PDFs as text extraction", async () => {
    // High text density buffer (lots of alphanumeric chars)
    const textDenseContent = "This is a text-dense PDF with lots of words. ".repeat(50);
    const buffer = Buffer.from(textDenseContent, "utf8");

    const result = await analyzeTextDensity(buffer, "pdf");

    expect(result.strategy).toBe("pdfmupdf");
    expect(result.density).toBeGreaterThan(0.02);
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("should classify low-density PDFs as vision extraction", async () => {
    // Low text density (mostly non-alphanumeric characters)
    const imageDenseContent = "!@#$%^&*()_-+=[]{}|;:,.<>?/ ".repeat(50);
    const buffer = Buffer.from(imageDenseContent, "utf8");

    const result = await analyzeTextDensity(buffer, "pdf");

    expect(result.strategy).toBe("claude_vision");
    expect(result.density).toBeLessThan(0.02);
  });

  it("should handle DOCX files", async () => {
    const docxContent = "Sample DOCX content with text. ".repeat(20);
    const buffer = Buffer.from(docxContent, "utf8");

    const result = await analyzeTextDensity(buffer, "docx");

    expect(result.strategy).toMatch(/pdfmupdf|claude_vision/);
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("should handle PPTX files", async () => {
    const pptxContent = "Slide title and content. ".repeat(20);
    const buffer = Buffer.from(pptxContent, "utf8");

    const result = await analyzeTextDensity(buffer, "pptx");

    expect(result.strategy).toMatch(/pdfmupdf|claude_vision/);
    expect(result.density).toBeGreaterThanOrEqual(0);
  });

  it("should include page breakdown for analysis", async () => {
    const textContent = "Page content here. ".repeat(20);
    const buffer = Buffer.from(textContent, "utf8");

    const result = await analyzeTextDensity(buffer, "pdf");

    expect(result.pageBreakdown).toBeDefined();
    expect(Array.isArray(result.pageBreakdown)).toBe(true);
    if (result.pageBreakdown) {
      expect(result.pageBreakdown[0]).toHaveProperty("pageNum");
      expect(result.pageBreakdown[0]).toHaveProperty("density");
      expect(result.pageBreakdown[0]).toHaveProperty("strategy");
    }
  });

  it("should round density to 3 decimal places", async () => {
    const buffer = Buffer.from("Text content. ".repeat(30), "utf8");

    const result = await analyzeTextDensity(buffer, "pdf");

    const decimalPlaces = (result.density.toString().split(".")[1] || "").length;
    expect(decimalPlaces).toBeLessThanOrEqual(3);
  });
});

describe("shouldUseVision", () => {
  it("should return true for density < 0.02", () => {
    expect(shouldUseVision(0.01)).toBe(true);
    expect(shouldUseVision(0.019)).toBe(true);
  });

  it("should return false for density >= 0.02", () => {
    expect(shouldUseVision(0.02)).toBe(false);
    expect(shouldUseVision(0.03)).toBe(false);
    expect(shouldUseVision(0.5)).toBe(false);
  });

  it("should return false for high density", () => {
    expect(shouldUseVision(0.8)).toBe(false);
  });
});

describe("getParsingSterategyName", () => {
  it("should return claude_vision for low density", () => {
    expect(getParsingSterategyName(0.01)).toBe("claude_vision");
  });

  it("should return pdfmupdf for high density", () => {
    expect(getParsingSterategyName(0.03)).toBe("pdfmupdf");
    expect(getParsingSterategyName(0.5)).toBe("pdfmupdf");
  });

  it("should use threshold of 0.02", () => {
    // At threshold
    expect(getParsingSterategyName(0.02)).toBe("pdfmupdf");
    // Just below threshold
    expect(getParsingSterategyName(0.019999)).toBe("claude_vision");
  });
});
